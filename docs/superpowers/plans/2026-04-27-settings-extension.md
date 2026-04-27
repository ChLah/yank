# Settings Extension Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend settings with autostart at login, optional max-entries deletion (5–999), and optional age-based deletion (1–365 days), backed by a typed SQLite schema (v1).

**Architecture:** Flat `AppSettings` struct gains four new fields; `PRAGMA user_version` gates a drop-and-recreate migration of the settings table from `value TEXT` to `value_text TEXT / value_int INTEGER`; Angular gets matching model fields and three new UI sections with checkboxes that visually disable dependent inputs.

**Tech Stack:** Rust/Tauri 2, rusqlite, tauri-plugin-autostart v2, Angular 21, signal-based state, Tailwind CSS, @spartan-ng/helm

---

## File Map

| File | Change |
|------|--------|
| `src-tauri/Cargo.toml` | Add tauri-plugin-autostart = "2" |
| `src-tauri/src/lib.rs` | Register autostart plugin; call startup age pruning |
| `src-tauri/src/models.rs` | Add 4 fields to AppSettings + update Default |
| `src-tauri/src/store/sqlite_store.rs` | Schema migration v1; typed read/write; conditional + age pruning |
| `src-tauri/src/commands.rs` | Autostart toggle in save_settings |
| `src/app/core/models/settings.model.ts` | Add 4 fields + update DEFAULT_SETTINGS |
| `src/app/i18n/translation.interface.ts` | Add 4 new keys to SETTINGS interface |
| `src/app/i18n/en.ts` | Add English strings |
| `src/app/i18n/de.ts` | Add German strings |
| `src/app/features/settings/settings.component.ts` | Add 3 sections, checkbox handlers, updated clamps |

---

## Task 1: Add tauri-plugin-autostart

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Add the crate dependency**

In `src-tauri/Cargo.toml`, after the `tauri-plugin-global-shortcut` line:

```toml
tauri-plugin-global-shortcut = "2"
tauri-plugin-autostart = "2"
```

- [ ] **Step 2: Register the plugin in lib.rs**

In `src-tauri/src/lib.rs`, add the plugin to the builder chain after the `tauri_plugin_global_shortcut` plugin block (before `.setup`):

```rust
.plugin(tauri_plugin_autostart::init(
    tauri_plugin_autostart::MacosLauncher::LaunchAgent,
    None,
))
```

The full builder start should look like:

```rust
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
```

- [ ] **Step 3: Verify it compiles**

```bash
cd src-tauri && cargo check
```

Expected: no errors (the plugin is registered but not yet used).

- [ ] **Step 4: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/src/lib.rs
git commit -m "feat(autostart): add tauri-plugin-autostart dependency and registration"
```

---

## Task 2: SQLite schema migration v1

**Files:**
- Modify: `src-tauri/src/store/sqlite_store.rs` (only `run_migrations` + its tests)

- [ ] **Step 1: Write the failing test**

In the `#[cfg(test)] mod tests` block at the bottom of `sqlite_store.rs`, add after `test_migration_is_idempotent`:

```rust
#[test]
fn test_settings_schema_v1_columns() {
    let store = in_memory_store();
    let conn = store.conn.lock().unwrap();
    let mut stmt = conn.prepare("PRAGMA table_info(settings)").unwrap();
    let cols: Vec<String> = stmt
        .query_map([], |r| r.get::<_, String>(1))
        .unwrap()
        .filter_map(|r| r.ok())
        .collect();
    assert!(cols.contains(&"key".to_string()), "missing 'key' column");
    assert!(cols.contains(&"value_text".to_string()), "missing 'value_text' column");
    assert!(cols.contains(&"value_int".to_string()), "missing 'value_int' column");
    assert!(!cols.contains(&"value".to_string()), "old 'value' column should not exist");
}
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd src-tauri && cargo test test_settings_schema_v1_columns -- --nocapture
```

Expected: FAIL — `value_text` and `value_int` columns don't exist yet.

- [ ] **Step 3: Update run_migrations to add schema versioning**

Replace the `run_migrations` method in `SqliteStore` (lines 24–63 of `sqlite_store.rs`) with:

