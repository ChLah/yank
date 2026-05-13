use std::sync::Mutex;

use base64::{engine::general_purpose, Engine as _};
use image::imageops::FilterType;
use rusqlite::{params, Connection};
use sha2::{Digest, Sha256};

use crate::models::{AppSettings, ClipboardContent, ClipboardEntry, ClipboardPayload, ExcludedApp, Language, Snippet, SnippetFolder, Theme, WindowPositionMode};

const THUMBNAIL_MAX_SIZE: u32 = 200;

pub struct SqliteStore {
    pub(crate) conn: Mutex<Connection>,
    pub(crate) db_path: Option<std::path::PathBuf>,
}

impl SqliteStore {
    pub fn new(db_path: &std::path::Path) -> Result<Self, rusqlite::Error> {
        let conn = Connection::open(db_path)?;
        let store = Self {
            conn: Mutex::new(conn),
            db_path: Some(db_path.to_path_buf()),
        };
        store.run_migrations()?;
        Ok(store)
    }

    /// Size of the on-disk SQLite file in bytes. Returns 0 for in-memory stores
    /// or if the file is unreadable.
    pub fn db_file_size(&self) -> u64 {
        self.db_path
            .as_ref()
            .and_then(|p| std::fs::metadata(p).ok())
            .map(|m| m.len())
            .unwrap_or(0)
    }

