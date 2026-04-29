# Pause Capture Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a toggle that pauses clipboard capture (no new entries written to DB) with a header switch and an optional global hotkey.

**Architecture:** Runtime pause flag (`PauseCapture` struct with `AtomicBool` + `Mutex<String>`) managed as Tauri state and shared with the shortcut handler via `Arc`. The monitor checks the flag before saving; commands expose get/toggle; the tray icon swaps to a paused variant on every toggle; the Angular frontend syncs via an event subscription.

**Tech Stack:** Rust (Tauri 2, `AtomicBool`, `Mutex`), Angular 21 (signals), `@spartan-ng/brain/switch`, Tailwind CSS.

---

## File Map

| File | Action |
|---|---|
| `src-tauri/src/models.rs` | Add `pause_shortcut: String` to `AppSettings` |
| `src-tauri/src/store/sqlite_store.rs` | Persist `pause_shortcut` in get/save_settings |
| `src-tauri/src/lib.rs` | Define `PauseCapture` struct; manage as Tauri state; update handler + setup |
| `src-tauri/src/shortcuts.rs` | Replace `register_shortcut` → `register_shortcuts` (registers both shortcuts) |
| `src-tauri/src/commands.rs` | Add `get_capture_paused`, `toggle_capture_paused`; update `save_settings` |
| `src-tauri/src/windows.rs` | Add `set_tray_icon(app, paused)` helper |
| `src-tauri/icons/32x32-paused.png` | New icon asset (placeholder copy of `32x32.png`; replace with final design) |
| `src-tauri/src/platform/mod.rs` | Pass `Arc<PauseCapture>` to `start_monitor` |
| `src-tauri/src/platform/windows/clipboard_monitor.rs` | Check pause flag in `process_clipboard_change` |
| `src/app/core/models/settings.model.ts` | Add `pauseShortcut: string` |
| `src/app/i18n/translation.interface.ts` | Add new translation keys |
| `src/app/i18n/en.ts` | Add English translations |
| `src/app/i18n/de.ts` | Add German translations |
| `src/app/core/services/tauri-bridge.service.ts` | Add `getCapturePaused`, `toggleCapturePaused`, `onCapturePausedChanged` |
| `src/libs/ui/switch/src/lib/hlm-switch.ts` | Create HlmSwitch component |
| `src/libs/ui/switch/src/index.ts` | Export HlmSwitch |
| `tsconfig.json` | Add `@spartan-ng/helm/switch` path |
| `src/app/features/clipboard-list/clipboard-list.component.ts` | Add switch + label to header; wire pause state |
| `src/app/features/settings/settings.component.ts` | Add pause shortcut input in Privacy group |

---

## Task 1: Rust model + DB layer

**Files:**
- Modify: `src-tauri/src/models.rs:45-73`
- Modify: `src-tauri/src/store/sqlite_store.rs:327-400`

- [ ] **Step 1: Add `pause_shortcut` to `AppSettings` in `models.rs`**

