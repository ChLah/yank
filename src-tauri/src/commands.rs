use std::sync::{
    atomic::Ordering,
    Arc,
};

use tauri::{Manager, State};
use tauri_plugin_autostart::ManagerExt;

use crate::{
    models::{AppSettings, ClipboardEntry, ExcludedApp, Snippet, SnippetFolder, StatsSnapshot},
    store::SqliteStore,
    PauseCapture, SessionStats,
};

type StoreState<'a> = State<'a, Arc<SqliteStore>>;
type PauseCaptureState<'a> = State<'a, Arc<PauseCapture>>;
type SessionStatsState<'a> = State<'a, Arc<SessionStats>>;

#[tauri::command]
pub fn get_entries(store: StoreState) -> Result<Vec<ClipboardEntry>, String> {
    store.get_all_entries().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_entry(id: i64, store: StoreState) -> Result<(), String> {
    store.delete_entry(id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_settings(store: StoreState) -> Result<AppSettings, String> {
    store.get_settings().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn save_settings(
    settings: AppSettings,
    store: StoreState,
    app_handle: tauri::AppHandle,
    pause_capture: PauseCaptureState,
) -> Result<(), String> {
    store.save_settings(&settings).map_err(|e| e.to_string())?;

    // Re-register shortcuts with new values. Non-fatal: settings are already saved.
    if let Err(e) = crate::shortcuts::register_shortcuts(
        &app_handle,
        &settings.shortcut,
        &settings.pause_shortcut,
        &pause_capture.shortcut_str,
    ) {
        tracing::warn!("Failed to re-register shortcuts after save: {}", e);
    }

    // Toggle OS autostart. Non-fatal: settings are already saved.
    if settings.autostart {
        if let Err(e) = app_handle.autolaunch().enable() {
            tracing::warn!("Failed to enable autostart: {}", e);
        }
    } else {
        if let Err(e) = app_handle.autolaunch().disable() {
            tracing::warn!("Failed to disable autostart: {}", e);
        }
    }

    Ok(())
}

// `async fn` is required: `WebviewWindowBuilder::build()` deadlocks when
// invoked from a sync Tauri command (the worker thread holding the command
// also needs to drive the event loop that processes window creation).
// Symptom is a white/unresponsive new window. The tray-menu path doesn't
// have this problem because menu events fire on the main thread directly.
// See https://github.com/tauri-apps/tauri/issues/13963.
#[tauri::command]
pub async fn open_settings_window(app_handle: tauri::AppHandle) -> Result<(), String> {
    crate::windows::open_settings(&app_handle).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_entry_image(id: i64, store: StoreState) -> Result<String, String> {
    store.get_entry_image_base64(id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn hide_popup(app_handle: tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app_handle.get_webview_window("main") {
        window.hide().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn toggle_pin(id: i64, store: StoreState) -> Result<bool, String> {
    store.toggle_pin(id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn save_window_position(x: i32, y: i32, store: StoreState) -> Result<(), String> {
    store.save_window_position(x as i64, y as i64).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_entry_content(id: i64, content: String, store: StoreState) -> Result<(), String> {
    store.update_entry_content(id, &content).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn ocr_image(id: i64, store: StoreState<'_>) -> Result<String, String> {
    crate::ocr::ocr_entry(&store, id).await
}

#[tauri::command]
pub fn get_snippets(store: StoreState) -> Result<Vec<Snippet>, String> {
    store.get_snippets().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_snippet(title: String, content: String, store: StoreState) -> Result<Snippet, String> {
    store.create_snippet(&title, &content).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_snippet(id: i64, title: String, content: String, store: StoreState) -> Result<Snippet, String> {
    store.update_snippet(id, &title, &content).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_snippet(id: i64, store: StoreState) -> Result<(), String> {
    store.delete_snippet(id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn reorder_snippet(id: i64, new_index: usize, store: StoreState) -> Result<(), String> {
    store.reorder_snippet(id, new_index).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_snippet_folders(store: StoreState) -> Result<Vec<SnippetFolder>, String> {
    store.get_snippet_folders().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_snippet_folder(name: String, store: StoreState) -> Result<SnippetFolder, String> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err("Folder name cannot be empty".to_string());
    }
    store.create_snippet_folder(trimmed).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn rename_snippet_folder(id: i64, name: String, store: StoreState) -> Result<(), String> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err("Folder name cannot be empty".to_string());
    }
    store.rename_snippet_folder(id, trimmed).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_snippet_folder(id: i64, store: StoreState) -> Result<(), String> {
    store.delete_snippet_folder(id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn reorder_snippet_folder(id: i64, new_index: usize, store: StoreState) -> Result<(), String> {
    store.reorder_snippet_folder(id, new_index).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn move_snippet_to_folder(snippet_id: i64, folder_id: Option<i64>, store: StoreState) -> Result<(), String> {
    store.move_snippet_to_folder(snippet_id, folder_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_excluded_apps(store: StoreState) -> Result<Vec<ExcludedApp>, String> {
    store.get_excluded_apps().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn add_excluded_app(process_name: String, store: StoreState) -> Result<ExcludedApp, String> {
    let trimmed = process_name.trim();
    if trimmed.is_empty() {
        return Err("Process name cannot be empty".to_string());
    }
    store.add_excluded_app(trimmed).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn remove_excluded_app(id: i64, store: StoreState) -> Result<(), String> {
    store.remove_excluded_app(id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_capture_paused(pause: PauseCaptureState) -> bool {
    pause.paused.load(Ordering::Acquire)
}

#[tauri::command]
pub fn toggle_capture_paused(pause: PauseCaptureState, app_handle: tauri::AppHandle) -> bool {
    let paused = pause.toggle_and_emit(&app_handle);
    crate::windows::set_tray_icon(&app_handle, paused);
    paused
}

#[tauri::command]
pub fn set_editing_shortcut(editing: bool, pause: PauseCaptureState) {
    pause.editing_shortcut.store(editing, Ordering::Release);
}

#[tauri::command]
pub fn get_stats(
    store: StoreState,
    session_stats: SessionStatsState,
) -> Result<StatsSnapshot, String> {
    let (total_copies, total_pastes, installed_at) =
        store.get_persisted_stats().map_err(|e| e.to_string())?;
    let (saved_entries_count, saved_entries_bytes) =
        store.get_saved_entries_summary().map_err(|e| e.to_string())?;
    let pinned_count = store.get_pinned_count().map_err(|e| e.to_string())?;
    let snippet_count = store.get_snippet_count().map_err(|e| e.to_string())?;

    Ok(StatsSnapshot {
        total_copies,
        total_pastes,
        session_copies: session_stats.copies.load(Ordering::Relaxed),
        session_pastes: session_stats.pastes.load(Ordering::Relaxed),
        session_started_at: session_stats.started_at.load(Ordering::Acquire),
        installed_at,
        saved_entries_count,
        saved_entries_bytes,
        db_file_bytes: store.db_file_size(),
        pinned_count,
        snippet_count,
    })
}

#[tauri::command]
pub fn reset_session_stats(session_stats: SessionStatsState) {
    session_stats.copies.store(0, Ordering::Relaxed);
    session_stats.pastes.store(0, Ordering::Relaxed);
    // session_started_at stays — "Diese Sitzung" still refers to the same launch.
}

#[tauri::command]
pub fn reset_database(
    confirm: String,
    store: StoreState,
    session_stats: SessionStatsState,
    app_handle: tauri::AppHandle,
) -> Result<(), String> {
    // Backend-side phrase guard. The frontend already disables the button
    // until the input matches, but never trust the client.
    let trimmed = confirm.trim();
    if !trimmed.eq_ignore_ascii_case("DELETE") && !trimmed.eq_ignore_ascii_case("LÖSCHEN") {
        return Err("confirmation phrase mismatch".to_string());
    }
    store.reset_database().map_err(|e| e.to_string())?;
    session_stats.copies.store(0, Ordering::Relaxed);
    session_stats.pastes.store(0, Ordering::Relaxed);
    // Notify the popup so the clipboard list reloads to its now-empty state.
    use tauri::Emitter;
    let _ = app_handle.emit("clipboard-changed", ());
    Ok(())
}

async fn do_paste_and_close(app_handle: &tauri::AppHandle, auto_paste: bool) {
    if let Some(window) = app_handle.get_webview_window("main") {
        let _ = window.hide();
    }
    if !auto_paste {
        return;
    }
    #[cfg(target_os = "windows")]
    {
        use std::mem::size_of;
        use windows::Win32::UI::Input::KeyboardAndMouse::{
            SendInput, INPUT, INPUT_0, INPUT_KEYBOARD, KEYBD_EVENT_FLAGS, KEYBDINPUT,
            KEYEVENTF_KEYUP, VIRTUAL_KEY, VK_CONTROL, VK_V,
        };
        // Windows needs ~150 ms to fully relinquish focus from our Webview
        // window before Ctrl+V can be safely injected into the previously-
        // focused application.
        tokio::time::sleep(std::time::Duration::from_millis(150)).await;
        let make = |vk: VIRTUAL_KEY, flags: KEYBD_EVENT_FLAGS| INPUT {
            r#type: INPUT_KEYBOARD,
            Anonymous: INPUT_0 {
                ki: KEYBDINPUT {
                    wVk: vk,
                    wScan: 0,
                    dwFlags: flags,
                    time: 0,
                    dwExtraInfo: 0,
                },
            },
        };
        let inputs = [
            make(VK_CONTROL, KEYBD_EVENT_FLAGS(0)),
            make(VK_V,       KEYBD_EVENT_FLAGS(0)),
            make(VK_V,       KEYEVENTF_KEYUP),
            make(VK_CONTROL, KEYEVENTF_KEYUP),
        ];
        unsafe { SendInput(&inputs, size_of::<INPUT>() as i32) };
    }
}

#[tauri::command]
pub async fn paste_entry_and_close(
    id: i64,
    store: StoreState<'_>,
    session_stats: SessionStatsState<'_>,
    app_handle: tauri::AppHandle,
) -> Result<(), String> {
    store.restore_to_clipboard(id).map_err(|e| e.to_string())?;
    session_stats.pastes.fetch_add(1, Ordering::Relaxed);
    let auto_paste = store.get_settings().map(|s| s.auto_paste).unwrap_or(false);
    do_paste_and_close(&app_handle, auto_paste).await;
    Ok(())
}

#[tauri::command]
pub async fn paste_text_and_close(
    text: String,
    store: StoreState<'_>,
    session_stats: SessionStatsState<'_>,
    app_handle: tauri::AppHandle,
) -> Result<(), String> {
    let mut clipboard = arboard::Clipboard::new().map_err(|e| e.to_string())?;
    clipboard.set_text(text).map_err(|e| e.to_string())?;
    session_stats.pastes.fetch_add(1, Ordering::Relaxed);
    let auto_paste = store.get_settings().map(|s| s.auto_paste).unwrap_or(false);
    do_paste_and_close(&app_handle, auto_paste).await;
    Ok(())
}
