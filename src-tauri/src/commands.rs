use std::sync::Arc;

use tauri::{Manager, State};

use crate::{
    models::{AppSettings, ClipboardEntry},
    store::SqliteStore,
};

type StoreState<'a> = State<'a, Arc<SqliteStore>>;

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
) -> Result<(), String> {
    store.save_settings(&settings).map_err(|e| e.to_string())?;

    // Re-register global shortcut with new shortcut string
    crate::shortcuts::register_shortcut(&app_handle, &settings.shortcut)
        .map_err(|e| e.to_string())?;

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