Replace the `AppSettings` struct and its `Default` impl (lines 45–73):

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    pub shortcut: String,
    pub max_entries: i64,
    pub language: Option<Language>,
    pub theme: Theme,
    pub autostart: bool,
    pub delete_after_max_entries: bool,
    pub delete_after_days: bool,
    pub max_days: i64,
    pub window_position: WindowPositionMode,
    pub pause_shortcut: String,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            shortcut: "Ctrl+Semicolon".to_string(),
            max_entries: 20,
            language: None,
            theme: Theme::System,
            autostart: false,
            delete_after_max_entries: true,
            delete_after_days: false,
            max_days: 30,
            window_position: WindowPositionMode::Cursor,
            pause_shortcut: String::new(),
        }
    }
}
```

- [ ] **Step 2: Update `get_settings` in `sqlite_store.rs` to read `pause_shortcut`**

Replace the `get_settings` method (starting at line 327). The key changes are: add `"pauseShortcut"` to the fetch list and read it at the end.

```rust
pub fn get_settings(&self) -> Result<AppSettings, Box<dyn std::error::Error>> {
    let conn = self.conn.lock().unwrap();
    let map = Self::fetch_settings_map(&conn, &[
        "shortcut", "maxEntries", "language", "theme",
        "autostart", "deleteAfterMaxEntries", "deleteAfterDays", "maxDays",
        "windowPosition", "pauseShortcut",
    ])?;

    let defaults = AppSettings::default();
    let text = |key: &str| map.get(key).and_then(|(t, _)| t.clone());
    let int  = |key: &str| map.get(key).and_then(|(_, i)| *i);

    let shortcut    = text("shortcut").unwrap_or(defaults.shortcut);
    let max_entries = int("maxEntries").unwrap_or(defaults.max_entries);
    let language    = text("language").and_then(|v| match v.as_str() {
        "en" => Some(Language::En),
        "de" => Some(Language::De),
        _    => None,
    });
    let theme = text("theme").map(|v| match v.as_str() {
        "dark"  => Theme::Dark,
        "light" => Theme::Light,
        _       => Theme::System,
    }).unwrap_or(Theme::System);
    let autostart               = int("autostart").map(|v| v != 0).unwrap_or(false);
    let delete_after_max_entries = int("deleteAfterMaxEntries").map(|v| v != 0).unwrap_or(true);
    let delete_after_days       = int("deleteAfterDays").map(|v| v != 0).unwrap_or(false);
    let max_days                = int("maxDays").unwrap_or(30);
    let window_position = text("windowPosition").map(|v| match v.as_str() {
        "last" => WindowPositionMode::Last,
        _      => WindowPositionMode::Cursor,
    }).unwrap_or(WindowPositionMode::Cursor);
    let pause_shortcut = text("pauseShortcut").unwrap_or_default();

    Ok(AppSettings {
        shortcut, max_entries, language, theme, autostart,
        delete_after_max_entries, delete_after_days, max_days,
        window_position, pause_shortcut,
    })
}
```

- [ ] **Step 3: Update `save_settings` in `sqlite_store.rs` to write `pause_shortcut`**

In the `save_settings` method, add `pause_shortcut` to the `rows` array (after the `windowPosition` row):

```rust
let rows: &[(&str, Option<&str>, Option<i64>)] = &[
    ("shortcut",              Some(settings.shortcut.as_str()),            None),
    ("maxEntries",            None,                                         Some(settings.max_entries)),
    ("language",              lang_str,                                     None),
    ("theme",                 Some(theme_str),                              None),
    ("autostart",             None,                                         Some(settings.autostart as i64)),
    ("deleteAfterMaxEntries", None,                                         Some(settings.delete_after_max_entries as i64)),
    ("deleteAfterDays",       None,                                         Some(settings.delete_after_days as i64)),
    ("maxDays",               None,                                         Some(settings.max_days)),
    ("windowPosition",        Some(window_position_str),                   None),
    ("pauseShortcut",         Some(settings.pause_shortcut.as_str()),      None),
];
```

- [ ] **Step 4: Build the Rust crate to verify no compile errors**

Run: `cd src-tauri && cargo build 2>&1`
Expected: builds without errors (warnings OK)

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/models.rs src-tauri/src/store/sqlite_store.rs
git commit -m "feat(rust): add pause_shortcut field to AppSettings + DB persistence"
```

---

## Task 2: Rust shared state + shortcut handling

**Files:**
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/src/shortcuts.rs`

- [ ] **Step 1: Define `PauseCapture` struct and update `register_shortcuts` in `shortcuts.rs`**

Replace the existing `register_shortcut` function with `register_shortcuts` (keep `build_shortcut` and all other functions unchanged). Add the new function at the top of the file after the existing `register_shortcut`:

Remove the old `register_shortcut` function (lines 4–23) and replace with:

```rust
use std::sync::{Arc, Mutex};

