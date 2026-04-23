use std::sync::Mutex;

use base64::{engine::general_purpose, Engine as _};
use image::imageops::FilterType;
use rusqlite::{params, Connection};
use sha2::{Digest, Sha256};

use crate::models::{AppSettings, ClipboardContent, ClipboardEntry, ClipboardPayload};

const THUMBNAIL_MAX_SIZE: u32 = 200;

pub struct SqliteStore {
    conn: Mutex<Connection>,
}

impl SqliteStore {
    pub fn new(db_path: &std::path::Path) -> Result<Self, rusqlite::Error> {
        let conn = Connection::open(db_path)?;
        let store = Self { conn: Mutex::new(conn) };
        store.run_migrations()?;
        Ok(store)
    }

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
            CREATE INDEX IF NOT EXISTS idx_entries_last_used ON entries (last_used_at DESC);
            CREATE TABLE IF NOT EXISTS settings (
                key   TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );"
        )?;

        // For existing databases that pre-date this migration, add pinned column if missing.
        // SQLite does not support ADD COLUMN IF NOT EXISTS, so we check via PRAGMA.
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

        Ok(())
    }

    /// Save a clipboard payload, handling dedup. Returns the updated entry list.
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

        let max_entries = self.get_max_entries_internal(&conn);

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

        // Prune oldest entries beyond max_entries
        conn.execute(
            "DELETE FROM entries WHERE id IN (
                SELECT id FROM entries WHERE pinned = 0 ORDER BY last_used_at DESC LIMIT -1 OFFSET ?1
             )",
            params![max_entries],
        )?;

        Ok(())
    }

    pub fn get_all_entries(&self) -> Result<Vec<ClipboardEntry>, rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, kind, content, thumbnail, width, height, hash, created_at, last_used_at, pinned
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
        conn.execute(
            "UPDATE entries SET pinned = CASE WHEN pinned = 0 THEN 1 ELSE 0 END WHERE id = ?1",
            params![id],
        )?;
        let new_val: i64 = conn.query_row(
            "SELECT pinned FROM entries WHERE id = ?1",
            params![id],
            |row| row.get(0),
        )?;
        Ok(new_val == 1)
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

        // Update last_used_at
        let now = chrono::Utc::now().timestamp();
        conn.execute(
            "UPDATE entries SET last_used_at = ?1 WHERE id = ?2",
            params![now, id],
        )?;
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
        let shortcut = conn
            .query_row(
                "SELECT value FROM settings WHERE key = 'shortcut'",
                [],
                |row| row.get::<_, String>(0),
            )
            .unwrap_or_else(|_| AppSettings::default().shortcut);

        let max_entries = conn
            .query_row(
                "SELECT value FROM settings WHERE key = 'max_entries'",
                [],
                |row| row.get::<_, String>(0),
            )
            .ok()
            .and_then(|v| v.parse::<i64>().ok())
            .unwrap_or(AppSettings::default().max_entries);

        Ok(AppSettings { shortcut, max_entries })
    }

    pub fn save_settings(&self, settings: &AppSettings) -> Result<(), rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT OR REPLACE INTO settings (key, value) VALUES ('shortcut', ?1)",
            params![settings.shortcut],
        )?;
        conn.execute(
            "INSERT OR REPLACE INTO settings (key, value) VALUES ('max_entries', ?1)",
            params![settings.max_entries.to_string()],
        )?;
        Ok(())
    }

    fn get_max_entries_internal(&self, conn: &Connection) -> i64 {
        conn.query_row(
            "SELECT value FROM settings WHERE key = 'max_entries'",
            [],
            |row| row.get::<_, String>(0),
        )
        .ok()
        .and_then(|v| v.parse::<i64>().ok())
        .unwrap_or(20)
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
        let store = SqliteStore { conn: Mutex::new(conn) };
        store.run_migrations().unwrap();
        store
    }

    fn text_payload(text: &str) -> ClipboardPayload {
        ClipboardPayload {
            hash: compute_hash(text.as_bytes()),
            content: ClipboardContent::Text(text.to_string()),
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
        store.save_settings(&AppSettings { shortcut: "Ctrl+SEMICOLON".into(), max_entries: 3 }).unwrap();

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
        let settings = AppSettings { shortcut: "Ctrl+ALT+V".to_string(), max_entries: 10 };
        store.save_settings(&settings).unwrap();
        let loaded = store.get_settings().unwrap();
        assert_eq!(loaded.shortcut, "Ctrl+ALT+V");
        assert_eq!(loaded.max_entries, 10);
    }

    #[test]
    fn test_migration_is_idempotent() {
        // Calling run_migrations() twice on the same database must not error.
        let store = in_memory_store(); // first call happens inside in_memory_store()
        store.run_migrations().unwrap(); // second call — must succeed without error
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
        let store = SqliteStore { conn: Mutex::new(conn) };
        // run_migrations must detect missing pinned column and ALTER TABLE successfully
        store.run_migrations().unwrap();
        // Verify pinned column works — save entry, get it back with pinned=false
        store.save_entry(&text_payload("legacy")).unwrap();
        let entries = store.get_all_entries().unwrap();
        assert!(!entries[0].pinned);
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
    fn test_pinned_entries_not_pruned() {
        let store = in_memory_store();
        store.save_settings(&AppSettings {
            shortcut: "Ctrl+Quote".into(),
            max_entries: 2,
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
}