```rust
fn run_migrations(&self) -> Result<(), rusqlite::Error> {
    let conn = self.conn.lock().unwrap();
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS entries (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            kind         TEXT    NOT NULL,
            content      BLOB    NOT NULL,
            thumbnail    BLOB,
            width        INTEGER,
            height       INTEGER,
            hash         TEXT    NOT NULL UNIQUE,
            created_at   INTEGER NOT NULL,
            last_used_at INTEGER NOT NULL,
            pinned       INTEGER NOT NULL DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS idx_entries_last_used ON entries (last_used_at DESC);"
    )?;

    // Legacy: add pinned column to pre-existing entries tables that lack it.
    let has_pinned: bool = {
        let mut stmt = conn.prepare("PRAGMA table_info(entries)")?;
        let cols: Vec<String> = stmt
            .query_map([], |row| row.get::<_, String>(1))?
            .filter_map(|r| r.ok())
            .collect();
        cols.iter().any(|name| name == "pinned")
    };
    if !has_pinned {
        conn.execute_batch(
            "ALTER TABLE entries ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0;"
        )?;
    }

    // Settings schema versioning via PRAGMA user_version.
    // v0: single `value TEXT` column (old schema, reset on upgrade)
    // v1: typed `value_text TEXT` / `value_int INTEGER` columns
    let user_version: i64 = conn.query_row(
        "PRAGMA user_version", [], |row| row.get(0)
    )?;
    if user_version < 1 {
        conn.execute_batch(
            "DROP TABLE IF EXISTS settings;
             CREATE TABLE settings (
                 key        TEXT PRIMARY KEY,
                 value_text TEXT,
                 value_int  INTEGER
             );
             PRAGMA user_version = 1;"
        )?;
    }

    Ok(())
}
```

- [ ] **Step 4: Run the new test to verify it passes**

```bash
cd src-tauri && cargo test test_settings_schema_v1_columns -- --nocapture
```

Expected: PASS.

- [ ] **Step 5: Run all existing tests**

```bash
cd src-tauri && cargo test -- --nocapture
```

Expected: `test_settings_round_trip` and pruning tests may now fail because `save_settings` still writes to the old `value` column. That is expected — they will be fixed in Task 4. All other tests should pass.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/store/sqlite_store.rs
git commit -m "feat(db): add schema v1 migration — typed value_text/value_int columns"
```

---

## Task 3: Update Rust AppSettings model

**Files:**
- Modify: `src-tauri/src/models.rs`

- [ ] **Step 1: Add four new fields and update Default**

Replace the `AppSettings` struct and its `Default` impl (lines 33–51 of `models.rs`) with:

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
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            shortcut: "Ctrl+Quote".to_string(),
            max_entries: 20,
            language: None,
            theme: Theme::System,
            autostart: false,
            delete_after_max_entries: true,
            delete_after_days: false,
            max_days: 30,
        }
    }
}
```

- [ ] **Step 2: Fix compile errors in existing tests**

The tests in `sqlite_store.rs` that construct `AppSettings` with struct literals will now fail to compile. Update each one to use `..AppSettings::default()` for the new fields.

In `test_prunes_beyond_max_entries` (around line 403):

```rust
store.save_settings(&AppSettings {
    shortcut: "Ctrl+SEMICOLON".into(),
    max_entries: 3,
    delete_after_max_entries: true,
    ..AppSettings::default()
}).unwrap();
```

In `test_settings_round_trip` (around line 426):

```rust
let settings = AppSettings {
    shortcut: "Ctrl+ALT+V".to_string(),
    max_entries: 10,
    ..AppSettings::default()
};
// ...
let dark_settings = AppSettings {
    shortcut: "Ctrl+A".to_string(),
    max_entries: 10,
    theme: Theme::Dark,
    ..AppSettings::default()
};
// ...
let light_settings = AppSettings {
    shortcut: "Ctrl+B".to_string(),
    max_entries: 5,
    theme: Theme::Light,
    ..AppSettings::default()
};
```

In `test_pinned_entries_not_pruned` (around line 512):

```rust
store.save_settings(&AppSettings {
    max_entries: 2,
    delete_after_max_entries: true,
    ..AppSettings::default()
}).unwrap();
```

- [ ] **Step 3: Verify it compiles**

```bash
cd src-tauri && cargo check
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/models.rs src-tauri/src/store/sqlite_store.rs
git commit -m "feat(models): add autostart, deleteAfterMaxEntries, deleteAfterDays, maxDays fields"
```

---

## Task 4: Update SQLite settings read/write

**Files:**
- Modify: `src-tauri/src/store/sqlite_store.rs`

- [ ] **Step 1: Write the failing test for new fields round-trip**

Add to `#[cfg(test)] mod tests`:

```rust
#[test]
fn test_new_settings_fields_round_trip() {
    let store = in_memory_store();
    let settings = AppSettings {
        autostart: true,
        delete_after_max_entries: false,
        delete_after_days: true,
        max_days: 14,
        ..AppSettings::default()
    };
    store.save_settings(&settings).unwrap();
    let loaded = store.get_settings().unwrap();
    assert_eq!(loaded.autostart, true);
    assert_eq!(loaded.delete_after_max_entries, false);
    assert_eq!(loaded.delete_after_days, true);
    assert_eq!(loaded.max_days, 14);
}
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd src-tauri && cargo test test_new_settings_fields_round_trip -- --nocapture
```

Expected: FAIL — `get_settings` still returns defaults for new fields.

- [ ] **Step 3: Replace get_settings**

Replace the `get_settings` method (lines 236–284) with:

