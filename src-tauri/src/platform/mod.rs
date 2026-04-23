/// Platform-specific clipboard monitor implementations.
/// Each platform module exposes a `start_monitor` function.

#[cfg(target_os = "windows")]
pub mod windows;

#[cfg(target_os = "macos")]
pub mod macos;

#[cfg(target_os = "linux")]
pub mod linux;

use std::sync::Arc;

use crate::store::SqliteStore;

/// Start the platform clipboard monitor. Spawns background threads and returns immediately.
/// When the clipboard changes, the payload is processed and emitted via the Tauri app handle.
pub fn start_monitor(
    app_handle: tauri::AppHandle,
    store: Arc<SqliteStore>,
) {
    #[cfg(target_os = "windows")]
    windows::clipboard_monitor::start(app_handle, store);

    #[cfg(target_os = "macos")]
    {
        tracing::warn!("macOS clipboard monitor not yet implemented");
        let _ = (app_handle, store);
    }

    #[cfg(target_os = "linux")]
    {
        tracing::warn!("Linux clipboard monitor not yet implemented");
        let _ = (app_handle, store);
    }
}
