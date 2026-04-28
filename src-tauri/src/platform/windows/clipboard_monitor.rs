use std::sync::Arc;

use tauri::Emitter;

use crate::{
    models::{ClipboardContent, ClipboardPayload},
    store::{sqlite_store::compute_hash, SqliteStore},
};

/// Start the Windows clipboard monitor. Spawns two threads:
/// 1. A Win32 message pump thread that listens for WM_CLIPBOARDUPDATE
/// 2. A processor thread that reads the clipboard and saves to the store
pub fn start(app_handle: tauri::AppHandle, store: Arc<SqliteStore>) {
    let (trigger_tx, trigger_rx) = std::sync::mpsc::channel::<()>();

    // Thread 1: Win32 message pump
    std::thread::Builder::new()
        .name("clipboard-win32-pump".into())
        .spawn(move || {
            run_message_pump(trigger_tx);
        })
        .expect("Failed to spawn clipboard monitor thread");

    // Thread 2: Clipboard processor
    std::thread::Builder::new()
        .name("clipboard-processor".into())
        .spawn(move || {
            while trigger_rx.recv().is_ok() {
                process_clipboard_change(&app_handle, &store);
            }
        })
        .expect("Failed to spawn clipboard processor thread");
}

fn process_clipboard_change(app_handle: &tauri::AppHandle, store: &Arc<SqliteStore>) {
    let payload = match read_clipboard() {
        Ok(Some(p)) => p,
        Ok(None) => return, // empty or unsupported format
        Err(e) => {
            tracing::warn!("Failed to read clipboard: {}", e);
            return;
        }
    };

    if let Err(e) = store.save_entry(&payload) {
        tracing::error!("Failed to save clipboard entry: {}", e);
        return;
    }

    if let Err(e) = app_handle.emit("clipboard-changed", ()) {
        tracing::warn!("Failed to emit clipboard-changed event: {}", e);
    }
}

fn read_clipboard() -> Result<Option<ClipboardPayload>, Box<dyn std::error::Error + Send + Sync>> {
    let mut clipboard = arboard::Clipboard::new()?;

    // Try text first
    if let Ok(text) = clipboard.get_text() {
        if text.trim().is_empty() {
            return Ok(None);
        }
        let hash = compute_hash(text.as_bytes());
        return Ok(Some(ClipboardPayload {
            hash,
            content: ClipboardContent::Text(text),
            source_app: None,
        }));
    }

    // Try image
    if let Ok(img) = clipboard.get_image() {
        let hash = compute_hash(&img.bytes);
        return Ok(Some(ClipboardPayload {
            hash,
            content: ClipboardContent::Image {
                rgba_bytes: img.bytes.into_owned(),
                width: img.width as u32,
                height: img.height as u32,
            },
            source_app: None,
        }));
    }

    Ok(None)
}

// ── Win32 message pump ──────────────────────────────────────────────────────

use windows::Win32::{
    Foundation::{HINSTANCE, HWND, LPARAM, LRESULT, WPARAM},
    System::{DataExchange::AddClipboardFormatListener, LibraryLoader::GetModuleHandleW},
    UI::WindowsAndMessaging::{
        CreateWindowExW, DefWindowProcW, DispatchMessageW, GetMessageW, PostQuitMessage,
        RegisterClassExW, TranslateMessage, HWND_MESSAGE, MSG, WINDOW_EX_STYLE, WINDOW_STYLE,
        WM_CLIPBOARDUPDATE, WM_DESTROY, WNDCLASSEXW,
    },
};

thread_local! {
    static TRIGGER_TX: std::cell::RefCell<Option<std::sync::mpsc::Sender<()>>> =
        std::cell::RefCell::new(None);
}

fn run_message_pump(trigger_tx: std::sync::mpsc::Sender<()>) {
    TRIGGER_TX.with(|cell| {
        *cell.borrow_mut() = Some(trigger_tx);
    });

    unsafe {
        let hmodule = GetModuleHandleW(None).expect("GetModuleHandleW failed");
        let hinstance: HINSTANCE = hmodule.into();

        let class_name = windows::core::w!("ClipboardManagerMsgWnd");

        let wc = WNDCLASSEXW {
            cbSize: std::mem::size_of::<WNDCLASSEXW>() as u32,
            lpfnWndProc: Some(wnd_proc),
            hInstance: hinstance,
            lpszClassName: class_name,
            ..Default::default()
        };

        RegisterClassExW(&wc);

        let hwnd = CreateWindowExW(
            WINDOW_EX_STYLE::default(),
            class_name,
            windows::core::w!(""),
            WINDOW_STYLE::default(),
            0,
            0,
            0,
            0,
            HWND_MESSAGE,
            None,
            hinstance,
            None,
        )
        .expect("CreateWindowExW failed");

        AddClipboardFormatListener(hwnd).expect("AddClipboardFormatListener failed");

        let mut msg = MSG::default();
        while GetMessageW(&mut msg, None, 0, 0).as_bool() {
            let _ = TranslateMessage(&msg);
            DispatchMessageW(&msg);
        }
    }
}

unsafe extern "system" fn wnd_proc(
    hwnd: HWND,
    msg: u32,
    wparam: WPARAM,
    lparam: LPARAM,
) -> LRESULT {
    match msg {
        WM_CLIPBOARDUPDATE => {
            TRIGGER_TX.with(|cell| {
                if let Some(tx) = cell.borrow().as_ref() {
                    let _ = tx.send(());
                }
            });
            LRESULT(0)
        }
        WM_DESTROY => {
            PostQuitMessage(0);
            LRESULT(0)
        }
        _ => DefWindowProcW(hwnd, msg, wparam, lparam),
    }
}