```rust
pub fn get_settings(&self) -> Result<AppSettings, Box<dyn std::error::Error>> {
    let conn = self.conn.lock().unwrap();

    let shortcut = conn
        .query_row(
            "SELECT value_text FROM settings WHERE key = 'shortcut'",
            [],
            |row| row.get::<_, Option<String>>(0),
        )
        .ok()
        .flatten()
        .unwrap_or_else(|| AppSettings::default().shortcut);

    let max_entries = conn
        .query_row(
            "SELECT value_int FROM settings WHERE key = 'maxEntries'",
            [],
            |row| row.get::<_, Option<i64>>(0),
        )
        .ok()
        .flatten()
        .unwrap_or(AppSettings::default().max_entries);

    let language = conn
        .query_row(
            "SELECT value_text FROM settings WHERE key = 'language'",
            [],
            |row| row.get::<_, Option<String>>(0),
        )
        .ok()
        .flatten()
        .and_then(|v| match v.as_str() {
            "en" => Some(Language::En),
            "de" => Some(Language::De),
            _ => None,
        });

    let theme = conn
        .query_row(
            "SELECT value_text FROM settings WHERE key = 'theme'",
            [],
            |row| row.get::<_, Option<String>>(0),
        )
        .ok()
        .flatten()
        .map(|v| match v.as_str() {
            "dark" => Theme::Dark,
            "light" => Theme::Light,
            _ => Theme::System,
        })
        .unwrap_or(Theme::System);

    let autostart = conn
        .query_row(
            "SELECT value_int FROM settings WHERE key = 'autostart'",
            [],
            |row| row.get::<_, Option<i64>>(0),
        )
        .ok()
        .flatten()
        .map(|v| v != 0)
        .unwrap_or(false);

    let delete_after_max_entries = conn
        .query_row(
            "SELECT value_int FROM settings WHERE key = 'deleteAfterMaxEntries'",
            [],
            |row| row.get::<_, Option<i64>>(0),
        )
        .ok()
        .flatten()
        .map(|v| v != 0)
        .unwrap_or(true);

    let delete_after_days = conn
        .query_row(
            "SELECT value_int FROM settings WHERE key = 'deleteAfterDays'",
            [],
            |row| row.get::<_, Option<i64>>(0),
        )
        .ok()
        .flatten()
        .map(|v| v != 0)
        .unwrap_or(false);

    let max_days = conn
        .query_row(
            "SELECT value_int FROM settings WHERE key = 'maxDays'",
            [],
            |row| row.get::<_, Option<i64>>(0),
        )
        .ok()
        .flatten()
        .unwrap_or(30);

    Ok(AppSettings { shortcut, max_entries, language, theme, autostart, delete_after_max_entries, delete_after_days, max_days })
}
```

- [ ] **Step 4: Replace save_settings**

Replace the `save_settings` method (lines 286–321) with:

```rust
pub fn save_settings(&self, settings: &AppSettings) -> Result<(), rusqlite::Error> {
    let conn = self.conn.lock().unwrap();
    conn.execute(
        "INSERT OR REPLACE INTO settings (key, value_text) VALUES ('shortcut', ?1)",
        params![settings.shortcut],
    )?;
    conn.execute(
        "INSERT OR REPLACE INTO settings (key, value_int) VALUES ('maxEntries', ?1)",
        params![settings.max_entries],
    )?;
    match &settings.language {
        Some(lang) => {
            let lang_str = match lang { Language::En => "en", Language::De => "de" };
            conn.execute(
                "INSERT OR REPLACE INTO settings (key, value_text) VALUES ('language', ?1)",
                params![lang_str],
            )?;
        }
        None => {
            conn.execute("DELETE FROM settings WHERE key = 'language'", [])?;
        }
    }
    let theme_str = match settings.theme {
        Theme::Dark => "dark",
        Theme::Light => "light",
        Theme::System => "system",
    };
    conn.execute(
        "INSERT OR REPLACE INTO settings (key, value_text) VALUES ('theme', ?1)",
        params![theme_str],
    )?;
    conn.execute(
        "INSERT OR REPLACE INTO settings (key, value_int) VALUES ('autostart', ?1)",
        params![settings.autostart as i64],
    )?;
    conn.execute(
        "INSERT OR REPLACE INTO settings (key, value_int) VALUES ('deleteAfterMaxEntries', ?1)",
        params![settings.delete_after_max_entries as i64],
    )?;
    conn.execute(
        "INSERT OR REPLACE INTO settings (key, value_int) VALUES ('deleteAfterDays', ?1)",
        params![settings.delete_after_days as i64],
    )?;
    conn.execute(
        "INSERT OR REPLACE INTO settings (key, value_int) VALUES ('maxDays', ?1)",
        params![settings.max_days],
    )?;
    Ok(())
}
```

- [ ] **Step 5: Replace get_max_entries_internal**

Replace the `get_max_entries_internal` method (lines 323–332) with a broader `get_prune_settings_internal` that returns all four pruning-relevant values. This avoids multiple lock acquisitions inside `save_entry`:

