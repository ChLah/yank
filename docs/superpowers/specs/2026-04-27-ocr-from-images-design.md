---
# OCR from Images — Design Spec

**Date:** 2026-04-27
**Status:** Approved

## Overview

Pressing `O` on a focused image entry extracts its text content using Windows' built-in OCR engine and inserts the result as a new text entry at the top of Recent history. The user can then edit, transform, or paste it through YANK's normal text flow.

Inserting into history (rather than pasting immediately) allows the user to review and correct OCR output before using it — important because OCR is imperfect.

## Trigger

`O` key on a focused image entry in the **Recent** or **Pinned** tab. The key is ignored on text entries.

A small "Extract text" label appears in the keyboard hints footer when an image entry is focused (alongside the existing hints).

## Tauri Command

```rust
#[tauri::command]
async fn ocr_image(id: i64, state: State<'_, AppState>) -> Result<String, String>
```

Steps:
1. Load the full-size image bytes from the `content` column for the given entry id (base64-decoded RGBA).
2. Convert RGBA bytes to a `SoftwareBitmap` using `Windows.Graphics.Imaging`.
3. Run `OcrEngine::TryCreateFromUserProfileLanguages()` (falls back to English if the user profile language lacks an OCR pack).
4. Call `engine.RecognizeAsync(bitmap)`.
5. Collect `OcrLine` results, join lines with `\n`.
6. Insert the result as a new `text` entry via `store.save_entry(...)` with `source_app = None`.
7. Return the extracted text string (frontend uses it to show a toast).

### Dependency

Add to `Cargo.toml`:

```toml
[target.'cfg(windows)'.dependencies]
windows = { version = "0.58", features = [
    "Graphics_Imaging",
    "Media_Ocr",
    "Storage_Streams",
] }
```

The `windows` crate is already in use (WinAPI calls in `clipboard_monitor.rs`); only the feature flags are new.

## Frontend

### Loading state

While OCR is running, the focused image entry card shows a spinner overlay and ignores further keypresses. The `O` key is debounced — a second press while loading is a no-op.

### Success

On command resolve:
1. Refresh the entries list (the new text entry is now at the top of Recent).
2. Show a brief toast: "Text extracted — {n} characters".
3. Automatically focus the new text entry so the user can press `Enter` to paste immediately.

### Error / empty result

- Command returns an error string → toast: "OCR failed: {error}".
- Command returns an empty string → toast: "No text found in image." No new entry is inserted.

### i18n Keys

```
OCR.EXTRACTING           = "Extracting text…"
OCR.SUCCESS              = "Text extracted — {count} characters"
OCR.NO_TEXT              = "No text found in image."
OCR.ERROR                = "OCR failed: {error}"
OCR.KEYBOARD_HINT        = "O  Extract text"
```

## Limitations

- OCR accuracy depends on the Windows language pack installed. No fallback to a third-party engine.
- Very large images may be slow; no progress indicator beyond the spinner.
- Handwriting recognition is not enabled (`RecognizeAsync` uses printed-text mode only).

## What is NOT in scope

- OCR on images from the image preview window.
- Batch OCR across multiple selected image entries.
- Language selection for OCR.
- Storing the raw OCR confidence score.
