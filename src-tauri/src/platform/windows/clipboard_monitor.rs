use std::sync::Arc;

use tauri::Emitter;

use crate::{
    models::{ClipboardContent, ClipboardPayload},
    store::{sqlite_store::compute_hash, SqliteStore},
    PauseCapture,
};

/// Start the Windows clipboard monitor. Spawns two threads:
/// 1. A Win32 message pump thread that listens for WM_CLIPBOARDUPDATE
/// 2. A processor thread that reads the clipboard and saves to the store
pub fn start(app_handle: tauri::AppHandle, store: Arc<SqliteStore>, pause_capture: Arc<PauseCapture>) {
    let (trigger_tx, trigger_rx) = std::sync::mpsc::channel::<Option<String>>();

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
            while let Ok(source_app) = trigger_rx.recv() {
                process_clipboard_change(&app_handle, &store, source_app, &pause_capture);
            }
        })
        .expect("Failed to spawn clipboard processor thread");
}

fn process_clipboard_change(
    app_handle: &tauri::AppHandle,
    store: &Arc<SqliteStore>,
    source_app: Option<String>,
    pause_capture: &Arc<PauseCapture>,
) {
    use std::sync::atomic::Ordering;

    if pause_capture.paused.load(Ordering::Relaxed) {
        return;
    }

    if let Some(ref proc) = source_app {
        if store.is_app_excluded(proc).unwrap_or(false) {
            return;
        }
    }

    let mut payload = match read_clipboard() {
        Ok(Some(p)) => p,
        Ok(None) => return, // empty or unsupported format
        Err(e) => {
            tracing::warn!("Failed to read clipboard: {}", e);
            return;
        }
    };

    payload.source_app = source_app;

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

fn get_foreground_process_name() -> Option<String> {
    let hwnd = unsafe { GetForegroundWindow() };
    if hwnd.is_invalid() {
        return None;
    }
    let mut pid: u32 = 0;
    let thread_id = unsafe { GetWindowThreadProcessId(hwnd, Some(&mut pid)) };
    if thread_id == 0 {
        return None;
    }
    unsafe {
        let handle = OpenProcess(PROCESS_QUERY_INFORMATION | PROCESS_VM_READ, false, pid).ok()?;
        let mut buf = [0u16; 260];
        let len = GetModuleFileNameExW(handle, None, &mut buf);
        let _ = CloseHandle(handle);
        // len == 0 means failure; len == buf.len() means truncation
        if len == 0 || len as usize >= buf.len() {
            return None;
        }
        let path = String::from_utf16_lossy(&buf[..len as usize]);
        std::path::Path::new(&path)
            .file_name()
            .and_then(|n| n.to_str())
            .filter(|name| !name.eq_ignore_ascii_case("yank.exe"))
            .map(|name| name.to_owned())
    }
}

// ── Win32 message pump ──────────────────────────────────────────────────────

use windows::Win32::{
    Foundation::{CloseHandle, HINSTANCE, HWND, LPARAM, LRESULT, WPARAM},
    System::{
        DataExchange::AddClipboardFormatListener,
        LibraryLoader::GetModuleHandleW,
        ProcessStatus::GetModuleFileNameExW,
        Threading::{OpenProcess, PROCESS_QUERY_INFORMATION, PROCESS_VM_READ},
    },
    UI::WindowsAndMessaging::{
        CreateWindowExW, DefWindowProcW, DispatchMessageW, GetForegroundWindow, GetMessageW,
        GetWindowThreadProcessId, PostQuitMessage, RegisterClassExW, TranslateMessage,
        HWND_MESSAGE, MSG, WINDOW_EX_STYLE, WINDOW_STYLE, WM_CLIPBOARDUPDATE, WM_DESTROY,
        WNDCLASSEXW,
    },
};

thread_local! {
    static TRIGGER_TX: std::cell::RefCell<Option<std::sync::mpsc::Sender<Option<String>>>> =
        std::cell::RefCell::new(None);
}

fn run_message_pump(trigger_tx: std::sync::mpsc::Sender<Option<String>>) {
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
            let proc_name = get_foreground_process_name();
            TRIGGER_TX.with(|cell| {
                if let Some(tx) = cell.borrow().as_ref() {
                    let _ = tx.send(proc_name);
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