```rust
fn get_prune_settings_internal(&self, conn: &Connection) -> (bool, i64, bool, i64) {
    let delete_after_max_entries = conn
        .query_row(
            "SELECT value_int FROM settings WHERE key = 'deleteAfterMaxEntries'",
            [],
            |row| row.get::<_, Option<i64>>(0),
        )
        .ok()
        .flatten()
        .map(|v| v != 0)
        .unwrap_or(true);

    let max_entries = conn
        .query_row(
            "SELECT value_int FROM settings WHERE key = 'maxEntries'",
            [],
            |row| row.get::<_, Option<i64>>(0),
        )
        .ok()
        .flatten()
        .unwrap_or(20);

    let delete_after_days = conn
        .query_row(
            "SELECT value_int FROM settings WHERE key = 'deleteAfterDays'",
            [],
            |row| row.get::<_, Option<i64>>(0),
        )
        .ok()
        .flatten()
        .map(|v| v != 0)
        .unwrap_or(false);

    let max_days = conn
        .query_row(
            "SELECT value_int FROM settings WHERE key = 'maxDays'",
            [],
            |row| row.get::<_, Option<i64>>(0),
        )
        .ok()
        .flatten()
        .unwrap_or(30);

    (delete_after_max_entries, max_entries, delete_after_days, max_days)
}
```

- [ ] **Step 6: Run all tests**

```bash
cd src-tauri && cargo test -- --nocapture
```

Expected: all tests pass including `test_new_settings_fields_round_trip` and the existing `test_settings_round_trip`.

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/store/sqlite_store.rs
git commit -m "feat(db): update settings read/write for typed schema v1"
```

---

## Task 5: Update deletion logic and add age pruning

**Files:**
- Modify: `src-tauri/src/store/sqlite_store.rs`

- [ ] **Step 1: Write failing tests**

Add to `#[cfg(test)] mod tests`:

```rust
#[test]
fn test_prune_max_entries_disabled() {
    let store = in_memory_store();
    store.save_settings(&AppSettings {
        max_entries: 2,
        delete_after_max_entries: false,
        ..AppSettings::default()
    }).unwrap();

    for i in 0..5 {
        store.save_entry(&text_payload(&format!("entry {}", i))).unwrap();
    }

    assert_eq!(store.get_all_entries().unwrap().len(), 5);
}

#[test]
fn test_prune_old_entries_by_age() {
    let store = in_memory_store();
    store.save_settings(&AppSettings {
        delete_after_max_entries: false,
        delete_after_days: true,
        max_days: 1,
        ..AppSettings::default()
    }).unwrap();

    let old_ts = chrono::Utc::now().timestamp() - 2 * 86400;
    let new_ts = chrono::Utc::now().timestamp();
    {
        let conn = store.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO entries (kind, content, hash, created_at, last_used_at, pinned) VALUES ('text', ?1, 'hash_old', ?2, ?2, 0)",
            params![b"old entry".to_vec(), old_ts],
        ).unwrap();
        conn.execute(
            "INSERT INTO entries (kind, content, hash, created_at, last_used_at, pinned) VALUES ('text', ?1, 'hash_new', ?2, ?2, 0)",
            params![b"new entry".to_vec(), new_ts],
        ).unwrap();
    }

    store.save_entry(&text_payload("trigger")).unwrap();

    let entries = store.get_all_entries().unwrap();
    assert!(!entries.iter().any(|e| e.content.as_deref() == Some("old entry")), "old entry should have been pruned");
    assert!(entries.iter().any(|e| e.content.as_deref() == Some("new entry")));
}

#[test]
fn test_prune_old_entries_if_enabled_on_startup() {
    let store = in_memory_store();
    store.save_settings(&AppSettings {
        delete_after_max_entries: false,
        delete_after_days: true,
        max_days: 1,
        ..AppSettings::default()
    }).unwrap();

    let old_ts = chrono::Utc::now().timestamp() - 2 * 86400;
    {
        let conn = store.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO entries (kind, content, hash, created_at, last_used_at, pinned) VALUES ('text', ?1, 'hash_stale', ?2, ?2, 0)",
            params![b"stale".to_vec(), old_ts],
        ).unwrap();
    }

    store.prune_old_entries_if_enabled().unwrap();
    assert!(store.get_all_entries().unwrap().is_empty());
}
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd src-tauri && cargo test test_prune_max_entries_disabled test_prune_old_entries_by_age test_prune_old_entries_if_enabled_on_startup -- --nocapture
```

Expected: FAIL — `prune_old_entries_if_enabled` doesn't exist; age pruning doesn't happen; disabled flag is ignored.

- [ ] **Step 3: Update save_entry to use get_prune_settings_internal**

Replace the `save_entry` method (lines 66–116). The changed section starts after the match/insert block. Replace the unconditional prune at lines 107–113 with:

