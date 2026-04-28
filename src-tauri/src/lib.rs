mod commands;
mod models;
mod ocr;
mod platform;
mod shortcuts;
mod store;
mod windows;

use std::sync::{
    atomic::{AtomicU64, Ordering},
    Arc,
};

use tauri::{
    image::Image,
    menu::{MenuBuilder, MenuItemBuilder},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, WindowEvent,
};

use store::SqliteStore;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Generation counter: incremented on every Focused(false). Each spawned hide
    // thread captures its own generation; if the counter has moved on (because
    // Moved or Focused(true) fired first) the hide is cancelled.
    let hide_gen: Arc<AtomicU64> = Arc::new(AtomicU64::new(0));
    let hide_gen_wev = hide_gen.clone();

    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "yank=debug".parse().unwrap()),
        )
        .init();

    tauri::Builder::default()
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, shortcut, event| {
                    use tauri_plugin_global_shortcut::ShortcutState;
                    tracing::info!("Shortcut {:?} fired, state={:?}", shortcut, event.state());
                    if event.state() == ShortcutState::Pressed {
                        windows::toggle_popup(app);
                    }
                })
                .build(),
        )
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .setup(|app| {
            // Open the SQLite database in the app data directory
            let app_data_dir = app
                .path()
                .app_data_dir()
                .expect("Failed to resolve app data dir");
            std::fs::create_dir_all(&app_data_dir)?;
            let db_path = app_data_dir.join("clipboard.db");

            let store = Arc::new(
                SqliteStore::new(&db_path).expect("Failed to initialize SQLite store"),
            );

            app.manage(store.clone());

            // Prune stale entries on startup if age-based deletion is enabled
            if let Err(e) = store.prune_old_entries_if_enabled() {
                tracing::warn!("Failed to prune old entries on startup: {}", e);
            }

            let shortcut = store
                .get_settings()
                .map(|s| s.shortcut)
                .unwrap_or_else(|_| models::AppSettings::default().shortcut);

            if let Err(e) = shortcuts::register_shortcut(app.handle(), &shortcut) {
                tracing::warn!("Failed to register shortcut '{}': {}", shortcut, e);
            }

            // Start the platform clipboard monitor
            platform::start_monitor(app.handle().clone(), store);

            // System tray
            setup_tray(app)?;

            Ok(())
        })
        .on_window_event(move |window, event| {
            if window.label() == "main" {
                match event {
                    WindowEvent::Focused(false) => {
                        // startDragging() causes a transient WM_KILLFOCUS on Windows.
                        // Delay the hide; cancel it if Moved (drag) or Focused(true) arrives first.
                        let gen = hide_gen_wev.fetch_add(1, Ordering::Relaxed) + 1;
                        let w = window.clone();
                        let hg = hide_gen_wev.clone();
                        std::thread::spawn(move || {
                            std::thread::sleep(std::time::Duration::from_millis(100));
                            if hg.load(Ordering::Relaxed) == gen {
                                let _ = w.hide();
                            }
                        });
                    }
                    WindowEvent::Moved(_) | WindowEvent::Focused(true) => {
                        hide_gen_wev.fetch_add(1, Ordering::Relaxed);
                    }
                    _ => {}
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_entries,
            commands::set_clipboard,
            commands::delete_entry,
            commands::get_settings,
            commands::save_settings,
            commands::open_image_preview,
            commands::get_entry_image,
            commands::hide_popup,
            commands::toggle_pin,
            commands::save_window_position,
            commands::set_clipboard_text,
            commands::update_entry_content,
        ])
        .run(tauri::generate_context!())
        .expect("Error while running Tauri application");
}

fn setup_tray(app: &tauri::App) -> tauri::Result<()> {
    let open_item = MenuItemBuilder::with_id("open", "Open Clipboard History").build(app)?;
    let settings_item = MenuItemBuilder::with_id("settings", "Settings").build(app)?;
    let separator = tauri::menu::PredefinedMenuItem::separator(app)?;
    let quit_item = MenuItemBuilder::with_id("quit", "Quit").build(app)?;

    let menu = MenuBuilder::new(app)
        .item(&open_item)
        .item(&settings_item)
        .item(&separator)
        .item(&quit_item)
        .build()?;

    let icon_bytes = include_bytes!("../icons/32x32.png");
    let icon = Image::from_bytes(icon_bytes)?;

    let app_handle = app.handle().clone();
    TrayIconBuilder::with_id("main-tray")
        .icon(icon)
        .menu(&menu)
        .tooltip("Clipboard Manager")
        .on_menu_event(move |app, event| match event.id().as_ref() {
            "open" => windows::show_popup(app),
            "settings" => {
                if let Err(e) = windows::open_settings(app) {
                    tracing::error!("Failed to open settings: {}", e);
                }
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(move |_tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                windows::toggle_popup(&app_handle);
            }
        })
        .build(app)?;

    Ok(())
}
