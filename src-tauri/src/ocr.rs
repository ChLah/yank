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
    // Clone bytes so we can move them into the blocking task
    let bytes = png_bytes.to_vec();
    tokio::task::spawn_blocking(move || {
        use windows::{
            Globalization::Language,
            Graphics::Imaging::BitmapDecoder,
            Media::Ocr::OcrEngine,
            Storage::Streams::{DataWriter, InMemoryRandomAccessStream},
            core::HSTRING,
        };

        // Write PNG bytes into an in-memory stream
        let stream = InMemoryRandomAccessStream::new().map_err(|e| e.to_string())?;
        let writer = DataWriter::CreateDataWriter(&stream).map_err(|e| e.to_string())?;
        writer.WriteBytes(&bytes).map_err(|e| e.to_string())?;
        writer.StoreAsync().map_err(|e| e.to_string())?.get().map_err(|e| e.to_string())?;
        writer.DetachStream().map_err(|e| e.to_string())?;
        stream.Seek(0u64).map_err(|e| e.to_string())?;

        // Decode PNG stream → SoftwareBitmap
        let decoder = BitmapDecoder::CreateAsync(&stream)
            .map_err(|e| e.to_string())?
            .get()
            .map_err(|e| e.to_string())?;
        let bitmap = decoder.GetSoftwareBitmapAsync()
            .map_err(|e| e.to_string())?
            .get()
            .map_err(|e| e.to_string())?;

        // Create OCR engine — user profile language, fallback to en-US
        let engine = OcrEngine::TryCreateFromUserProfileLanguages()
            .or_else(|_| {
                Language::CreateLanguage(&HSTRING::from("en-US"))
                    .and_then(|lang| OcrEngine::TryCreateFromLanguage(&lang))
            })
            .map_err(|_| {
                "No OCR engine available. Install a Windows OCR language pack.".to_string()
            })?;

        // Run OCR and collect text lines
        let result = engine.RecognizeAsync(&bitmap)
            .map_err(|e| e.to_string())?
            .get()
            .map_err(|e| e.to_string())?;

        let lines = result.Lines().map_err(|e| e.to_string())?;
        let text = lines
            .into_iter()
            .filter_map(|line| line.Text().ok().map(|t| t.to_string()))
            .collect::<Vec<_>>()
            .join("\n");

        Ok(text)
    })
    .await
    .map_err(|e| e.to_string())?
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
    async fn test_run_ocr_on_invalid_bytes_returns_error() {
        let result = run_ocr_on_png_bytes(b"not a png").await;
        assert!(result.is_err(), "invalid PNG bytes must return Err");
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