```rust
pub fn save_entry(&self, payload: &ClipboardPayload) -> Result<(), Box<dyn std::error::Error>> {
    let now = chrono::Utc::now().timestamp();
    let conn = self.conn.lock().unwrap();

    let existing: Option<i64> = conn
        .query_row(
            "SELECT id FROM entries WHERE hash = ?1",
            params![payload.hash],
            |row| row.get(0),
        )
        .ok();

    if let Some(id) = existing {
        conn.execute(
            "UPDATE entries SET last_used_at = ?1 WHERE id = ?2",
            params![now, id],
        )?;
        return Ok(());
    }

    let (delete_after_max_entries, max_entries, delete_after_days, max_days) =
        self.get_prune_settings_internal(&conn);

    match &payload.content {
        ClipboardContent::Text(text) => {
            conn.execute(
                "INSERT INTO entries (kind, content, thumbnail, width, height, hash, created_at, last_used_at)
                 VALUES ('text', ?1, NULL, NULL, NULL, ?2, ?3, ?3)",
                params![text.as_bytes(), payload.hash, now],
            )?;
        }
        ClipboardContent::Image { rgba_bytes, width, height } => {
            let png_bytes = encode_rgba_to_png(rgba_bytes, *width, *height)?;
            let thumbnail_bytes = generate_thumbnail(&png_bytes)?;
            conn.execute(
                "INSERT INTO entries (kind, content, thumbnail, width, height, hash, created_at, last_used_at)
                 VALUES ('image', ?1, ?2, ?3, ?4, ?5, ?6, ?6)",
                params![png_bytes, thumbnail_bytes, width, height, payload.hash, now],
            )?;
        }
    }

    if delete_after_max_entries {
        conn.execute(
            "DELETE FROM entries WHERE id IN (
                SELECT id FROM entries WHERE pinned = 0 ORDER BY last_used_at DESC LIMIT -1 OFFSET ?1
             )",
            params![max_entries],
        )?;
    }

    if delete_after_days {
        let cutoff = now - max_days * 86400;
        conn.execute(
            "DELETE FROM entries WHERE pinned = 0 AND created_at < ?1",
            params![cutoff],
        )?;
    }

    Ok(())
}
```

- [ ] **Step 4: Add prune_old_entries_if_enabled public method**

Add this method to `SqliteStore`, after `save_entry`:

```rust
pub fn prune_old_entries_if_enabled(&self) -> Result<(), Box<dyn std::error::Error>> {
    let conn = self.conn.lock().unwrap();
    let delete_after_days = conn
        .query_row(
            "SELECT value_int FROM settings WHERE key = 'deleteAfterDays'",
            [],
            |row| row.get::<_, Option<i64>>(0),
        )
        .ok()
        .flatten()
        .map(|v| v != 0)
        .unwrap_or(false);

    if delete_after_days {
        let max_days = conn
            .query_row(
                "SELECT value_int FROM settings WHERE key = 'maxDays'",
                [],
                |row| row.get::<_, Option<i64>>(0),
            )
            .ok()
            .flatten()
            .unwrap_or(30);

        let cutoff = chrono::Utc::now().timestamp() - max_days * 86400;
        conn.execute(
            "DELETE FROM entries WHERE pinned = 0 AND created_at < ?1",
            params![cutoff],
        )?;
    }

    Ok(())
}
```

- [ ] **Step 5: Run all tests**

```bash
cd src-tauri && cargo test -- --nocapture
```