    pub(crate) fn run_migrations(&self) -> Result<(), rusqlite::Error> {
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

        // Add source_app column to pre-existing entries tables that lack it.
        let has_source_app: bool = {
            let mut stmt = conn.prepare("PRAGMA table_info(entries)")?;
            let cols: Vec<String> = stmt
                .query_map([], |row| row.get::<_, String>(1))?
                .filter_map(|r| r.ok())
                .collect();
            cols.iter().any(|name| name == "source_app")
        };
        if !has_source_app {
            conn.execute_batch(
                "ALTER TABLE entries ADD COLUMN source_app TEXT;"
            )?;
        }

        // Schema versioning via PRAGMA user_version.
        // v0: single `value TEXT` column (old settings schema, reset on upgrade)
        // v1: typed `value_text TEXT` / `value_int INTEGER` columns
        // v2: `stats` table for clipboard activity counters (with last_app_start, later renamed)
        // v3: rename last_app_start -> installed_at; backfill from earliest entry
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
        if user_version < 2 {
            conn.execute_batch(
                "CREATE TABLE IF NOT EXISTS stats (
                     id              INTEGER PRIMARY KEY CHECK (id = 1),
                     total_copies    INTEGER NOT NULL DEFAULT 0,
                     total_pastes    INTEGER NOT NULL DEFAULT 0,
                     installed_at    INTEGER NOT NULL DEFAULT 0
                 );
                 INSERT OR IGNORE INTO stats (id) VALUES (1);
                 PRAGMA user_version = 2;"
            )?;
        }
        if user_version < 3 {
            // Pre-v3 the column was named last_app_start and was overwritten on every
            // launch, so its value was the most recent app start. Rename it and back-
            // fill from the earliest known entry timestamp so existing users see a
            // plausible install date rather than "today".
            let has_legacy_column: bool = {
                let mut stmt = conn.prepare("PRAGMA table_info(stats)")?;
                let cols: Vec<String> = stmt
                    .query_map([], |row| row.get::<_, String>(1))?
                    .filter_map(|r| r.ok())
                    .collect();
                cols.iter().any(|name| name == "last_app_start")
            };
            if has_legacy_column {
                conn.execute_batch(
                    "ALTER TABLE stats RENAME COLUMN last_app_start TO installed_at;"
                )?;
            }
            conn.execute_batch(
                "UPDATE stats
                 SET installed_at = COALESCE(
                     (SELECT MIN(created_at) FROM entries
                       WHERE created_at > 0
                         AND (installed_at = 0 OR created_at < installed_at)),
                     installed_at
                 )
                 WHERE id = 1;
                 PRAGMA user_version = 3;"
            )?;
        }

        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS snippets (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                title       TEXT    NOT NULL,
                content     TEXT    NOT NULL,
                created_at  INTEGER NOT NULL,
                sort_order  INTEGER NOT NULL DEFAULT 0
            );"
        )?;

        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS snippet_folders (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                name       TEXT NOT NULL,
                sort_order INTEGER NOT NULL DEFAULT 0
            );"
        )?;

        let has_folder_id: bool = {
            let mut stmt = conn.prepare("PRAGMA table_info(snippets)")?;
            let cols: Vec<String> = stmt
                .query_map([], |row| row.get::<_, String>(1))?
                .filter_map(|r| r.ok())
                .collect();
            cols.iter().any(|name| name == "folder_id")
        };
        if !has_folder_id {
            conn.execute_batch(
                "ALTER TABLE snippets ADD COLUMN folder_id INTEGER REFERENCES snippet_folders(id);"
            )?;
        }

        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS excluded_apps (
                id           INTEGER PRIMARY KEY AUTOINCREMENT,
                process_name TEXT    NOT NULL UNIQUE,
                created_at   INTEGER NOT NULL
            );"
        )?;

        Ok(())
    }

    /// Save a clipboard payload, handling dedup. Returns the updated entry list.
    pub fn save_entry(&self, payload: &ClipboardPayload) -> Result<(), Box<dyn std::error::Error>> {
        let now = chrono::Utc::now().timestamp();
        let conn = self.conn.lock().unwrap();

        // Bumped on every captured copy (paused/excluded events short-circuit
        // before reaching this method, so they don't count).
        let _ = conn.execute(
            "UPDATE stats SET total_copies = total_copies + 1 WHERE id = 1",
            [],
        );

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
                    "INSERT INTO entries (kind, content, thumbnail, width, height, hash, created_at, last_used_at, source_app)
                     VALUES ('text', ?1, NULL, NULL, NULL, ?2, ?3, ?3, ?4)",
                    params![text.as_bytes(), payload.hash, now, payload.source_app],
                )?;
            }
            ClipboardContent::Image { rgba_bytes, width, height } => {
                let png_bytes = encode_rgba_to_png(rgba_bytes, *width, *height)?;
                let thumbnail_bytes = generate_thumbnail(&png_bytes)?;
                conn.execute(
                    "INSERT INTO entries (kind, content, thumbnail, width, height, hash, created_at, last_used_at, source_app)
                     VALUES ('image', ?1, ?2, ?3, ?4, ?5, ?6, ?6, ?7)",
                    params![png_bytes, thumbnail_bytes, width, height, payload.hash, now, payload.source_app],
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

    pub fn prune_old_entries_if_enabled(&self) -> Result<(), Box<dyn std::error::Error>> {
        let conn = self.conn.lock().unwrap();
        let (_, _, delete_after_days, max_days) = self.get_prune_settings_internal(&conn);
        if delete_after_days {
            let cutoff = chrono::Utc::now().timestamp() - max_days * 86400;
            conn.execute(
                "DELETE FROM entries WHERE pinned = 0 AND created_at < ?1",
                params![cutoff],
            )?;
        }
        Ok(())
    }

    pub fn get_all_entries(&self) -> Result<Vec<ClipboardEntry>, rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, kind, content, thumbnail, width, height, hash, created_at, last_used_at, pinned, source_app
             FROM entries ORDER BY last_used_at DESC",
        )?;

        let entries = stmt.query_map([], |row| {
            let kind: String = row.get(1)?;
            let content_bytes: Vec<u8> = row.get(2)?;
            let thumbnail_bytes: Option<Vec<u8>> = row.get(3)?;

            let content = if kind == "text" {
                Some(String::from_utf8_lossy(&content_bytes).into_owned())
            } else {
                None
            };

            let thumbnail = thumbnail_bytes
                .map(|b| format!("data:image/png;base64,{}", general_purpose::STANDARD.encode(&b)));

            Ok(ClipboardEntry {
                id: row.get(0)?,
                kind,
                content,
                thumbnail,
                width: row.get(4)?,
                height: row.get(5)?,
                hash: row.get(6)?,
                created_at: row.get(7)?,
                last_used_at: row.get(8)?,
                pinned: row.get::<_, i64>(9)? != 0,
                source_app: row.get(10)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;

        Ok(entries)
    }

    pub fn delete_entry(&self, id: i64) -> Result<(), rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM entries WHERE id = ?1", params![id])?;
        Ok(())
    }

    pub fn toggle_pin(&self, id: i64) -> Result<bool, rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        let rows_changed = conn.execute(
            "UPDATE entries SET pinned = CASE WHEN pinned = 0 THEN 1 ELSE 0 END WHERE id = ?1",
            params![id],
        )?;
        if rows_changed == 0 {
            return Err(rusqlite::Error::QueryReturnedNoRows);
        }
        let new_val: i64 = conn.query_row(
            "SELECT pinned FROM entries WHERE id = ?1",
            params![id],
            |row| row.get(0),
        )?;
        Ok(new_val == 1)
    }

    pub fn update_entry_content(&self, id: i64, content: &str) -> Result<(), Box<dyn std::error::Error>> {
        let new_hash = compute_hash(content.as_bytes());
        let conn = self.conn.lock().unwrap();
        let collision: Option<i64> = conn
            .query_row(
                "SELECT id FROM entries WHERE hash = ?1 AND id != ?2",
                params![new_hash, id],
                |row| row.get(0),
            )
            .ok();
        if collision.is_some() {
            return Err("duplicate".into());
        }
        let now = chrono::Utc::now().timestamp();
        conn.execute(
            "UPDATE entries SET content = ?1, hash = ?2, last_used_at = ?3 WHERE id = ?4",
            params![content.as_bytes(), new_hash, now, id],
        )?;
        Ok(())
    }

    /// Returns the full image bytes (PNG) for clipboard restore or preview
    pub fn get_entry_image(&self, id: i64) -> Result<Vec<u8>, Box<dyn std::error::Error>> {
        let conn = self.conn.lock().unwrap();
        let bytes: Vec<u8> = conn.query_row(
            "SELECT content FROM entries WHERE id = ?1 AND kind = 'image'",
            params![id],
            |row| row.get(0),
        )?;
        Ok(bytes)
    }

    /// Returns the full image as a base64 data URL for the preview window
    pub fn get_entry_image_base64(&self, id: i64) -> Result<String, Box<dyn std::error::Error>> {
        let bytes = self.get_entry_image(id)?;
        Ok(format!("data:image/png;base64,{}", general_purpose::STANDARD.encode(&bytes)))
    }

    pub fn restore_to_clipboard(&self, id: i64) -> Result<(), Box<dyn std::error::Error>> {
        let conn = self.conn.lock().unwrap();
        let (kind, content): (String, Vec<u8>) = conn.query_row(
            "SELECT kind, content FROM entries WHERE id = ?1",
            params![id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )?;

        // Update last_used_at and bump the lifetime paste counter
        let now = chrono::Utc::now().timestamp();
        conn.execute(
            "UPDATE entries SET last_used_at = ?1 WHERE id = ?2",
            params![now, id],
        )?;
        let _ = conn.execute(
            "UPDATE stats SET total_pastes = total_pastes + 1 WHERE id = 1",
            [],
        );
        drop(conn);

        let mut clipboard = arboard::Clipboard::new()?;
        match kind.as_str() {
            "text" => {
                clipboard.set_text(String::from_utf8(content)?)?;
            }
            "image" => {
                // Decode PNG back to RGBA for arboard
                let img = image::load_from_memory_with_format(&content, image::ImageFormat::Png)?;
                let rgba = img.to_rgba8();
                let (width, height) = rgba.dimensions();
                let img_data = arboard::ImageData {
                    width: width as usize,
                    height: height as usize,
                    bytes: std::borrow::Cow::Owned(rgba.into_raw()),
                };
                clipboard.set_image(img_data)?;
            }
            _ => {}
        }

        Ok(())
    }

    pub fn get_settings(&self) -> Result<AppSettings, Box<dyn std::error::Error>> {
        let conn = self.conn.lock().unwrap();
        let map = Self::fetch_settings_map(&conn, &[
            "shortcut", "maxEntries", "language", "theme",
            "autostart", "deleteAfterMaxEntries", "deleteAfterDays", "maxDays",
            "windowPosition", "pauseShortcut", "autoCheckUpdates",
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
        let pause_shortcut = text("pauseShortcut").unwrap_or(defaults.pause_shortcut);
        let auto_check_updates = int("autoCheckUpdates").map(|v| v != 0).unwrap_or(defaults.auto_check_updates);

        Ok(AppSettings {
            shortcut, max_entries, language, theme, autostart,
            delete_after_max_entries, delete_after_days, max_days,
            window_position, pause_shortcut, auto_check_updates,
        })
    }

    pub fn save_settings(&self, settings: &AppSettings) -> Result<(), rusqlite::Error> {
        let lang_str = settings.language.as_ref().map(|l| match l {
            Language::En => "en",
            Language::De => "de",
        });
        let theme_str = match settings.theme {
            Theme::Dark => "dark",
            Theme::Light => "light",
            Theme::System => "system",
        };
        let window_position_str = match settings.window_position {
            WindowPositionMode::Cursor => "cursor",
            WindowPositionMode::Last   => "last",
        };

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
            ("autoCheckUpdates",      None,                                         Some(settings.auto_check_updates as i64)),
        ];

        let conn = self.conn.lock().unwrap();
        let tx = conn.unchecked_transaction()?;
        let mut stmt = tx.prepare(
            "INSERT OR REPLACE INTO settings (key, value_text, value_int) VALUES (?1, ?2, ?3)"
        )?;
        for (key, text, int) in rows {
            stmt.execute(params![key, text, int])?;
        }
        drop(stmt);
        tx.commit()
    }

    pub fn save_window_position(&self, x: i64, y: i64) -> Result<(), rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        let tx = conn.unchecked_transaction()?;
        let mut stmt = tx.prepare(
            "INSERT OR REPLACE INTO settings (key, value_text, value_int) VALUES (?1, ?2, ?3)"
        )?;
        stmt.execute(params!["lastWindowX", None::<String>, Some(x)])?;
        stmt.execute(params!["lastWindowY", None::<String>, Some(y)])?;
        drop(stmt);
        tx.commit()
    }

    pub fn get_window_position(&self) -> Result<Option<(i64, i64)>, Box<dyn std::error::Error>> {
        let conn = self.conn.lock().unwrap();
        let map = Self::fetch_settings_map(&conn, &["lastWindowX", "lastWindowY"])?;
        let x = map.get("lastWindowX").and_then(|(_, i)| *i);
        let y = map.get("lastWindowY").and_then(|(_, i)| *i);
        Ok(x.zip(y))
    }

    fn get_prune_settings_internal(&self, conn: &Connection) -> (bool, i64, bool, i64) {
        let map = Self::fetch_settings_map(conn, &[
            "deleteAfterMaxEntries", "maxEntries", "deleteAfterDays", "maxDays",
        ]).unwrap_or_default();
        let int = |key: &str| map.get(key).and_then(|(_, i)| *i);

        let delete_after_max_entries = int("deleteAfterMaxEntries").map(|v| v != 0).unwrap_or(true);
        let max_entries              = int("maxEntries").unwrap_or(20);
        let delete_after_days        = int("deleteAfterDays").map(|v| v != 0).unwrap_or(false);
        let max_days                 = int("maxDays").unwrap_or(30);

        (delete_after_max_entries, max_entries, delete_after_days, max_days)
    }

    fn fetch_settings_map(
        conn: &Connection,
        keys: &[&str],
    ) -> Result<std::collections::HashMap<String, (Option<String>, Option<i64>)>, rusqlite::Error> {
        let placeholders = keys.iter().enumerate()
            .map(|(i, _)| format!("?{}", i + 1))
            .collect::<Vec<_>>()
            .join(", ");
        let sql = format!(
            "SELECT key, value_text, value_int FROM settings WHERE key IN ({})",
            placeholders
        );
        let mut stmt = conn.prepare(&sql)?;
        let params: Vec<&dyn rusqlite::ToSql> = keys.iter().map(|k| k as &dyn rusqlite::ToSql).collect();
        let rows = stmt.query_map(params.as_slice(), |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, Option<String>>(1)?,
                row.get::<_, Option<i64>>(2)?,
            ))
        })?;
        let mut map = std::collections::HashMap::new();
        for row in rows {
            let (key, text, int) = row?;
            map.insert(key, (text, int));
        }
        Ok(map)
    }

    pub fn get_snippets(&self) -> Result<Vec<Snippet>, rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, title, content, created_at, sort_order, folder_id \
             FROM snippets ORDER BY sort_order ASC, id ASC",
        )?;
        let results = stmt.query_map([], |row| {
            Ok(Snippet {
                id: row.get(0)?,
                title: row.get(1)?,
                content: row.get(2)?,
                created_at: row.get(3)?,
                sort_order: row.get(4)?,
                folder_id: row.get(5)?,
            })
        })?.collect::<Result<Vec<_>, _>>()?;
        Ok(results)
    }

    pub fn create_snippet(&self, title: &str, content: &str) -> Result<Snippet, rusqlite::Error> {
        let now = chrono::Utc::now().timestamp();
        let conn = self.conn.lock().unwrap();
        let sort_order: i64 = conn.query_row(
            "SELECT COALESCE(MAX(sort_order) + 1, 0) FROM snippets",
            [],
            |row| row.get(0),
        )?;
        conn.execute(
            "INSERT INTO snippets (title, content, created_at, sort_order) VALUES (?1, ?2, ?3, ?4)",
            params![title, content, now, sort_order],
        )?;
        let id = conn.last_insert_rowid();
        Ok(Snippet {
            id,
            title: title.to_string(),
            content: content.to_string(),
            created_at: now,
            sort_order,
            folder_id: None,
        })
    }

    pub fn update_snippet(&self, id: i64, title: &str, content: &str) -> Result<Snippet, rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        let changed = conn.execute(
            "UPDATE snippets SET title = ?1, content = ?2 WHERE id = ?3",
            params![title, content, id],
        )?;
        if changed == 0 {
            return Err(rusqlite::Error::QueryReturnedNoRows);
        }
        conn.query_row(
            "SELECT id, title, content, created_at, sort_order, folder_id FROM snippets WHERE id = ?1",
            params![id],
            |row| {
                Ok(Snippet {
                    id: row.get(0)?,
                    title: row.get(1)?,
                    content: row.get(2)?,
                    created_at: row.get(3)?,
                    sort_order: row.get(4)?,
                    folder_id: row.get(5)?,
                })
            },
        )
    }

    pub fn delete_snippet(&self, id: i64) -> Result<(), rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM snippets WHERE id = ?1", params![id])?;
        Ok(())
    }

    pub fn reorder_snippet(&self, id: i64, new_index: usize) -> Result<(), rusqlite::Error> {
        let conn = self.conn.lock().unwrap();

        // Get folder_id of the target snippet
        let folder_id: Option<i64> = conn.query_row(
            "SELECT folder_id FROM snippets WHERE id = ?1",
            params![id],
            |row| row.get(0),
        )?;

        // Collect IDs within the same folder only (NULL IS NULL evaluates true)
        let ids: Vec<i64> = {
            let mut stmt = conn.prepare(
                "SELECT id FROM snippets WHERE folder_id IS ?1 ORDER BY sort_order ASC, id ASC",
            )?;
            let rows = stmt.query_map(params![folder_id], |row| row.get(0))?
                .collect::<Result<Vec<_>, _>>()?;
            rows
        };

        let current_pos = ids
            .iter()
            .position(|&x| x == id)
            .ok_or(rusqlite::Error::QueryReturnedNoRows)?;

        let mut ids = ids;
        ids.remove(current_pos);
        let clamped = new_index.min(ids.len());
        ids.insert(clamped, id);

        let tx = conn.unchecked_transaction()?;
        let mut stmt = tx.prepare(
            "UPDATE snippets SET sort_order = ?1 WHERE id = ?2",
        )?;
        for (i, &snippet_id) in ids.iter().enumerate() {
            stmt.execute(params![i as i64, snippet_id])?;
        }
        drop(stmt);
        tx.commit()?;

        Ok(())
    }

    pub fn get_snippet_folders(&self) -> Result<Vec<SnippetFolder>, rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, name, sort_order FROM snippet_folders ORDER BY sort_order ASC, id ASC",
        )?;
        let results = stmt.query_map([], |row| {
            Ok(SnippetFolder {
                id: row.get(0)?,
                name: row.get(1)?,
                sort_order: row.get(2)?,
            })
        })?.collect::<Result<Vec<_>, _>>()?;
        Ok(results)
    }

    pub fn create_snippet_folder(&self, name: &str) -> Result<SnippetFolder, rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        let sort_order: i64 = conn.query_row(
            "SELECT COALESCE(MAX(sort_order) + 1, 0) FROM snippet_folders",
            [],
            |row| row.get(0),
        )?;
        conn.execute(
            "INSERT INTO snippet_folders (name, sort_order) VALUES (?1, ?2)",
            params![name, sort_order],
        )?;
        let id = conn.last_insert_rowid();
        Ok(SnippetFolder { id, name: name.to_string(), sort_order })
    }

    pub fn rename_snippet_folder(&self, id: i64, name: &str) -> Result<(), rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        let changed = conn.execute(
            "UPDATE snippet_folders SET name = ?1 WHERE id = ?2",
            params![name, id],
        )?;
        if changed == 0 {
            return Err(rusqlite::Error::QueryReturnedNoRows);
        }
        Ok(())
    }

    pub fn delete_snippet_folder(&self, id: i64) -> Result<(), rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        let tx = conn.unchecked_transaction()?;
        tx.execute("UPDATE snippets SET folder_id = NULL WHERE folder_id = ?1", params![id])?;
        tx.execute("DELETE FROM snippet_folders WHERE id = ?1", params![id])?;
        tx.commit()?;
        Ok(())
    }

    pub fn reorder_snippet_folder(&self, id: i64, new_index: usize) -> Result<(), rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        let ids: Vec<i64> = {
            let mut stmt = conn.prepare(
                "SELECT id FROM snippet_folders ORDER BY sort_order ASC, id ASC",
            )?;
            let rows = stmt.query_map([], |row| row.get(0))?
                .collect::<Result<Vec<_>, _>>()?;
            rows
        };
        let current_pos = ids.iter().position(|&x| x == id)
            .ok_or(rusqlite::Error::QueryReturnedNoRows)?;
        let mut ids = ids;
        ids.remove(current_pos);
        let clamped = new_index.min(ids.len());
        ids.insert(clamped, id);
        let tx = conn.unchecked_transaction()?;
        let mut stmt = tx.prepare("UPDATE snippet_folders SET sort_order = ?1 WHERE id = ?2")?;
        for (i, &folder_id) in ids.iter().enumerate() {
            stmt.execute(params![i as i64, folder_id])?;
        }
        drop(stmt);
        tx.commit()?;
        Ok(())
    }

    pub fn move_snippet_to_folder(&self, snippet_id: i64, folder_id: Option<i64>) -> Result<(), rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        let next_order: i64 = conn.query_row(
            "SELECT COALESCE(MAX(sort_order) + 1, 0) FROM snippets WHERE folder_id IS ?1",
            params![folder_id],
            |row| row.get(0),
        )?;
        let changed = conn.execute(
            "UPDATE snippets SET folder_id = ?1, sort_order = ?2 WHERE id = ?3",
            params![folder_id, next_order, snippet_id],
        )?;
        if changed == 0 {
            return Err(rusqlite::Error::QueryReturnedNoRows);
        }
        Ok(())
    }

    pub fn get_excluded_apps(&self) -> Result<Vec<ExcludedApp>, rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, process_name, created_at FROM excluded_apps ORDER BY id ASC",
        )?;
        let results = stmt
            .query_map([], |row| {
                Ok(ExcludedApp {
                    id: row.get(0)?,
                    process_name: row.get(1)?,
                    created_at: row.get(2)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(results)
    }

    pub fn add_excluded_app(&self, process_name: &str) -> Result<ExcludedApp, rusqlite::Error> {
        let trimmed = process_name.trim();
        let now = chrono::Utc::now().timestamp();
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO excluded_apps (process_name, created_at) VALUES (?1, ?2)",
            params![trimmed, now],
        )?;
        let id = conn.last_insert_rowid();
        Ok(ExcludedApp {
            id,
            process_name: trimmed.to_string(),
            created_at: now,
        })
    }

    pub fn remove_excluded_app(&self, id: i64) -> Result<(), rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM excluded_apps WHERE id = ?1", params![id])?;
        Ok(())
    }

    /// Sets `installed_at` only if it has not been set before (still 0). Called on
    /// every app start so the first launch records the install timestamp and
    /// subsequent launches leave it alone.
    pub fn set_installed_at_if_unset(&self, ts: i64) -> Result<(), rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE stats SET installed_at = ?1 WHERE id = 1 AND installed_at = 0",
            params![ts],
        )?;
        Ok(())
    }

    pub fn get_persisted_stats(&self) -> Result<(i64, i64, i64), rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        conn.query_row(
            "SELECT total_copies, total_pastes, installed_at FROM stats WHERE id = 1",
            [],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
    }

    pub fn get_saved_entries_summary(&self) -> Result<(i64, i64), rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        conn.query_row(
            "SELECT COUNT(*), COALESCE(SUM(LENGTH(content)), 0) FROM entries",
            [],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
    }

    pub fn get_pinned_count(&self) -> Result<i64, rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        conn.query_row(
            "SELECT COUNT(*) FROM entries WHERE pinned = 1",
            [],
            |row| row.get(0),
        )
    }

    pub fn get_snippet_count(&self) -> Result<i64, rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        conn.query_row("SELECT COUNT(*) FROM snippets", [], |row| row.get(0))
    }

    /// Wipes user-data tables (entries, snippets, snippet_folders, excluded_apps)
    /// and zeroes lifetime counters in `stats`. Settings are preserved.
    pub fn reset_database(&self) -> Result<(), rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        let tx = conn.unchecked_transaction()?;
        tx.execute("DELETE FROM entries", [])?;
        tx.execute("DELETE FROM snippets", [])?;
        tx.execute("DELETE FROM snippet_folders", [])?;
        tx.execute("DELETE FROM excluded_apps", [])?;
        tx.execute(
            "UPDATE stats SET total_copies = 0, total_pastes = 0 WHERE id = 1",
            [],
        )?;
        tx.commit()
    }

    pub fn is_app_excluded(&self, process_name: &str) -> Result<bool, rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        let exists: bool = conn.query_row(
            "SELECT EXISTS(SELECT 1 FROM excluded_apps WHERE process_name = ?1 COLLATE NOCASE)",
            params![process_name],
            |row| row.get(0),
        )?;
        Ok(exists)
    }
}

