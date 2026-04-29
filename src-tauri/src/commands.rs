use std::sync::{
    atomic::Ordering,
    Arc,
};

use tauri::{Manager, State};
use tauri_plugin_autostart::ManagerExt;

use crate::{
    models::{AppSettings, ClipboardEntry, ExcludedApp, Snippet},
    store::SqliteStore,
    PauseCapture,
};

type StoreState<'a> = State<'a, Arc<SqliteStore>>;
type PauseCaptureState<'a> = State<'a, Arc<PauseCapture>>;

#[tauri::command]
pub fn get_entries(store: StoreState) -> Result<Vec<ClipboardEntry>, String> {
    store.get_all_entries().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_clipboard(id: i64, store: StoreState) -> Result<(), String> {
    store.restore_to_clipboard(id).map_err(|e| e.to_string())
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

#[tauri::command]
pub fn open_image_preview(id: i64, app_handle: tauri::AppHandle) -> Result<(), String> {
    crate::windows::open_image_preview(&app_handle, id).map_err(|e| e.to_string())
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
pub fn set_clipboard_text(text: String) -> Result<(), String> {
    let mut clipboard = arboard::Clipboard::new().map_err(|e| e.to_string())?;
    clipboard.set_text(text).map_err(|e| e.to_string())
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