Expected: all tests pass including the three new ones.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/store/sqlite_store.rs
git commit -m "feat(db): conditional max-entries pruning and age-based entry deletion"
```

---

## Task 6: Add autostart toggle to save_settings command

**Files:**
- Modify: `src-tauri/src/commands.rs`

- [ ] **Step 1: Update save_settings command**

Replace the `save_settings` command (lines 33–47 of `commands.rs`) with:

```rust
#[tauri::command]
pub fn save_settings(
    settings: AppSettings,
    store: StoreState,
    app_handle: tauri::AppHandle,
) -> Result<(), String> {
    store.save_settings(&settings).map_err(|e| e.to_string())?;

    if let Err(e) = crate::shortcuts::register_shortcut(&app_handle, &settings.shortcut) {
        tracing::warn!("Failed to re-register shortcut '{}' after save: {}", settings.shortcut, e);
    }

    use tauri_plugin_autostart::ManagerExt;
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

- [ ] **Step 2: Verify it compiles**

```bash
cd src-tauri && cargo check
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/commands.rs
git commit -m "feat(autostart): toggle OS autostart in save_settings command"
```

---

## Task 7: Add startup age pruning in lib.rs

**Files:**
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Call prune_old_entries_if_enabled on startup**

In `lib.rs`, inside the `.setup(|app| { ... })` closure, add the pruning call after `app.manage(store.clone())` and before the shortcut registration. The updated setup block:

```rust
.setup(|app| {
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

    platform::start_monitor(app.handle().clone(), store);
    setup_tray(app)?;
    Ok(())
})
```

- [ ] **Step 2: Verify it compiles**

```bash
cd src-tauri && cargo check
```

Expected: no errors.

- [ ] **Step 3: Run all tests one final time for the Rust side**

```bash
cd src-tauri && cargo test -- --nocapture
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/lib.rs
git commit -m "feat(startup): prune old entries on app launch when age-deletion is enabled"
```

---

## Task 8: Update TypeScript model

**Files:**
- Modify: `src/app/core/models/settings.model.ts`

- [ ] **Step 1: Add four new fields**

Replace the full contents of `src/app/core/models/settings.model.ts` with:

```typescript
export type Language = 'en' | 'de';
export type Theme = 'dark' | 'light' | 'system';

export interface AppSettings {
  shortcut: string;
  maxEntries: number;
  language: Language | null;
  theme: Theme;
  autostart: boolean;
  deleteAfterMaxEntries: boolean;
  deleteAfterDays: boolean;
  maxDays: number;
}

export const DEFAULT_SETTINGS: AppSettings = {
  shortcut: 'Ctrl+SEMICOLON',
  maxEntries: 20,
  language: null,
  theme: 'system',
  autostart: false,
  deleteAfterMaxEntries: true,
  deleteAfterDays: false,
  maxDays: 30,
};
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
pnpm exec tsc --noEmit
```

Expected: no errors (new fields are additive; existing usages of AppSettings remain valid since `linkedSignal` in the component uses `DEFAULT_SETTINGS` as fallback).

- [ ] **Step 3: Commit**

```bash
git add src/app/core/models/settings.model.ts
git commit -m "feat(model): add autostart, deleteAfterMaxEntries, deleteAfterDays, maxDays fields"
```

---

## Task 9: Update translations

**Files:**
- Modify: `src/app/i18n/translation.interface.ts`
- Modify: `src/app/i18n/en.ts`
- Modify: `src/app/i18n/de.ts`

- [ ] **Step 1: Add keys to Translation interface**

In `src/app/i18n/translation.interface.ts`, add four keys to the `SETTINGS` block (after `SAVED: string;`):

```typescript
SETTINGS: {
    TITLE: string;
    SHORTCUT_LABEL: string;
    SHORTCUT_PLACEHOLDER: string;
    SHORTCUT_HINT: string;
    MAX_ENTRIES_LABEL: string;
    MAX_ENTRIES_RANGE: string;
    LANGUAGE_LABEL: string;
    LANGUAGE_SYSTEM: string;
    LANGUAGE_EN: string;
    LANGUAGE_DE: string;
    THEME_LABEL: string;
    THEME_SYSTEM: string;
    THEME_LIGHT: string;
    THEME_DARK: string;
    SAVE: string;
    SAVING: string;
    SAVED: string;
    AUTOSTART_LABEL: string;
    DELETE_AFTER_MAX_LABEL: string;
    DELETE_AFTER_DAYS_LABEL: string;
    MAX_DAYS_RANGE: string;
  };
```

- [ ] **Step 2: Add English strings**

In `src/app/i18n/en.ts`, add after `SAVED`:

```typescript
AUTOSTART_LABEL: 'Start at Login',
DELETE_AFTER_MAX_LABEL: 'Limit history size',
DELETE_AFTER_DAYS_LABEL: 'Auto-delete old entries',
MAX_DAYS_RANGE: 'days ({{min}} – {{max}})',
```

- [ ] **Step 3: Add German strings**

In `src/app/i18n/de.ts`, add after `SAVED`:

```typescript
AUTOSTART_LABEL: 'Beim Start ausführen',
DELETE_AFTER_MAX_LABEL: 'Verlauf begrenzen',
DELETE_AFTER_DAYS_LABEL: 'Alte Einträge löschen',
MAX_DAYS_RANGE: 'Tage ({{min}} – {{max}})',
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
pnpm exec tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/i18n/translation.interface.ts src/app/i18n/en.ts src/app/i18n/de.ts
git commit -m "feat(i18n): add translation keys for autostart and deletion settings"
```

---

## Task 10: Update Angular settings component

**Files:**
- Modify: `src/app/features/settings/settings.component.ts`

- [ ] **Step 1: Replace the full component**

Replace the entire file `src/app/features/settings/settings.component.ts` with:

```typescript
import {
  ChangeDetectionStrategy,
  Component,
  inject,
  linkedSignal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideChevronLeft } from '@ng-icons/lucide';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { HlmIcon } from '@spartan-ng/helm/icon';
import { HlmInput } from '@spartan-ng/helm/input';
import { HlmLabel } from '@spartan-ng/helm/label';
import { HlmSelectImports } from '@spartan-ng/helm/select';
import { toast } from '@spartan-ng/brain/sonner';
import { SettingsService } from '../../core/services/settings.service';
import { I18nService } from '../../core/services/i18n.service';
import { ThemeService } from '../../core/services/theme.service';
import { AppSettings, DEFAULT_SETTINGS, Language, Theme } from '../../core/models/settings.model';

@Component({
  selector: 'app-settings',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink, NgIcon, HlmIcon, HlmInput, HlmLabel,
    TranslatePipe, HlmSelectImports,
  ],
  providers: [provideIcons({ lucideChevronLeft })],
  template: `
    <div class="flex flex-col h-screen bg-background">

      <!-- Header -->
      <div class="px-3.5 h-11 flex items-center gap-2 shrink-0 bg-card border-b border-border">
        <a routerLink="/" class="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
          <ng-icon hlm size="sm" name="lucideChevronLeft" />
        </a>
        <span class="text-[13px] font-semibold text-foreground tracking-tight">{{ 'SETTINGS.TITLE' | translate }}</span>
      </div>

      @if (settingsService.settings.isLoading()) {
        <div class="flex-1 flex items-center justify-center">
          <div class="w-5 h-5 border-2 border-muted border-t-muted-foreground rounded-full animate-spin"></div>
        </div>
      } @else {
        <div class="flex-1 flex flex-col p-5 gap-5 overflow-y-auto">

          <!-- Global Shortcut -->
          <div class="space-y-1.5">
            <label hlmLabel class="block uppercase tracking-wider">{{ 'SETTINGS.SHORTCUT_LABEL' | translate }}</label>
            <input
              hlmInput
              type="text"
              [value]="settings().shortcut"
              class="w-full font-mono"
              [placeholder]="'SETTINGS.SHORTCUT_PLACEHOLDER' | translate"
              (keydown)="captureShortcut($event)"
              readonly
            />
            <p class="text-[11px] text-muted-foreground">
              {{ 'SETTINGS.SHORTCUT_HINT' | translate }}
            </p>
          </div>

          <!-- Start at Login -->
          <div class="space-y-1.5">
            <div class="flex items-center gap-2">
              <input
                type="checkbox"
                id="autostart-checkbox"
                [checked]="settings().autostart"
                (change)="onAutostartChange($event)"
                class="h-4 w-4 rounded border-border accent-primary cursor-pointer"
              />
              <label hlmLabel for="autostart-checkbox" class="uppercase tracking-wider cursor-pointer">
                {{ 'SETTINGS.AUTOSTART_LABEL' | translate }}
              </label>
            </div>
          </div>

          <!-- Limit history size -->
          <div class="space-y-1.5">
            <div class="flex items-center gap-2">
              <input
                type="checkbox"
                id="delete-max-checkbox"
                [checked]="settings().deleteAfterMaxEntries"
                (change)="onDeleteAfterMaxChange($event)"
                class="h-4 w-4 rounded border-border accent-primary cursor-pointer"
              />
              <label hlmLabel for="delete-max-checkbox" class="uppercase tracking-wider cursor-pointer">
                {{ 'SETTINGS.DELETE_AFTER_MAX_LABEL' | translate }}
              </label>
            </div>
            <div class="flex items-center gap-3" [class.opacity-50]="!settings().deleteAfterMaxEntries">
              <input
                hlmInput
                #maxEntriesInput
                type="number"
                [value]="settings().maxEntries"
                (blur)="onMaxEntriesBlur(maxEntriesInput.valueAsNumber)"
                [disabled]="!settings().deleteAfterMaxEntries"
                min="5"
                max="999"
                class="w-24"
              />
              <span class="text-[12px] text-muted-foreground">
                {{ 'SETTINGS.MAX_ENTRIES_RANGE' | translate:{ min: 5, max: 999 } }}
              </span>
            </div>
          </div>

          <!-- Auto-delete old entries -->
          <div class="space-y-1.5">
            <div class="flex items-center gap-2">
              <input
                type="checkbox"
                id="delete-days-checkbox"
                [checked]="settings().deleteAfterDays"
                (change)="onDeleteAfterDaysChange($event)"
                class="h-4 w-4 rounded border-border accent-primary cursor-pointer"
              />
              <label hlmLabel for="delete-days-checkbox" class="uppercase tracking-wider cursor-pointer">
                {{ 'SETTINGS.DELETE_AFTER_DAYS_LABEL' | translate }}
              </label>
            </div>
            <div class="flex items-center gap-3" [class.opacity-50]="!settings().deleteAfterDays">
              <input
                hlmInput
                #maxDaysInput
                type="number"
                [value]="settings().maxDays"
                (blur)="onMaxDaysBlur(maxDaysInput.valueAsNumber)"
                [disabled]="!settings().deleteAfterDays"
                min="1"
                max="365"
                class="w-24"
              />
              <span class="text-[12px] text-muted-foreground">
                {{ 'SETTINGS.MAX_DAYS_RANGE' | translate:{ min: 1, max: 365 } }}
              </span>
            </div>
          </div>

          <!-- Language -->
          <div class="space-y-1.5">
            <label hlmLabel class="block uppercase tracking-wider">{{ 'SETTINGS.LANGUAGE_LABEL' | translate }}</label>
            <div hlmSelect [value]="settings().language ?? ''" [itemToString]="languageLabel" (valueChange)="onLanguageChange($event)">
              <hlm-select-trigger class="w-full">
                <hlm-select-value />
              </hlm-select-trigger>
              <hlm-select-content *hlmSelectPortal>
                <hlm-select-item value="">{{ 'SETTINGS.LANGUAGE_SYSTEM' | translate }}</hlm-select-item>
                <hlm-select-item value="en">{{ 'SETTINGS.LANGUAGE_EN' | translate }}</hlm-select-item>
                <hlm-select-item value="de">{{ 'SETTINGS.LANGUAGE_DE' | translate }}</hlm-select-item>
              </hlm-select-content>
            </div>
          </div>

          <!-- Theme -->
          <div class="space-y-1.5">
            <label hlmLabel class="block uppercase tracking-wider">{{ 'SETTINGS.THEME_LABEL' | translate }}</label>
            <div hlmSelect [value]="settings().theme" [itemToString]="themeLabel" (valueChange)="onThemeChange($event)">
              <hlm-select-trigger class="w-full">
                <hlm-select-value />
              </hlm-select-trigger>
              <hlm-select-content *hlmSelectPortal>
                <hlm-select-item value="system">{{ 'SETTINGS.THEME_SYSTEM' | translate }}</hlm-select-item>
                <hlm-select-item value="light">{{ 'SETTINGS.THEME_LIGHT' | translate }}</hlm-select-item>
                <hlm-select-item value="dark">{{ 'SETTINGS.THEME_DARK' | translate }}</hlm-select-item>
              </hlm-select-content>
            </div>
          </div>

        </div>
      }
    </div>
  `,
})
export class SettingsComponent {
  protected settingsService = inject(SettingsService);
  private i18nService = inject(I18nService);
  private themeService = inject(ThemeService);
  private translate = inject(TranslateService);

  protected settings = linkedSignal<AppSettings>(
    () => this.settingsService.settings.value() ?? DEFAULT_SETTINGS
  );

  protected languageLabel = (val: string): string => {
    switch (val) {
      case 'en': return this.translate.instant('SETTINGS.LANGUAGE_EN');
      case 'de': return this.translate.instant('SETTINGS.LANGUAGE_DE');
      default:   return this.translate.instant('SETTINGS.LANGUAGE_SYSTEM');
    }
  };

  protected themeLabel = (val: string): string => {
    switch (val) {
      case 'dark':  return this.translate.instant('SETTINGS.THEME_DARK');
      case 'light': return this.translate.instant('SETTINGS.THEME_LIGHT');
      default:      return this.translate.instant('SETTINGS.THEME_SYSTEM');
    }
  };

  protected captureShortcut(event: KeyboardEvent): void {
    event.preventDefault();
    const parts: string[] = [];
    if (event.ctrlKey) parts.push('Ctrl');
    if (event.altKey) parts.push('Alt');
    if (event.shiftKey) parts.push('Shift');
    if (event.metaKey) parts.push('Super');

    const key = event.code;
    if (!['ControlLeft', 'ControlRight', 'AltLeft', 'AltRight',
          'ShiftLeft', 'ShiftRight', 'MetaLeft', 'MetaRight'].includes(key)) {
      const cleanKey = key.startsWith('Key') ? key.slice(3) : key;
      parts.push(cleanKey);
    }

    if (parts.length > 1) {
      this.settings.update(s => ({ ...s, shortcut: parts.join('+') }));
      this.persist();
    }
  }

  protected onMaxEntriesBlur(value: number): void {
    if (Number.isNaN(value)) return;
    const clamped = Math.min(999, Math.max(5, value));
    this.settings.update(s => ({ ...s, maxEntries: clamped }));
    this.persist();
  }

  protected onMaxDaysBlur(value: number): void {
    if (Number.isNaN(value)) return;
    const clamped = Math.min(365, Math.max(1, value));
    this.settings.update(s => ({ ...s, maxDays: clamped }));
    this.persist();
  }

  protected onAutostartChange(event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.settings.update(s => ({ ...s, autostart: checked }));
    this.persist();
  }

  protected onDeleteAfterMaxChange(event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.settings.update(s => ({ ...s, deleteAfterMaxEntries: checked }));
    this.persist();
  }

  protected onDeleteAfterDaysChange(event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.settings.update(s => ({ ...s, deleteAfterDays: checked }));
    this.persist();
  }

  protected onLanguageChange(value: string | null): void {
    const lang = value === '' || value === null ? null : (value as Language);
    this.settings.update(s => ({ ...s, language: lang }));
    this.i18nService.setLanguage(lang);
    this.persist();
  }

  protected onThemeChange(value: string | null): void {
    const theme = (value as Theme) || 'system';
    this.settings.update(s => ({ ...s, theme }));
    this.themeService.applyTheme(theme);
    this.persist();
  }

  private async persist(): Promise<void> {
    try {
      await this.settingsService.saveSettings(this.settings());
    } catch (e) {
      toast.error(String(e));
    }
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
pnpm exec tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/features/settings/settings.component.ts
git commit -m "feat(settings): add autostart, delete-after-max, and delete-after-days UI sections"
```
