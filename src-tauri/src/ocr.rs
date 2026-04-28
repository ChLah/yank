use crate::models::{ClipboardContent, ClipboardPayload};
use crate::store::{compute_hash, SqliteStore};

/// Returns the OCR'd text, an empty string if no text was found, or an error.
/// If non-empty, saves the text as a new clipboard entry (source_app = None).
pub async fn ocr_entry(store: &SqliteStore, id: i64) -> Result<String, String> {
    let png_bytes = store.get_entry_image(id).map_err(|e| e.to_string())?;
    let text = run_ocr_on_png_bytes(&png_bytes).await?;
    if !text.is_empty() {
        let payload = ClipboardPayload {
            content: ClipboardContent::Text(text.clone()),
            hash: compute_hash(text.as_bytes()),
            source_app: None,
        };
        store.save_entry(&payload).map_err(|e| e.to_string())?;
    }
    Ok(text)
}

#[cfg(target_os = "windows")]
async fn run_ocr_on_png_bytes(png_bytes: &[u8]) -> Result<String, String> {
    todo!("implemented in Task 2")
}

#[cfg(not(target_os = "windows"))]
async fn run_ocr_on_png_bytes(_png_bytes: &[u8]) -> Result<String, String> {
    Err("OCR is only supported on Windows".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{ClipboardContent, ClipboardPayload};
    use crate::store::sqlite_store::{compute_hash, SqliteStore};
    use rusqlite::Connection;
    use std::sync::Mutex;

    fn in_memory_store() -> SqliteStore {
        let conn = Connection::open_in_memory().unwrap();
        let store = SqliteStore { conn: Mutex::new(conn) };
        store.run_migrations().unwrap();
        store
    }

    #[tokio::test]
    async fn test_ocr_entry_fails_for_text_entry() {
        let store = in_memory_store();
        let payload = ClipboardPayload {
            hash: compute_hash(b"hello"),
            content: ClipboardContent::Text("hello".into()),
            source_app: None,
        };
        store.save_entry(&payload).unwrap();
        let id = store.get_all_entries().unwrap()[0].id;

        let result = ocr_entry(&store, id).await;
        assert!(result.is_err(), "text entry must return Err from ocr_entry");
    }
}