pub fn compute_hash(data: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(data);
    hex::encode(hasher.finalize())
}

fn encode_rgba_to_png(
    rgba_bytes: &[u8],
    width: u32,
    height: u32,
) -> Result<Vec<u8>, Box<dyn std::error::Error>> {
    let img = image::RgbaImage::from_raw(width, height, rgba_bytes.to_vec())
        .ok_or("Failed to create image from raw bytes")?;
    let mut buf = Vec::new();
    img.write_to(&mut std::io::Cursor::new(&mut buf), image::ImageFormat::Png)?;
    Ok(buf)
}

fn generate_thumbnail(png_bytes: &[u8]) -> Result<Vec<u8>, Box<dyn std::error::Error>> {
    let img = image::load_from_memory_with_format(png_bytes, image::ImageFormat::Png)?;
    let thumbnail = img.resize(THUMBNAIL_MAX_SIZE, THUMBNAIL_MAX_SIZE, FilterType::Lanczos3);
    let mut buf = Vec::new();
    thumbnail.write_to(&mut std::io::Cursor::new(&mut buf), image::ImageFormat::Png)?;
    Ok(buf)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn in_memory_store() -> SqliteStore {
        let conn = Connection::open_in_memory().unwrap();
        let store = SqliteStore { conn: Mutex::new(conn), db_path: None };
        store.run_migrations().unwrap();
        store
    }

    #[test]
    fn test_db_file_size_returns_zero_for_in_memory_store() {
        let store = in_memory_store();
        assert_eq!(store.db_file_size(), 0);
    }

    fn text_payload(text: &str) -> ClipboardPayload {
        ClipboardPayload {
            hash: compute_hash(text.as_bytes()),
            content: ClipboardContent::Text(text.to_string()),
            source_app: None,
        }
    }

    #[test]
    fn test_save_and_get_text_entry() {
        let store = in_memory_store();
        store.save_entry(&text_payload("hello world")).unwrap();
        let entries = store.get_all_entries().unwrap();
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].kind, "text");
        assert_eq!(entries[0].content.as_deref(), Some("hello world"));
    }

    #[test]
    fn test_dedup_moves_to_top() {
        let store = in_memory_store();
        store.save_entry(&text_payload("first")).unwrap();
        store.save_entry(&text_payload("second")).unwrap();
        store.save_entry(&text_payload("first")).unwrap(); // duplicate

        let entries = store.get_all_entries().unwrap();
        assert_eq!(entries.len(), 2);
        assert_eq!(entries[0].content.as_deref(), Some("first")); // moved to top
    }

    #[test]
    fn test_prunes_beyond_max_entries() {
        let store = in_memory_store();
        // Set max to 3
        store.save_settings(&AppSettings {
            shortcut: "Ctrl+SEMICOLON".into(),
            max_entries: 3,
            delete_after_max_entries: true,
            ..AppSettings::default()
        }).unwrap();

        for i in 0..5 {
            store.save_entry(&text_payload(&format!("entry {}", i))).unwrap();
        }

        let entries = store.get_all_entries().unwrap();
        assert_eq!(entries.len(), 3);
    }

    #[test]
    fn test_delete_entry() {
        let store = in_memory_store();
        store.save_entry(&text_payload("to delete")).unwrap();
        let entries = store.get_all_entries().unwrap();
        store.delete_entry(entries[0].id).unwrap();
        assert!(store.get_all_entries().unwrap().is_empty());
    }

    #[test]
    fn test_settings_round_trip() {
        let store = in_memory_store();
        let settings = AppSettings {
            shortcut: "Ctrl+ALT+V".to_string(),
            max_entries: 10,
            ..AppSettings::default()
        };
        store.save_settings(&settings).unwrap();
        let loaded = store.get_settings().unwrap();
        assert_eq!(loaded.shortcut, "Ctrl+ALT+V");
        assert_eq!(loaded.max_entries, 10);
        assert_eq!(loaded.theme, Theme::System);

        // Verify non-default theme persists
        let dark_settings = AppSettings {
            shortcut: "Ctrl+A".to_string(),
            max_entries: 10,
            theme: Theme::Dark,
            ..AppSettings::default()
        };
        store.save_settings(&dark_settings).unwrap();
        let dark_loaded = store.get_settings().unwrap();
        assert_eq!(dark_loaded.theme, Theme::Dark);

        // Verify Light theme persists
        let light_settings = AppSettings {
            shortcut: "Ctrl+B".to_string(),
            max_entries: 5,
            theme: Theme::Light,
            ..AppSettings::default()
        };
        store.save_settings(&light_settings).unwrap();
        let light_loaded = store.get_settings().unwrap();
        assert_eq!(light_loaded.theme, Theme::Light);
    }

    #[test]
    fn test_migration_is_idempotent() {
        // Calling run_migrations() twice on the same database must not error.
        let store = in_memory_store(); // first call happens inside in_memory_store()
        store.run_migrations().unwrap(); // second call — must succeed without error
    }

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

    #[test]
    fn test_migration_adds_pinned_to_legacy_schema() {
        // Simulate a pre-existing database that has entries table WITHOUT the pinned column.
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE entries (
                id           INTEGER PRIMARY KEY AUTOINCREMENT,
                kind         TEXT    NOT NULL,
                content      BLOB    NOT NULL,
                thumbnail    BLOB,
                width        INTEGER,
                height       INTEGER,
                hash         TEXT    NOT NULL UNIQUE,
                created_at   INTEGER NOT NULL,
                last_used_at INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);"
        ).unwrap();
        let store = SqliteStore { conn: Mutex::new(conn), db_path: None };
        // run_migrations must detect missing pinned column and ALTER TABLE successfully
        store.run_migrations().unwrap();
        // Verify pinned column works — save entry, get it back with pinned=false
        store.save_entry(&text_payload("legacy")).unwrap();
        let entries = store.get_all_entries().unwrap();
        assert!(!entries[0].pinned);
    }

    #[test]
    fn test_migration_adds_source_app_to_legacy_schema() {
        let conn = Connection::open_in_memory().unwrap();
        // Schema with pinned but WITHOUT source_app
        conn.execute_batch(
            "CREATE TABLE entries (
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
            CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);"
        ).unwrap();
        let store = SqliteStore { conn: Mutex::new(conn), db_path: None };
        store.run_migrations().unwrap();
        // source_app column must now exist; save_entry should not error
        store.save_entry(&text_payload("legacy")).unwrap();
        let entries = store.get_all_entries().unwrap();
        assert_eq!(entries[0].source_app, None);
    }

    #[test]
    fn test_toggle_pin() {
        let store = in_memory_store();
        store.save_entry(&text_payload("hello")).unwrap();
        let entries = store.get_all_entries().unwrap();
        let id = entries[0].id;

        assert!(!entries[0].pinned);

        let now_pinned = store.toggle_pin(id).unwrap();
        assert!(now_pinned);
        assert!(store.get_all_entries().unwrap()[0].pinned);

        let now_pinned = store.toggle_pin(id).unwrap();
        assert!(!now_pinned);
        assert!(!store.get_all_entries().unwrap()[0].pinned);
    }

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

    #[test]
    fn test_window_position_mode_round_trip() {
        let store = in_memory_store();

        // Default is cursor
        let s = store.get_settings().unwrap();
        assert_eq!(s.window_position, WindowPositionMode::Cursor);

        // Save last, reload
        store.save_settings(&AppSettings {
            window_position: WindowPositionMode::Last,
            ..AppSettings::default()
        }).unwrap();
        let s = store.get_settings().unwrap();
        assert_eq!(s.window_position, WindowPositionMode::Last);

        // Switch back to cursor
        store.save_settings(&AppSettings {
            window_position: WindowPositionMode::Cursor,
            ..AppSettings::default()
        }).unwrap();
        let s = store.get_settings().unwrap();
        assert_eq!(s.window_position, WindowPositionMode::Cursor);
    }

    #[test]
    fn test_save_and_get_window_position() {
        let store = in_memory_store();

        // None before any save
        assert!(store.get_window_position().unwrap().is_none());

        store.save_window_position(1280, 720).unwrap();
        assert_eq!(store.get_window_position().unwrap(), Some((1280, 720)));

        // Overwrite updates both coordinates atomically
        store.save_window_position(100, 200).unwrap();
        assert_eq!(store.get_window_position().unwrap(), Some((100, 200)));

        // Negative coords (window on secondary monitor left of primary) are valid
        store.save_window_position(-500, 300).unwrap();
        assert_eq!(store.get_window_position().unwrap(), Some((-500, 300)));
    }

    #[test]
    fn test_update_entry_content() {
        let store = in_memory_store();
        store.save_entry(&text_payload("original")).unwrap();
        let id = store.get_all_entries().unwrap()[0].id;

        store.update_entry_content(id, "updated").unwrap();

        let entries = store.get_all_entries().unwrap();
        assert_eq!(entries[0].content.as_deref(), Some("updated"));
    }

    #[test]
    fn test_save_entry_persists_source_app() {
        let store = in_memory_store();
        let payload = ClipboardPayload {
            hash: compute_hash(b"chrome text"),
            content: ClipboardContent::Text("chrome text".to_string()),
            source_app: Some("chrome.exe".to_string()),
        };
        store.save_entry(&payload).unwrap();
        let entries = store.get_all_entries().unwrap();
        assert_eq!(entries[0].source_app.as_deref(), Some("chrome.exe"));
    }

    #[test]
    fn test_save_entry_null_source_app() {
        let store = in_memory_store();
        store.save_entry(&text_payload("no app")).unwrap();
        let entries = store.get_all_entries().unwrap();
        assert_eq!(entries[0].source_app, None);
    }

    #[test]
    fn test_update_entry_content_hash_collision() {
        let store = in_memory_store();
        store.save_entry(&text_payload("first")).unwrap();
        store.save_entry(&text_payload("second")).unwrap();
        let entries = store.get_all_entries().unwrap();
        let first_id = entries.iter().find(|e| e.content.as_deref() == Some("first")).unwrap().id;

        let err = store.update_entry_content(first_id, "second").unwrap_err();
        assert!(err.to_string().contains("duplicate"));
    }

    #[test]
    fn test_create_and_get_snippets() {
        let store = in_memory_store();
        // Create two snippets
        let s1 = store.create_snippet("Alpha", "Content A").unwrap();
        let s2 = store.create_snippet("Beta", "Content B").unwrap();
        // Fields are set correctly
        assert_eq!(s1.title, "Alpha");
        assert_eq!(s1.content, "Content A");
        assert_eq!(s2.title, "Beta");
        // sort_order increments
        assert_eq!(s1.sort_order, 0);
        assert_eq!(s2.sort_order, 1);
        // get_snippets returns both in order
        let snippets = store.get_snippets().unwrap();
        assert_eq!(snippets.len(), 2);
        assert_eq!(snippets[0].id, s1.id);
        assert_eq!(snippets[1].id, s2.id);
    }

    #[test]
    fn test_update_snippet() {
        let store = in_memory_store();
        let original = store.create_snippet("Old Title", "Old Content").unwrap();
        let updated = store.update_snippet(original.id, "New Title", "New Content").unwrap();
        assert_eq!(updated.id, original.id);
        assert_eq!(updated.title, "New Title");
        assert_eq!(updated.content, "New Content");
        assert_eq!(updated.created_at, original.created_at);
        assert_eq!(updated.sort_order, original.sort_order);
    }

    #[test]
    fn test_delete_snippet() {
        let store = in_memory_store();
        let s = store.create_snippet("Title", "Body").unwrap();
        store.delete_snippet(s.id).unwrap();
        let snippets = store.get_snippets().unwrap();
        assert!(snippets.is_empty());
    }

    #[test]
    fn test_update_snippet_unknown_id_returns_error() {
        let store = in_memory_store();
        let result = store.update_snippet(9999, "Title", "Body");
        assert!(result.is_err());
    }

    #[test]
    fn test_reorder_snippet_move_to_end() {
        let store = in_memory_store();
        let s1 = store.create_snippet("A", "a").unwrap();
        let s2 = store.create_snippet("B", "b").unwrap();
        let s3 = store.create_snippet("C", "c").unwrap();

        store.reorder_snippet(s1.id, 2).unwrap();

        let snippets = store.get_snippets().unwrap();
        assert_eq!(snippets[0].id, s2.id);
        assert_eq!(snippets[1].id, s3.id);
        assert_eq!(snippets[2].id, s1.id);
        // sort_orders are dense 0-based
        assert_eq!(snippets[0].sort_order, 0);
        assert_eq!(snippets[1].sort_order, 1);
        assert_eq!(snippets[2].sort_order, 2);
    }

    #[test]
    fn test_reorder_snippet_move_to_front() {
        let store = in_memory_store();
        let s1 = store.create_snippet("A", "a").unwrap();
        let s2 = store.create_snippet("B", "b").unwrap();
        let s3 = store.create_snippet("C", "c").unwrap();

        store.reorder_snippet(s3.id, 0).unwrap();

        let snippets = store.get_snippets().unwrap();
        assert_eq!(snippets[0].id, s3.id);
        assert_eq!(snippets[1].id, s1.id);
        assert_eq!(snippets[2].id, s2.id);
    }

    #[test]
    fn test_reorder_snippet_normalizes_duplicates() {
        let store = in_memory_store();
        // Manually create snippets with the same sort_order to simulate duplicates
        let conn = store.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO snippets (title, content, created_at, sort_order) VALUES ('A', 'a', 0, 5)",
            [],
        ).unwrap();
        let id_a = conn.last_insert_rowid();
        conn.execute(
            "INSERT INTO snippets (title, content, created_at, sort_order) VALUES ('B', 'b', 1, 5)",
            [],
        ).unwrap();
        let id_b = conn.last_insert_rowid();
        drop(conn);

        // Reorder: move id_b to index 0
        store.reorder_snippet(id_b, 0).unwrap();

        let snippets = store.get_snippets().unwrap();
        assert_eq!(snippets[0].id, id_b);
        assert_eq!(snippets[1].id, id_a);
        assert_eq!(snippets[0].sort_order, 0);
        assert_eq!(snippets[1].sort_order, 1);
    }

    #[test]
    fn test_reorder_snippet_unknown_id_returns_error() {
        let store = in_memory_store();
        store.create_snippet("A", "a").unwrap();
        let result = store.reorder_snippet(9999, 0);
        assert!(result.is_err());
    }

    #[test]
    fn test_reorder_snippet_clamps_out_of_bounds_index() {
        let store = in_memory_store();
        let s1 = store.create_snippet("A", "a").unwrap();
        let s2 = store.create_snippet("B", "b").unwrap();

        // new_index 99 should clamp to last valid position (1)
        store.reorder_snippet(s1.id, 99).unwrap();

        let snippets = store.get_snippets().unwrap();
        assert_eq!(snippets[0].id, s2.id);
        assert_eq!(snippets[1].id, s1.id);
    }

    #[test]
    fn test_pinned_entries_not_pruned() {
        let store = in_memory_store();
        store.save_settings(&AppSettings {
            max_entries: 2,
            delete_after_max_entries: true,
            ..AppSettings::default()
        }).unwrap();

        store.save_entry(&text_payload("pinned entry")).unwrap();
        let entries = store.get_all_entries().unwrap();
        let pinned_id = entries[0].id;
        store.toggle_pin(pinned_id).unwrap();

        store.save_entry(&text_payload("entry 1")).unwrap();
        store.save_entry(&text_payload("entry 2")).unwrap();
        store.save_entry(&text_payload("entry 3")).unwrap(); // triggers pruning

        let entries = store.get_all_entries().unwrap();
        assert!(entries.iter().any(|e| e.id == pinned_id), "pinned entry was pruned");
        // 2 unpinned (max_entries) + 1 pinned
        assert_eq!(entries.len(), 3);
    }

    #[test]
    fn test_excluded_apps_table_exists() {
        let store = in_memory_store();
        let conn = store.conn.lock().unwrap();
        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM excluded_apps", [], |r| r.get(0))
            .unwrap();
        assert_eq!(count, 0);
    }

    #[test]
    fn test_add_and_get_excluded_apps() {
        let store = in_memory_store();
        let app = store.add_excluded_app("KeePass.exe").unwrap();
        assert_eq!(app.process_name, "KeePass.exe");
        assert!(app.id > 0);
        assert!(app.created_at > 0);

        let apps = store.get_excluded_apps().unwrap();
        assert_eq!(apps.len(), 1);
        assert_eq!(apps[0].id, app.id);
        assert_eq!(apps[0].process_name, "KeePass.exe");
    }

    #[test]
    fn test_add_excluded_app_trims_whitespace() {
        let store = in_memory_store();
        let app = store.add_excluded_app("  notepad.exe  ").unwrap();
        assert_eq!(app.process_name, "notepad.exe");

        let apps = store.get_excluded_apps().unwrap();
        assert_eq!(apps[0].process_name, "notepad.exe");
    }

    #[test]
    fn test_add_excluded_app_duplicate_returns_error() {
        let store = in_memory_store();
        store.add_excluded_app("notepad.exe").unwrap();
        let result = store.add_excluded_app("notepad.exe");
        assert!(result.is_err());
    }

    #[test]
    fn test_remove_excluded_app() {
        let store = in_memory_store();
        let app = store.add_excluded_app("KeePass.exe").unwrap();
        store.remove_excluded_app(app.id).unwrap();
        let apps = store.get_excluded_apps().unwrap();
        assert!(apps.is_empty());
    }

    #[test]
    fn test_get_excluded_apps_ordered_by_id() {
        let store = in_memory_store();
        store.add_excluded_app("B.exe").unwrap();
        store.add_excluded_app("A.exe").unwrap();
        let apps = store.get_excluded_apps().unwrap();
        assert_eq!(apps[0].process_name, "B.exe");
        assert_eq!(apps[1].process_name, "A.exe");
    }

    #[test]
    fn test_is_app_excluded_case_insensitive() {
        let store = in_memory_store();
        store.add_excluded_app("KeePass.exe").unwrap();
        assert!(store.is_app_excluded("KeePass.exe").unwrap());
        assert!(store.is_app_excluded("keepass.exe").unwrap());
        assert!(store.is_app_excluded("KEEPASS.EXE").unwrap());
    }

    #[test]
    fn test_is_app_excluded_not_found() {
        let store = in_memory_store();
        assert!(!store.is_app_excluded("notepad.exe").unwrap());
    }

    #[test]
    fn test_is_app_excluded_after_remove() {
        let store = in_memory_store();
        let app = store.add_excluded_app("KeePass.exe").unwrap();
        assert!(store.is_app_excluded("KeePass.exe").unwrap());
        store.remove_excluded_app(app.id).unwrap();
        assert!(!store.is_app_excluded("KeePass.exe").unwrap());
    }

    #[test]
    fn test_is_app_excluded_ignores_whitespace_in_stored_name() {
        let store = in_memory_store();
        store.add_excluded_app("  notepad.exe  ").unwrap(); // stored as "notepad.exe"
        assert!(store.is_app_excluded("notepad.exe").unwrap());
    }

    #[test]
    fn test_create_and_get_snippet_folders() {
        let store = in_memory_store();
        let f1 = store.create_snippet_folder("Work").unwrap();
        let f2 = store.create_snippet_folder("Dev").unwrap();
        assert_eq!(f1.name, "Work");
        assert_eq!(f1.sort_order, 0);
        assert_eq!(f2.sort_order, 1);
        let folders = store.get_snippet_folders().unwrap();
        assert_eq!(folders.len(), 2);
        assert_eq!(folders[0].id, f1.id);
        assert_eq!(folders[1].id, f2.id);
    }

    #[test]
    fn test_rename_snippet_folder() {
        let store = in_memory_store();
        let f = store.create_snippet_folder("Old").unwrap();
        store.rename_snippet_folder(f.id, "New").unwrap();
        let folders = store.get_snippet_folders().unwrap();
        assert_eq!(folders[0].name, "New");
    }

    #[test]
    fn test_delete_snippet_folder_moves_snippets_to_general() {
        let store = in_memory_store();
        let folder = store.create_snippet_folder("Work").unwrap();
        let s = store.create_snippet("Test", "Body").unwrap();
        store.move_snippet_to_folder(s.id, Some(folder.id)).unwrap();
        store.delete_snippet_folder(folder.id).unwrap();
        let snippets = store.get_snippets().unwrap();
        assert_eq!(snippets[0].folder_id, None);
        let folders = store.get_snippet_folders().unwrap();
        assert!(folders.is_empty());
    }

    #[test]
    fn test_move_snippet_to_folder() {
        let store = in_memory_store();
        let folder = store.create_snippet_folder("Work").unwrap();
        let s = store.create_snippet("Test", "Body").unwrap();
        assert_eq!(s.folder_id, None);
        store.move_snippet_to_folder(s.id, Some(folder.id)).unwrap();
        let snippets = store.get_snippets().unwrap();
        assert_eq!(snippets[0].folder_id, Some(folder.id));
    }

    #[test]
    fn test_move_snippet_to_folder_places_at_end() {
        let store = in_memory_store();
        let folder = store.create_snippet_folder("Work").unwrap();
        let s1 = store.create_snippet("A", "a").unwrap();
        let s2 = store.create_snippet("B", "b").unwrap();
        store.move_snippet_to_folder(s1.id, Some(folder.id)).unwrap();
        store.move_snippet_to_folder(s2.id, Some(folder.id)).unwrap();
        let snippets = store.get_snippets().unwrap();
        let folder_snippets: Vec<_> = snippets.iter().filter(|s| s.folder_id == Some(folder.id)).collect();
        assert_eq!(folder_snippets[0].id, s1.id);
        assert_eq!(folder_snippets[1].id, s2.id);
        assert_eq!(folder_snippets[0].sort_order, 0);
        assert_eq!(folder_snippets[1].sort_order, 1);
    }

    #[test]
    fn test_reorder_snippet_folder() {
        let store = in_memory_store();
        let f1 = store.create_snippet_folder("A").unwrap();
        let f2 = store.create_snippet_folder("B").unwrap();
        let f3 = store.create_snippet_folder("C").unwrap();
        store.reorder_snippet_folder(f1.id, 2).unwrap();
        let folders = store.get_snippet_folders().unwrap();
        assert_eq!(folders[0].id, f2.id);
        assert_eq!(folders[1].id, f3.id);
        assert_eq!(folders[2].id, f1.id);
    }

    #[test]
    fn test_reorder_snippet_scoped_to_folder() {
        let store = in_memory_store();
        let folder = store.create_snippet_folder("Work").unwrap();
        let s1 = store.create_snippet("A", "a").unwrap();
        let s2 = store.create_snippet("B", "b").unwrap();
        let s3 = store.create_snippet("C", "c").unwrap();
        store.move_snippet_to_folder(s1.id, Some(folder.id)).unwrap();
        store.move_snippet_to_folder(s2.id, Some(folder.id)).unwrap();
        store.reorder_snippet(s1.id, 1).unwrap();
        let snippets = store.get_snippets().unwrap();
        let folder_snippets: Vec<_> = snippets.iter().filter(|s| s.folder_id == Some(folder.id)).collect();
        assert_eq!(folder_snippets[0].id, s2.id);
        assert_eq!(folder_snippets[1].id, s1.id);
        let general: Vec<_> = snippets.iter().filter(|s| s.folder_id.is_none()).collect();
        assert_eq!(general[0].id, s3.id);
    }

    #[test]
    fn test_rename_snippet_folder_unknown_id_returns_error() {
        let store = in_memory_store();
        let result = store.rename_snippet_folder(9999, "New Name");
        assert!(result.is_err());
    }

    #[test]
    fn test_move_snippet_to_folder_unknown_snippet_returns_error() {
        let store = in_memory_store();
        let folder = store.create_snippet_folder("Work").unwrap();
        let result = store.move_snippet_to_folder(9999, Some(folder.id));
        assert!(result.is_err());
    }

    #[test]
    fn test_stats_starts_at_zero() {
        let store = in_memory_store();
        let (copies, pastes, installed_at) = store.get_persisted_stats().unwrap();
        assert_eq!(copies, 0);
        assert_eq!(pastes, 0);
        assert_eq!(installed_at, 0);
    }

    #[test]
    fn test_save_entry_increments_total_copies() {
        let store = in_memory_store();
        store.save_entry(&text_payload("a")).unwrap();
        store.save_entry(&text_payload("b")).unwrap();
        // Duplicate still counts as a copy (user pressed Ctrl+C again)
        store.save_entry(&text_payload("a")).unwrap();
        let (copies, _, _) = store.get_persisted_stats().unwrap();
        assert_eq!(copies, 3);
    }

    #[test]
    fn test_restore_to_clipboard_increments_total_pastes() {
        // Note: this calls into arboard which needs a real clipboard; skip on CI environments
        // where clipboard access fails. The sub-call before clipboard access still increments
        // the counter.
        let store = in_memory_store();
        store.save_entry(&text_payload("hello")).unwrap();
        let id = store.get_all_entries().unwrap()[0].id;
        // Calling this may fail on headless CI when arboard can't access a clipboard;
        // the counter increment happens before that call, so we still verify it.
        let _ = store.restore_to_clipboard(id);
        let (_, pastes, _) = store.get_persisted_stats().unwrap();
        assert_eq!(pastes, 1);
    }

    #[test]
    fn test_set_installed_at_persists_on_first_call() {
        let store = in_memory_store();
        store.set_installed_at_if_unset(1_700_000_000).unwrap();
        let (_, _, installed_at) = store.get_persisted_stats().unwrap();
        assert_eq!(installed_at, 1_700_000_000);
    }

    #[test]
    fn test_set_installed_at_does_not_overwrite_existing_value() {
        let store = in_memory_store();
        store.set_installed_at_if_unset(1_700_000_000).unwrap();
        // Second call (simulating a later app launch) must not change the value.
        store.set_installed_at_if_unset(1_800_000_000).unwrap();
        let (_, _, installed_at) = store.get_persisted_stats().unwrap();
        assert_eq!(installed_at, 1_700_000_000);
    }

    #[test]
    fn test_get_saved_entries_summary() {
        let store = in_memory_store();
        store.save_entry(&text_payload("hi")).unwrap();
        store.save_entry(&text_payload("hello")).unwrap();
        let (count, bytes) = store.get_saved_entries_summary().unwrap();
        assert_eq!(count, 2);
        assert_eq!(bytes, ("hi".len() + "hello".len()) as i64);
    }

    #[test]
    fn test_get_pinned_count() {
        let store = in_memory_store();
        store.save_entry(&text_payload("a")).unwrap();
        store.save_entry(&text_payload("b")).unwrap();
        let entries = store.get_all_entries().unwrap();
        store.toggle_pin(entries[0].id).unwrap();
        assert_eq!(store.get_pinned_count().unwrap(), 1);
    }

    #[test]
    fn test_get_snippet_count() {
        let store = in_memory_store();
        assert_eq!(store.get_snippet_count().unwrap(), 0);
        store.create_snippet("A", "a").unwrap();
        store.create_snippet("B", "b").unwrap();
        assert_eq!(store.get_snippet_count().unwrap(), 2);
    }

    #[test]
    fn test_reset_database_wipes_user_data_keeps_settings() {
        let store = in_memory_store();
        // Populate every user-data table
        store.save_entry(&text_payload("entry")).unwrap();
        store.create_snippet("S", "body").unwrap();
        store.create_snippet_folder("Folder").unwrap();
        store.add_excluded_app("foo.exe").unwrap();
        store.save_settings(&AppSettings {
            shortcut: "Ctrl+ALT+V".to_string(),
            max_entries: 99,
            ..AppSettings::default()
        }).unwrap();
        store.set_installed_at_if_unset(1_700_000_000).unwrap();

        store.reset_database().unwrap();

        assert!(store.get_all_entries().unwrap().is_empty());
        assert!(store.get_snippets().unwrap().is_empty());
        assert!(store.get_snippet_folders().unwrap().is_empty());
        assert!(store.get_excluded_apps().unwrap().is_empty());
        let (copies, pastes, installed_at) = store.get_persisted_stats().unwrap();
        assert_eq!(copies, 0);
        assert_eq!(pastes, 0);
        // installed_at is intentionally preserved across reset
        assert_eq!(installed_at, 1_700_000_000);
        // Settings preserved
        let s = store.get_settings().unwrap();
        assert_eq!(s.shortcut, "Ctrl+ALT+V");
        assert_eq!(s.max_entries, 99);
    }

    #[test]
    fn test_stats_table_migrated_on_legacy_v1_db() {
        // Simulate a database from before the v2 migration: has v1 settings table but no stats.
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE settings (key TEXT PRIMARY KEY, value_text TEXT, value_int INTEGER);
             PRAGMA user_version = 1;"
        ).unwrap();
        let store = SqliteStore { conn: Mutex::new(conn), db_path: None };
        store.run_migrations().unwrap();
        // stats table exists with the seed row
        let (copies, pastes, installed_at) = store.get_persisted_stats().unwrap();
        assert_eq!((copies, pastes, installed_at), (0, 0, 0));
    }

    #[test]
    fn test_v3_migration_renames_last_app_start_and_backfills_from_entries() {
        // Simulate a pre-v3 database that still has the legacy column.
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE settings (key TEXT PRIMARY KEY, value_text TEXT, value_int INTEGER);
             CREATE TABLE entries (
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
             CREATE TABLE stats (
                id              INTEGER PRIMARY KEY CHECK (id = 1),
                total_copies    INTEGER NOT NULL DEFAULT 0,
                total_pastes    INTEGER NOT NULL DEFAULT 0,
                last_app_start  INTEGER NOT NULL DEFAULT 0
             );
             INSERT INTO stats (id, last_app_start) VALUES (1, 2000);
             INSERT INTO entries (kind, content, hash, created_at, last_used_at)
                VALUES ('text', X'61', 'h1', 1000, 1000);
             PRAGMA user_version = 2;"
        ).unwrap();
        let store = SqliteStore { conn: Mutex::new(conn), db_path: None };
        store.run_migrations().unwrap();
        let (_, _, installed_at) = store.get_persisted_stats().unwrap();
        // Earlier entry created_at (1000) wins over the legacy last_app_start (2000).
        assert_eq!(installed_at, 1000);
    }

    #[test]
    fn test_v3_migration_keeps_legacy_value_when_no_earlier_entries() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE settings (key TEXT PRIMARY KEY, value_text TEXT, value_int INTEGER);
             CREATE TABLE stats (
                id              INTEGER PRIMARY KEY CHECK (id = 1),
                total_copies    INTEGER NOT NULL DEFAULT 0,
                total_pastes    INTEGER NOT NULL DEFAULT 0,
                last_app_start  INTEGER NOT NULL DEFAULT 0
             );
             INSERT INTO stats (id, last_app_start) VALUES (1, 1_500_000_000);
             PRAGMA user_version = 2;"
        ).unwrap();
        let store = SqliteStore { conn: Mutex::new(conn), db_path: None };
        store.run_migrations().unwrap();
        let (_, _, installed_at) = store.get_persisted_stats().unwrap();
        assert_eq!(installed_at, 1_500_000_000);
    }
}
