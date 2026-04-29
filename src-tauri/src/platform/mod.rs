/// Platform-specific clipboard monitor implementations.

#[cfg(target_os = "windows")]
pub mod windows;

#[cfg(target_os = "macos")]
pub mod macos;

#[cfg(target_os = "linux")]
pub mod linux;

use std::sync::Arc;

use crate::{store::SqliteStore, PauseCapture};

pub fn start_monitor(
    app_handle: tauri::AppHandle,
    store: Arc<SqliteStore>,
    pause_capture: Arc<PauseCapture>,
) {
    #[cfg(target_os = "windows")]
    windows::clipboard_monitor::start(app_handle, store, pause_capture);

    #[cfg(target_os = "macos")]
    {
        tracing::warn!("macOS clipboard monitor not yet implemented");
        let _ = (app_handle, store, pause_capture);
    }

    #[cfg(target_os = "linux")]
    {
        tracing::warn!("Linux clipboard monitor not yet implemented");
        let _ = (app_handle, store, pause_capture);
    }
}