pub fn register_shortcuts(
    app: &AppHandle,
    popup_str: &str,
    pause_str: &str,
    pause_shortcut_store: &Arc<Mutex<String>>,
) -> Result<(), Box<dyn std::error::Error>> {
    tracing::info!("Registering shortcuts: popup='{}' pause='{}'", popup_str, pause_str);

    let popup_sc = build_shortcut(popup_str).map_err(|e| {
        tracing::error!("Failed to parse popup shortcut '{}': {}", popup_str, e);
        e
    })?;

    let _ = app.global_shortcut().unregister_all();
    app.global_shortcut().register(popup_sc)?;

    if !pause_str.is_empty() {
        match build_shortcut(pause_str) {
            Ok(pause_sc) => {
                if let Err(e) = app.global_shortcut().register(pause_sc) {
                    tracing::warn!("Failed to register pause shortcut '{}': {}", pause_str, e);
                }
            }
            Err(e) => tracing::warn!("Invalid pause shortcut '{}': {}", pause_str, e),
        }
    }

    *pause_shortcut_store.lock().unwrap() = pause_str.to_string();
    tracing::info!("Shortcuts registered successfully");
    Ok(())
}
```

Note: the `use tauri::AppHandle;`, `use tauri_plugin_global_shortcut::{...}` imports at the top of the file stay unchanged. Add `use std::sync::{Arc, Mutex};` at the top.

- [ ] **Step 2: Add `PauseCapture` struct and wire up shared state in `lib.rs`**

At the top of `lib.rs`, add the new struct after the existing `use` imports:

```rust
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc, Mutex,
};
```

Add after all imports, before `pub fn run()`:

```rust
pub struct PauseCapture {
    pub paused: AtomicBool,
    pub shortcut_str: Mutex<String>,
}
```

- [ ] **Step 3: Update `run()` in `lib.rs` to manage the pause state and update the shortcut handler**

Replace the beginning of `run()` (the `hide_gen` setup + `tauri::Builder::default()` block up to `.setup()`). The full new `run()` function:

```rust
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
    });
    let pause_capture_handler = pause_capture.clone();
    let pause_capture_setup = pause_capture.clone();

    tauri::Builder::default()
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(move |app, shortcut, event| {
                    use tauri_plugin_global_shortcut::ShortcutState;
                    if event.state() == ShortcutState::Pressed {
                        let pause_str = pause_capture_handler.shortcut_str.lock().unwrap().clone();
                        let is_pause = !pause_str.is_empty()
                            && shortcuts::build_shortcut(&pause_str)
                                .map(|ps| &ps == shortcut)
                                .unwrap_or(false);
                        if is_pause {
                            let paused = !pause_capture_handler.paused.load(Ordering::SeqCst);
                            pause_capture_handler.paused.store(paused, Ordering::SeqCst);
                            let _ = app.emit("capture-paused-changed", paused);
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
            commands::get_excluded_apps,
            commands::add_excluded_app,
            commands::remove_excluded_app,
            commands::get_capture_paused,
            commands::toggle_capture_paused,
        ])
        .run(tauri::generate_context!())
        .expect("Error while running Tauri application");
}
```

Note: the `Mutex` import is already added in step 2 above. The `setup` closure now needs to be `move` to capture `pause_capture_setup`. Remove the existing `let shortcut = store.get_settings()...` and `shortcuts::register_shortcut(...)` lines — they are replaced by the new `settings`/`register_shortcuts` block above.

- [ ] **Step 4: Build the Rust crate to verify**

Run: `cd src-tauri && cargo build 2>&1`
Expected: errors about `start_monitor` having wrong args and missing commands — that's fine for now (Task 3 fixes those)

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/shortcuts.rs src-tauri/src/lib.rs
git commit -m "feat(rust): add PauseCapture shared state + dual-shortcut registration"
```

---

## Task 3: Rust monitor + new commands

**Files:**
- Modify: `src-tauri/src/platform/mod.rs`
- Modify: `src-tauri/src/platform/windows/clipboard_monitor.rs`
- Modify: `src-tauri/src/commands.rs`

- [ ] **Step 1: Update `platform/mod.rs` to thread `Arc<PauseCapture>` through**

Replace the entire file:

```rust
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
```

- [ ] **Step 2: Update `clipboard_monitor.rs` to check the pause flag**

Replace the `start` and `process_clipboard_change` functions. Add `Arc<PauseCapture>` parameter to both. In `start`, clone `pause_capture` for the processor thread:

```rust
use crate::PauseCapture;

pub fn start(app_handle: tauri::AppHandle, store: Arc<SqliteStore>, pause_capture: Arc<PauseCapture>) {
    let (trigger_tx, trigger_rx) = std::sync::mpsc::channel::<Option<String>>();

    std::thread::Builder::new()
        .name("clipboard-win32-pump".into())
        .spawn(move || {
            run_message_pump(trigger_tx);
        })
        .expect("Failed to spawn clipboard monitor thread");

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
        Ok(None) => return,
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
```

Add `use crate::PauseCapture;` near the top of `clipboard_monitor.rs` alongside the existing `use crate::{...}` imports.

- [ ] **Step 3: Add `get_capture_paused` and `toggle_capture_paused` commands to `commands.rs`**

Add at the top of `commands.rs` (new import):

```rust
use std::sync::atomic::Ordering;
use crate::PauseCapture;
```

Add the two new type aliases and command functions after the existing `remove_excluded_app` command:

```rust
type PauseCaptureState<'a> = State<'a, Arc<PauseCapture>>;

#[tauri::command]
pub fn get_capture_paused(pause: PauseCaptureState) -> bool {
    pause.paused.load(Ordering::SeqCst)
}

#[tauri::command]
pub fn toggle_capture_paused(
    pause: PauseCaptureState,
    app_handle: tauri::AppHandle,
) -> bool {
    let paused = !pause.paused.load(Ordering::SeqCst);
    pause.paused.store(paused, Ordering::SeqCst);
    let _ = app_handle.emit("capture-paused-changed", paused);
    paused
}
```

- [ ] **Step 4: Update `save_settings` in `commands.rs` to call `register_shortcuts`**

Replace the `shortcuts::register_shortcut` call in `save_settings` with `register_shortcuts`. The updated `save_settings` function:

```rust
#[tauri::command]
pub fn save_settings(
    settings: AppSettings,
    store: StoreState,
    pause: PauseCaptureState,
    app_handle: tauri::AppHandle,
) -> Result<(), String> {
    store.save_settings(&settings).map_err(|e| e.to_string())?;

    if let Err(e) = crate::shortcuts::register_shortcuts(
        &app_handle,
        &settings.shortcut,
        &settings.pause_shortcut,
        &pause.shortcut_str,
    ) {
        tracing::warn!("Failed to re-register shortcuts after save: {}", e);
    }

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
```

- [ ] **Step 5: Build the full Rust crate**

Run: `cd src-tauri && cargo build 2>&1`
Expected: successful build with no errors

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/platform/mod.rs src-tauri/src/platform/windows/clipboard_monitor.rs src-tauri/src/commands.rs
git commit -m "feat(rust): pause capture flag in monitor + get/toggle commands"
```

---

## Task 4: Tray icon feedback

**Files:**
- Create: `src-tauri/icons/32x32-paused.png`
- Modify: `src-tauri/src/windows.rs`
- Modify: `src-tauri/src/lib.rs` (shortcut handler)
- Modify: `src-tauri/src/commands.rs` (`toggle_capture_paused`)

- [ ] **Step 1: Create the paused icon placeholder**

Copy `32x32.png` as a starting placeholder. The designer should replace this with a visually distinct version (e.g., greyscale or with a small pause badge):

```bash
cp src-tauri/icons/32x32.png src-tauri/icons/32x32-paused.png
```

Commit the file after the designer delivers the final asset. For now the placeholder keeps the build working.

- [ ] **Step 2: Add `set_tray_icon` to `windows.rs`**

Add at the top of `windows.rs` (alongside the existing `use tauri::{...}` import, add `TrayIconExt` and `image::Image` if not already present):

```rust
use tauri::{AppHandle, Emitter, Manager, TrayIconExt, WebviewUrl, WebviewWindowBuilder, image::Image};
```

Add the new function after `open_settings`:

```rust
pub fn set_tray_icon(app: &AppHandle, paused: bool) {
    let icon_bytes: &[u8] = if paused {
        include_bytes!("../icons/32x32-paused.png")
    } else {
        include_bytes!("../icons/32x32.png")
    };
    if let Ok(icon) = Image::from_bytes(icon_bytes) {
        if let Some(tray) = app.tray_by_id("main-tray") {
            let _ = tray.set_icon(Some(icon));
        }
    }
}
```

- [ ] **Step 3: Call `set_tray_icon` from the shortcut handler in `lib.rs`**

In the shortcut handler closure (inside `run()`), replace the `if is_pause { ... }` block:

```rust
if is_pause {
    let paused = !pause_capture_handler.paused.load(Ordering::SeqCst);
    pause_capture_handler.paused.store(paused, Ordering::SeqCst);
    let _ = app.emit("capture-paused-changed", paused);
    windows::set_tray_icon(app, paused);
} else {
    windows::toggle_popup(app);
}
```

- [ ] **Step 4: Call `set_tray_icon` from `toggle_capture_paused` in `commands.rs`**

Replace the existing `toggle_capture_paused` function body:

```rust
#[tauri::command]
pub fn toggle_capture_paused(
    pause: PauseCaptureState,
    app_handle: tauri::AppHandle,
) -> bool {
    let paused = !pause.paused.load(Ordering::SeqCst);
    pause.paused.store(paused, Ordering::SeqCst);
    let _ = app_handle.emit("capture-paused-changed", paused);
    crate::windows::set_tray_icon(&app_handle, paused);
    paused
}
```

- [ ] **Step 5: Build the Rust crate**

Run: `cd src-tauri && cargo build 2>&1`
Expected: successful build with no errors

- [ ] **Step 6: Commit**

```bash
git add src-tauri/icons/32x32-paused.png src-tauri/src/windows.rs src-tauri/src/lib.rs src-tauri/src/commands.rs
git commit -m "feat(rust): update tray icon when capture is paused/resumed"
```

---

## Task 5: Angular model + i18n + bridge

**Files:**
- Modify: `src/app/core/models/settings.model.ts`
- Modify: `src/app/i18n/translation.interface.ts`
- Modify: `src/app/i18n/en.ts`
- Modify: `src/app/i18n/de.ts`
- Modify: `src/app/core/services/tauri-bridge.service.ts`

- [ ] **Step 1: Add `pauseShortcut` to `settings.model.ts`**

Add the field to the interface and default:

```typescript
export interface AppSettings {
  shortcut: string;
  maxEntries: number;
  language: Language | null;
  theme: Theme;
  autostart: boolean;
  deleteAfterMaxEntries: boolean;
  deleteAfterDays: boolean;
  maxDays: number;
  windowPosition: WindowPositionMode;
  pauseShortcut: string;
}

export const DEFAULT_SETTINGS: AppSettings = {
  shortcut: 'Ctrl+Semicolon',
  maxEntries: 20,
  language: null,
  theme: 'system',
  autostart: false,
  deleteAfterMaxEntries: true,
  deleteAfterDays: false,
  maxDays: 30,
  windowPosition: 'cursor',
  pauseShortcut: '',
};
```

- [ ] **Step 2: Update `translation.interface.ts` to add new keys**

Add to the `SETTINGS` group (inside the `SETTINGS: { ... }` block):

```typescript
PAUSE_SHORTCUT_LABEL: string;
CAPTURE_LABEL: string;
```

Add a new top-level `CLIPBOARD` key `CAPTURE_LABEL` is better placed in the `CLIPBOARD` group since the switch lives in the clipboard list header. Add to the `CLIPBOARD` group:

```typescript
CAPTURE_LABEL: string;
```

- [ ] **Step 3: Add translations to `en.ts`**

Add to the `SETTINGS` group (after `EXCLUDED_APPS_ADDED`):

```typescript
PAUSE_SHORTCUT_LABEL: 'Pause capture shortcut',
```

Add to the `CLIPBOARD` group (after `EDIT_COPY_FAILED`):

```typescript
CAPTURE_LABEL: 'Capture',
```

- [ ] **Step 4: Add translations to `de.ts`**

Add to the `SETTINGS` group (after `EXCLUDED_APPS_ADDED`):

```typescript
PAUSE_SHORTCUT_LABEL: 'Aufnahme-Pause-Shortcut',
```

Add to the `CLIPBOARD` group (after `EDIT_COPY_FAILED`):

```typescript
CAPTURE_LABEL: 'Aufnahme',
```

- [ ] **Step 5: Add three methods to `tauri-bridge.service.ts`**

Add after `removeExcludedApp`:

```typescript
getCapturePaused(): Promise<boolean> {
  return invoke<boolean>('get_capture_paused');
}

toggleCapturePaused(): Promise<boolean> {
  return invoke<boolean>('toggle_capture_paused');
}

onCapturePausedChanged(handler: (paused: boolean) => void): Promise<UnlistenFn> {
  return listen<boolean>('capture-paused-changed', (event) => handler(event.payload));
}
```

- [ ] **Step 6: Run Angular typecheck**

Run: `npx tsc --noEmit 2>&1`
Expected: no errors (warnings OK)

- [ ] **Step 7: Commit**

```bash
git add src/app/core/models/settings.model.ts src/app/i18n/translation.interface.ts src/app/i18n/en.ts src/app/i18n/de.ts src/app/core/services/tauri-bridge.service.ts
git commit -m "feat(angular): pauseShortcut model + i18n keys + bridge methods"
```

---

## Task 6: HlmSwitch component

**Files:**
- Create: `src/libs/ui/switch/src/lib/hlm-switch.ts`
- Create: `src/libs/ui/switch/src/index.ts`
- Modify: `tsconfig.json`

- [ ] **Step 1: Create `hlm-switch.ts`**

Create file at `src/libs/ui/switch/src/lib/hlm-switch.ts`:

```typescript
import { booleanAttribute, ChangeDetectionStrategy, Component, computed, input, model, output } from '@angular/core';
import type { BooleanInput } from '@angular/cdk/coercion';
import { BrnSwitchImports } from '@spartan-ng/brain/switch';
import { hlm } from '@spartan-ng/helm/utils';
import type { ClassValue } from 'clsx';

@Component({
  selector: 'hlm-switch',
  imports: [BrnSwitchImports],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <brn-switch
      [id]="id()"
      [checked]="checked()"
      [disabled]="disabled()"
      [class]="_computedClass()"
      (checkedChange)="checkedChange.emit($event)"
    >
      <brn-switch-thumb
        class="block size-4 rounded-full bg-background shadow-md ring-0 transition-transform data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0.5"
      />
    </brn-switch>
  `,
})
export class HlmSwitch {
  readonly id = input<string | null>(null);
  readonly checked = model<boolean>(false);
  readonly disabled = input<boolean, BooleanInput>(false, { transform: booleanAttribute });
  readonly userClass = input<ClassValue>('', { alias: 'class' });
  readonly checkedChange = output<boolean>();

  protected readonly _computedClass = computed(() =>
    hlm(
      'relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-green-500 data-[state=unchecked]:bg-red-500',
      this.userClass(),
    ),
  );
}

export const HlmSwitchImports = [HlmSwitch] as const;
```

- [ ] **Step 2: Create `index.ts` for the switch lib**

Create file at `src/libs/ui/switch/src/index.ts`:

```typescript
import { HlmSwitch } from './lib/hlm-switch';

export * from './lib/hlm-switch';

export const HlmSwitchImports = [HlmSwitch] as const;
```

- [ ] **Step 3: Add switch path to `tsconfig.json`**

In the `"paths"` block, add after the last existing entry:

```json
"@spartan-ng/helm/switch": ["./src/libs/ui/switch/src/index.ts"]
```

- [ ] **Step 4: Run Angular typecheck**

Run: `npx tsc --noEmit 2>&1`
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add src/libs/ui/switch/ tsconfig.json
git commit -m "feat(angular): add HlmSwitch component"
```

---

## Task 7: ClipboardList header switch

**Files:**
- Modify: `src/app/features/clipboard-list/clipboard-list.component.ts`

- [ ] **Step 1: Add imports**

Add to the import list at the top of `clipboard-list.component.ts`:

```typescript
import { HlmSwitchImports } from '@spartan-ng/helm/switch';
```

- [ ] **Step 2: Add `HlmSwitchImports` to the component's `imports` array**

In the `@Component` decorator, add `HlmSwitchImports` to the `imports` array (alongside the existing HlmButton, HlmBadge, etc.).

- [ ] **Step 3: Add `captureIsPaused` signal and unlisten reference**

In the class body, add after the existing signal declarations (e.g., after `protected duplicateError`):

```typescript
protected captureIsPaused = signal(false);
private unlistenCapturePaused?: UnlistenFn;
```

- [ ] **Step 4: Load initial pause state on popup-shown and subscribe to changes**

In `ngOnInit()`, inside the `this.bridge.onPopupShown(() => { ... }).then(...)` callback, add a call to load initial state after the existing reset lines:

```typescript
this.bridge.getCapturePaused().then((paused) => this.captureIsPaused.set(paused));
```

Below the `onPopupShown` block (still in `ngOnInit`), add:

```typescript
this.bridge
  .onCapturePausedChanged((paused) => this.captureIsPaused.set(paused))
  .then((fn) => {
    this.unlistenCapturePaused = fn;
  });
```

- [ ] **Step 5: Clean up listener in `ngOnDestroy`**

In `ngOnDestroy()`, add:

```typescript
this.unlistenCapturePaused?.();
```

- [ ] **Step 6: Add toggle method**

Add to the class body:

```typescript
protected async onCaptureSwitchChange(checked: boolean): Promise<void> {
  this.captureIsPaused.set(!checked);
  await this.bridge.toggleCapturePaused();
}
```

- [ ] **Step 7: Add switch + label to the header template**

In the template, find the `<ng-container end>` block inside `<app-page-header>`:

```html
<ng-container end>
  <a
    routerLink="/settings"
    class="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
  >
    <ng-icon hlm size="sm" name="lucideSettings" />
  </a>
</ng-container>
```

Replace with:

```html
<ng-container end>
  <span class="text-[11px] text-muted-foreground select-none">{{ 'CLIPBOARD.CAPTURE_LABEL' | translate }}</span>
  <hlm-switch
    [checked]="!captureIsPaused()"
    (checkedChange)="onCaptureSwitchChange($event)"
  />
  <a
    routerLink="/settings"
    class="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
  >
    <ng-icon hlm size="sm" name="lucideSettings" />
  </a>
</ng-container>
```

- [ ] **Step 8: Run typecheck**

Run: `npx tsc --noEmit 2>&1`
Expected: no errors

- [ ] **Step 9: Run existing tests**

Run: `pnpm test 2>&1`
Expected: all tests pass

- [ ] **Step 10: Run prettier on changed file**

Run: `npx prettier --write src/app/features/clipboard-list/clipboard-list.component.ts`

- [ ] **Step 11: Commit**

```bash
git add src/app/features/clipboard-list/clipboard-list.component.ts
git commit -m "feat(angular): add capture pause switch to clipboard list header"
```

---

## Task 8: Settings pause shortcut field

**Files:**
- Modify: `src/app/features/settings/settings.component.ts`

- [ ] **Step 1: Add `onPauseShortcutCapture` handler to `SettingsComponent`**

In `settings.component.ts`, add a new handler method after `onWindowPositionChange`:

```typescript
protected onPauseShortcutCapture(event: KeyboardEvent): void {
  event.preventDefault();
  const parts: string[] = [];
  if (event.ctrlKey) parts.push('Ctrl');
  if (event.altKey) parts.push('Alt');
  if (event.shiftKey) parts.push('Shift');
  if (event.metaKey) parts.push('Super');

  const key = event.code;
  if (
    ![
      'ControlLeft', 'ControlRight',
      'AltLeft', 'AltRight',
      'ShiftLeft', 'ShiftRight',
      'MetaLeft', 'MetaRight',
    ].includes(key)
  ) {
    if (parts.length === 0) {
      this.settings.update((s) => ({ ...s, pauseShortcut: '' }));
      this.persist();
      return;
    }
    const cleanKey = key.startsWith('Key') ? key.slice(3) : key;
    parts.push(cleanKey);
    if (parts.length > 1) {
      this.settings.update((s) => ({ ...s, pauseShortcut: parts.join('+') }));
      this.persist();
    }
  }
}

protected clearPauseShortcut(): void {
  this.settings.update((s) => ({ ...s, pauseShortcut: '' }));
  this.persist();
}
```

- [ ] **Step 2: Add pause shortcut field to the Privacy section in the template**

Find the Privacy section in the template:

```html
<!-- Privacy -->
<div class="space-y-3">
  <p class="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
    {{ 'SETTINGS.GROUP_PRIVACY' | translate }}
  </p>
  <app-setting-field [label]="'SETTINGS.EXCLUDED_APPS_LABEL' | translate">
    <app-excluded-apps />
  </app-setting-field>
</div>
```

Replace with:

```html
<!-- Privacy -->
<div class="space-y-3">
  <p class="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
    {{ 'SETTINGS.GROUP_PRIVACY' | translate }}
  </p>
  <app-setting-field [label]="'SETTINGS.EXCLUDED_APPS_LABEL' | translate">
    <app-excluded-apps />
  </app-setting-field>
  <app-setting-field [label]="'SETTINGS.PAUSE_SHORTCUT_LABEL' | translate">
    <div class="relative w-full">
      <input
        hlmInput
        type="text"
        [value]="settings().pauseShortcut"
        class="w-full font-mono pr-8"
        [placeholder]="'SETTINGS.SHORTCUT_PLACEHOLDER' | translate"
        (keydown)="onPauseShortcutCapture($event)"
        readonly
      />
      @if (settings().pauseShortcut) {
        <button
          type="button"
          class="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
          (click)="clearPauseShortcut()"
        >
          <ng-icon hlm size="sm" name="lucideX" />
        </button>
      }
    </div>
  </app-setting-field>
</div>
```

Note: `lucideX` is already in the `provideIcons` call in this component, so no change needed there.

- [ ] **Step 3: Run typecheck**

Run: `npx tsc --noEmit 2>&1`
Expected: no errors

- [ ] **Step 4: Run prettier on changed file**

Run: `npx prettier --write src/app/features/settings/settings.component.ts`

- [ ] **Step 5: Commit**

```bash
git add src/app/features/settings/settings.component.ts
git commit -m "feat(angular): add pause capture shortcut field in Privacy settings"
```

---

## Final: Full build verification

- [ ] **Step 1: Build the Tauri app**

Run: `pnpm tauri build 2>&1` (or `pnpm tauri dev` to test interactively)
Expected: build completes, app launches, header switch shows green by default, toggling pauses capture.

- [ ] **Step 2: Manual verification checklist**

1. Open the clipboard popup → header shows "Capture" label + green switch
2. Toggle switch → turns red, clipboard changes no longer appear in history
3. Toggle back → turns green, clipboard capture resumes
4. In Settings → Privacy → enter a shortcut in "Pause capture shortcut" field
5. Press the hotkey while popup is closed → capture toggles (verify by copying something)
6. Press the hotkey while popup is open → switch updates in real time
7. Close and reopen app → switch starts green (state not persisted across restarts)
8. Clear the pause shortcut field → clicking X removes the shortcut

- [ ] **Step 3: Run all tests**

Run: `pnpm test 2>&1`
Expected: all tests pass
