use std::sync::Arc;

use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};

use crate::{models::WindowPositionMode, store::SqliteStore};

pub fn toggle_popup(app: &AppHandle) {
    tracing::info!("toggle_popup called");
    match app.get_webview_window("main") {
        Some(window) => {
            let visible = window.is_visible().unwrap_or(false);
            tracing::info!("Main window found, visible={}", visible);
            if visible {
                let _ = window.hide();
            } else {
                show_popup(app);
            }
        }
        None => tracing::error!("Main window not found — check window label in tauri.conf.json"),
    }
}

pub fn show_popup(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        if !try_position_from_last(app, &window) {
            position_near_cursor(&window);
        }
        let _ = window.show();
        let _ = window.set_focus();
        // Emit event so Angular reloads entries and resets selection
        let _ = app.emit_to("main", "popup-shown", ());
    }
}

fn try_position_from_last(app: &AppHandle, window: &tauri::WebviewWindow) -> bool {
    let store = app.state::<Arc<SqliteStore>>();
    let settings = match store.get_settings() {
        Ok(s) => s,
        Err(_) => return false,
    };
    if settings.window_position != WindowPositionMode::Last {
        return false;
    }
    match store.get_window_position() {
        Ok(Some((x, y))) => {
            let _ = window.set_position(tauri::PhysicalPosition::new(x as i32, y as i32));
            true
        }
        _ => false,
    }
}

fn position_near_cursor(window: &tauri::WebviewWindow) {
    let Some((cursor_x, cursor_y)) = get_cursor_position() else {
        return;
    };

    let Ok(win_size) = window.outer_size() else {
        return;
    };
    let win_w = win_size.width as i32;
    let win_h = win_size.height as i32;

    let Ok(monitors) = window.available_monitors() else {
        return;
    };

    // Find the monitor that contains the cursor, fall back to first available
    let monitor = monitors
        .iter()
        .find(|m| {
            let pos = m.position();
            let size = m.size();
            cursor_x >= pos.x
                && cursor_x < pos.x + size.width as i32
                && cursor_y >= pos.y
                && cursor_y < pos.y + size.height as i32
        })
        .or_else(|| monitors.first());

    let Some(monitor) = monitor else {
        return;
    };

    let mon_pos = monitor.position();
    let mon_size = monitor.size();
    let mon_x = mon_pos.x;
    let mon_y = mon_pos.y;
    let mon_w = mon_size.width as i32;
    let mon_h = mon_size.height as i32;

    // Small gap between cursor and dialog edge
    const OFFSET: i32 = 8;

    // Prefer opening to the right of / below the cursor; flip if there isn't room
    let x = if cursor_x + OFFSET + win_w <= mon_x + mon_w {
        cursor_x + OFFSET
    } else {
        cursor_x - OFFSET - win_w
    };

    let y = if cursor_y + OFFSET + win_h <= mon_y + mon_h {
        cursor_y + OFFSET
    } else {
        cursor_y - OFFSET - win_h
    };

    // Clamp so the window is fully within the monitor
    let x = x.clamp(mon_x, mon_x + mon_w - win_w);
    let y = y.clamp(mon_y, mon_y + mon_h - win_h);

    let _ = window.set_position(tauri::PhysicalPosition::new(x, y));
}

#[cfg(target_os = "windows")]
fn get_cursor_position() -> Option<(i32, i32)> {
    use windows::Win32::{Foundation::POINT, UI::WindowsAndMessaging::GetCursorPos};
    let mut pt = POINT { x: 0, y: 0 };
    unsafe {
        if GetCursorPos(&mut pt).is_ok() {
            Some((pt.x, pt.y))
        } else {
            None
        }
    }
}

#[cfg(not(target_os = "windows"))]
fn get_cursor_position() -> Option<(i32, i32)> {
    None
}

pub fn open_image_preview(
    app: &AppHandle,
    id: i64,
) -> Result<(), Box<dyn std::error::Error>> {
    let label = "image-preview";

    // If window already exists, navigate to the new entry and show
    if let Some(window) = app.get_webview_window(label) {
        let _ = window.eval(&format!("window.location.hash = '#/preview?id={}'", id));
        let _ = window.show();
        let _ = window.set_focus();
        return Ok(());
    }

    // Open at root (same URL as the main window) and use an initialization
    // script to pre-set the hash before Angular boots. This avoids passing
    // '#' and '?' through PathBuf which mangles them on Windows, and avoids
    // any ambiguity about whether WebviewUrl::App uses the dev server or the
    // bundled asset protocol for dynamically created windows.
    WebviewWindowBuilder::new(app, label, WebviewUrl::App("/".into()))
        .title("Image Preview")
        .inner_size(800.0, 600.0)
        .resizable(true)
        .decorations(true)
        .initialization_script(&format!(
            "window.location.hash = '#/preview?id={}';",
            id
        ))
        .build()?;

    Ok(())
}

pub fn open_settings(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let label = "settings";

    if let Some(window) = app.get_webview_window(label) {
        let _ = window.show();
        let _ = window.set_focus();
        return Ok(());
    }

    WebviewWindowBuilder::new(app, label, WebviewUrl::App("/".into()))
        .title("Settings")
        .inner_size(500.0, 680.0)
        .resizable(false)
        .decorations(false)
        .initialization_script("window.location.hash = '#/settings';")
        .build()?;

    Ok(())
}
