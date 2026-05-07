mod commands;
mod models;
mod ocr;
mod platform;
mod shortcuts;
mod store;
mod windows;

use std::sync::{
    atomic::{AtomicBool, AtomicU64, Ordering},
    Arc, Mutex,
};

use tauri::{
    image::Image,
    menu::{MenuBuilder, MenuItemBuilder},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, WindowEvent,
};

use store::SqliteStore;

pub struct PauseCapture {
    pub paused: AtomicBool,
    pub shortcut_str: Mutex<String>,
    /// When true, the global shortcut handler ignores all presses.
    /// Set while the user is focused on a shortcut input field in settings,
    /// so that pressing the assigned shortcut doesn't trigger it.
    pub editing_shortcut: AtomicBool,
}

impl PauseCapture {
    pub fn toggle_and_emit(&self, app: &tauri::AppHandle) -> bool {
        use tauri::Emitter;
        let was_paused = self.paused.fetch_xor(true, Ordering::AcqRel);
        let now_paused = !was_paused;
        let _ = app.emit("capture-paused-changed", now_paused);
        now_paused
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let hide_gen: Arc<AtomicU64> = Arc::new(AtomicU64::new(0));
    let hide_gen_wev = hide_gen.clone();

    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "yank=debug".parse().unwrap()),
        )
        .init();

    // Shared pause state — used by handler, commands, and monitor
    let pause_capture = Arc::new(PauseCapture {
        paused: AtomicBool::new(false),
        shortcut_str: Mutex::new(String::new()),
        editing_shortcut: AtomicBool::new(false),
    });
    let pause_capture_handler = pause_capture.clone();
    let pause_capture_setup = pause_capture.clone();

    tauri::Builder::default()
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(move |app, shortcut, event| {
                    use tauri_plugin_global_shortcut::ShortcutState;
                    if event.state() == ShortcutState::Pressed {
                        if pause_capture_handler.editing_shortcut.load(Ordering::Acquire) {
                            return;
                        }
                        let pause_str = pause_capture_handler.shortcut_str.lock().unwrap().clone();
                        let is_pause = !pause_str.is_empty()
                            && shortcuts::build_shortcut(&pause_str)
                                .map(|ps| &ps == shortcut)
                                .unwrap_or(false);
                        if is_pause {
                            let paused = pause_capture_handler.toggle_and_emit(app);
                            windows::set_tray_icon(app, paused);
                        } else {
                            windows::toggle_popup(app);
                        }
                    }
                })
                .build(),
        )
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .setup(move |app| {
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
            app.manage(pause_capture_setup.clone());

            if let Err(e) = store.prune_old_entries_if_enabled() {
                tracing::warn!("Failed to prune old entries on startup: {}", e);
            }

            let settings = store
                .get_settings()
                .unwrap_or_else(|_| models::AppSettings::default());

            if let Err(e) = shortcuts::register_shortcuts(
                app.handle(),
                &settings.shortcut,
                &settings.pause_shortcut,
                &pause_capture_setup.shortcut_str,
            ) {
                tracing::warn!("Failed to register shortcuts: {}", e);
            }

            platform::start_monitor(app.handle().clone(), store, pause_capture_setup.clone());

            setup_tray(app)?;

            Ok(())
        })
        .on_window_event(move |window, event| {
            if window.label() == "main" {
                match event {
                    WindowEvent::Focused(false) => {
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
            commands::ocr_image,
            commands::get_snippets,
            commands::create_snippet,
            commands::update_snippet,
            commands::delete_snippet,
            commands::reorder_snippet,
            commands::get_snippet_folders,
            commands::create_snippet_folder,
            commands::rename_snippet_folder,
            commands::delete_snippet_folder,
            commands::reorder_snippet_folder,
            commands::move_snippet_to_folder,
            commands::get_excluded_apps,
            commands::add_excluded_app,
            commands::remove_excluded_app,
            commands::get_capture_paused,
            commands::toggle_capture_paused,
            commands::set_editing_shortcut,
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
