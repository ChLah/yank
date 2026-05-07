/// Platform-specific clipboard monitor implementations.

#[cfg(target_os = "windows")]
pub mod windows;

#[cfg(target_os = "macos")]
pub mod macos;

#[cfg(target_os = "linux")]
pub mod linux;

use std::sync::Arc;

use crate::{store::SqliteStore, PauseCapture, SessionStats};

/// Spawns background threads for clipboard monitoring and returns immediately.
pub fn start_monitor(
    app_handle: tauri::AppHandle,
    store: Arc<SqliteStore>,
    pause_capture: Arc<PauseCapture>,
    session_stats: Arc<SessionStats>,
) {
    #[cfg(target_os = "windows")]
    windows::clipboard_monitor::start(app_handle, store, pause_capture, session_stats);

    #[cfg(target_os = "macos")]
    {
        tracing::warn!("macOS clipboard monitor not yet implemented");
        let _ = (app_handle, store, pause_capture, session_stats);
    }

    #[cfg(target_os = "linux")]
    {
        tracing::warn!("Linux clipboard monitor not yet implemented");
        let _ = (app_handle, store, pause_capture, session_stats);
    }
}
