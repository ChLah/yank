# OCR from Images Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `O` key OCR extraction on focused image entries that inserts the extracted text as a new clipboard history entry.

**Architecture:** A new `src-tauri/src/ocr.rs` module wraps the Windows OCR API behind an `async fn ocr_entry(store, id)`. The Tauri `ocr_image` command delegates to it, saves non-empty results, and returns the text string to Angular. The Angular `ClipboardListComponent` handles the `O` key, debounces it while OCR is running, shows a spinner overlay on the focused entry via `ClipboardEntryComponent`, and toasts the result. Empty result (no text found) shows a warning toast but inserts nothing.

**Tech Stack:** Rust (`windows` crate 0.58 — `Graphics_Imaging`, `Media_Ocr`, `Storage_Streams`, `Globalization` features), Tauri 2 async commands, Angular 18 Signals, existing `SqliteStore`.

---

## File Structure

**New files:**
- `src-tauri/src/ocr.rs` — Windows OCR logic (`run_ocr_on_png_bytes`, `ocr_entry`) + unit tests

**Modified files:**
- `src-tauri/Cargo.toml` — add 4 windows features + tokio `macros` feature
- `src-tauri/src/lib.rs` — add `mod ocr;`, register `commands::ocr_image`
- `src-tauri/src/commands.rs` — add `ocr_image` async command
- `src-tauri/src/store/mod.rs` — re-export `compute_hash`
- `src/app/i18n/translation.interface.ts` — add `OCR` section
- `src/app/i18n/en.ts` — English OCR strings
- `src/app/i18n/de.ts` — German OCR strings
- `src/app/core/services/tauri-bridge.service.ts` — add `ocrImage(id)`
- `src/app/features/clipboard-list/clipboard-entry.component.ts` — add `ocrLoading` input + spinner overlay
- `src/app/features/clipboard-list/clipboard-list.component.ts` — `O` key handler, loading signal, toast signal, OCR footer hint
- `src/app/features/clipboard-list/clipboard-list.component.spec.ts` — test `isOcrTrigger`

---

## Task 1: Extend Cargo.toml and add mod skeleton

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/src/lib.rs`
- Create: `src-tauri/src/ocr.rs`
- Modify: `src-tauri/src/store/mod.rs`

- [ ] **Step 1: Add windows features and tokio macros to Cargo.toml**

In `src-tauri/Cargo.toml`, extend the two existing sections:

```toml
# Async / channels  (was: features = ["sync", "rt-multi-thread"])
tokio = { version = "1", features = ["sync", "rt-multi-thread", "macros"] }
```

```toml
[target.'cfg(target_os = "windows")'.dependencies]
windows = { version = "0.58", features = [
  "Win32_Foundation",
  "Win32_System_LibraryLoader",
  "Win32_UI_WindowsAndMessaging",
  "Win32_System_DataExchange",
  "Win32_Graphics_Gdi",
  "Win32_System_Threading",
  "Win32_System_ProcessStatus",
  "Globalization",
  "Graphics_Imaging",
  "Media_Ocr",
  "Storage_Streams",
] }
```

- [ ] **Step 2: Create `src-tauri/src/ocr.rs` with the public function signatures**

```rust
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
```

- [ ] **Step 3: Re-export `compute_hash` from `src-tauri/src/store/mod.rs`**

```rust
mod sqlite_store;
pub use sqlite_store::{compute_hash, SqliteStore};
```

- [ ] **Step 4: Add `mod ocr;` to `src-tauri/src/lib.rs`**

Add after the existing `mod` declarations (after `mod windows;`):

```rust
mod ocr;
```

- [ ] **Step 5: Run `cargo check` to verify compilation**

Run: `cd src-tauri && cargo check`
Expected: compiles without errors (todo! panics are compile-time OK)

- [ ] **Step 6: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/src/ocr.rs src-tauri/src/lib.rs src-tauri/src/store/mod.rs
git commit -m "feat(ocr): add dependencies and ocr module skeleton"
```

---

## Task 2: Implement `run_ocr_on_png_bytes` (TDD)

**Files:**
- Modify: `src-tauri/src/ocr.rs`

- [ ] **Step 1: Write the failing test**

Add `#[cfg(test)]` block at the bottom of `src-tauri/src/ocr.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_run_ocr_on_invalid_bytes_returns_error() {
        let result = run_ocr_on_png_bytes(b"not a png").await;
        assert!(result.is_err(), "invalid PNG bytes must return Err");
    }
}
```

- [ ] **Step 2: Run test to verify it fails (todo! panics)**

Run: `cd src-tauri && cargo test test_run_ocr_on_invalid_bytes_returns_error -- --nocapture`
Expected: FAIL — `todo!` panics (not an Err, causes a panic)

- [ ] **Step 3: Implement `run_ocr_on_png_bytes`**

Replace the `#[cfg(target_os = "windows")]` `run_ocr_on_png_bytes` stub with the full implementation:

```rust
#[cfg(target_os = "windows")]
async fn run_ocr_on_png_bytes(png_bytes: &[u8]) -> Result<String, String> {
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
    writer.WriteBytes(png_bytes).map_err(|e| e.to_string())?;
    writer.StoreAsync().map_err(|e| e.to_string())?.await.map_err(|e| e.to_string())?;
    writer.DetachStream().map_err(|e| e.to_string())?;
    stream.Seek(0).map_err(|e| e.to_string())?;

    // Decode stream → SoftwareBitmap
    let decoder = BitmapDecoder::CreateAsync(&stream)
        .map_err(|e| e.to_string())?
        .await
        .map_err(|e| e.to_string())?;
    let bitmap = decoder.GetSoftwareBitmapAsync()
        .map_err(|e| e.to_string())?
        .await
        .map_err(|e| e.to_string())?;

    // Create OCR engine — user profile language, fallback to en-US
    let engine = OcrEngine::TryCreateFromUserProfileLanguages()
        .map_err(|e| e.to_string())?
        .or_else(|| {
            let lang = Language::CreateLanguage(&HSTRING::from("en-US")).ok()?;
            OcrEngine::TryCreateFromLanguage(&lang).ok()?
        })
        .ok_or_else(|| {
            "No OCR engine available. Install a Windows OCR language pack.".to_string()
        })?;

    // Run OCR and collect lines
    let result = engine.RecognizeAsync(&bitmap)
        .map_err(|e| e.to_string())?
        .await
        .map_err(|e| e.to_string())?;

    let lines = result.Lines().map_err(|e| e.to_string())?;
    let text = lines
        .into_iter()
        .filter_map(|line| line.Text().ok().map(|t| t.to_string()))
        .collect::<Vec<_>>()
        .join("\n");

    Ok(text)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd src-tauri && cargo test test_run_ocr_on_invalid_bytes_returns_error -- --nocapture`
Expected: PASS — `b"not a png"` fails the BitmapDecoder step and returns `Err`

- [ ] **Step 5: Write the `ocr_entry` failing test**

Add to the `#[cfg(test)]` block in `ocr.rs`:

```rust
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
```

Note: `SqliteStore::run_migrations` and the `conn` field are accessed here — `run_migrations` is already `pub(crate)` in `sqlite_store.rs`. If not public, open `src-tauri/src/store/sqlite_store.rs` and change `fn run_migrations` to `pub(crate) fn run_migrations`.

- [ ] **Step 6: Run test to verify it passes**

Run: `cd src-tauri && cargo test test_ocr_entry_fails_for_text_entry -- --nocapture`
Expected: PASS — `get_entry_image` errors because the entry has `kind='text'`, not `'image'`

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/ocr.rs src-tauri/src/store/sqlite_store.rs
git commit -m "feat(ocr): implement Windows OCR engine in ocr.rs"
```

---

## Task 3: Add `ocr_image` Tauri command and register it

**Files:**
- Modify: `src-tauri/src/commands.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Add `ocr_image` command to `commands.rs`**

Add after the existing `update_entry_content` command:

```rust
#[tauri::command]
pub async fn ocr_image(id: i64, store: StoreState<'_>) -> Result<String, String> {
    crate::ocr::ocr_entry(&store, id).await
}
```

- [ ] **Step 2: Register `ocr_image` in the invoke handler in `lib.rs`**

In the `.invoke_handler(tauri::generate_handler![...])` block, add `commands::ocr_image`:

```rust
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
])
```

- [ ] **Step 3: Run `cargo check`**

Run: `cd src-tauri && cargo check`
Expected: compiles cleanly

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/commands.rs src-tauri/src/lib.rs
git commit -m "feat(ocr): register ocr_image Tauri command"
```

---

## Task 4: Add i18n translations

**Files:**
- Modify: `src/app/i18n/translation.interface.ts`
- Modify: `src/app/i18n/en.ts`
- Modify: `src/app/i18n/de.ts`

- [ ] **Step 1: Add `OCR` section to `translation.interface.ts`**

Add after the `TRANSFORM` section:

```typescript
  OCR: {
    EXTRACTING: string;
    SUCCESS: string;
    NO_TEXT: string;
    ERROR: string;
    KEYBOARD_HINT: string;
  };
```

- [ ] **Step 2: Add English OCR strings to `en.ts`**

Add after the `TRANSFORM` section:

```typescript
  OCR: {
    EXTRACTING: 'Extracting text…',
    SUCCESS: 'Text extracted — {{count}} characters',
    NO_TEXT: 'No text found in image.',
    ERROR: 'OCR failed: {{error}}',
    KEYBOARD_HINT: 'extract text',
  },
```

- [ ] **Step 3: Add German OCR strings to `de.ts`**

Add after the `TRANSFORM` section:

```typescript
  OCR: {
    EXTRACTING: 'Text wird extrahiert…',
    SUCCESS: 'Text extrahiert — {{count}} Zeichen',
    NO_TEXT: 'Kein Text im Bild gefunden.',
    ERROR: 'OCR fehlgeschlagen: {{error}}',
    KEYBOARD_HINT: 'Text extrahieren',
  },
```

- [ ] **Step 4: Run TypeScript check to verify the interface is satisfied**

Run: `pnpm exec tsc --noEmit`
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add src/app/i18n/translation.interface.ts src/app/i18n/en.ts src/app/i18n/de.ts
git commit -m "feat(ocr): add OCR i18n keys for English and German"
```

---

## Task 5: Add `ocrImage` to TauriBridgeService

**Files:**
- Modify: `src/app/core/services/tauri-bridge.service.ts`

- [ ] **Step 1: Add `ocrImage` method**

Add after the `updateEntryContent` method:

```typescript
  ocrImage(id: number): Promise<string> {
    return invoke<string>('ocr_image', { id });
  }
```

- [ ] **Step 2: Verify TypeScript**

Run: `pnpm exec tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/app/core/services/tauri-bridge.service.ts
git commit -m "feat(ocr): add ocrImage to TauriBridgeService"
```

---

## Task 6: Add spinner overlay to `ClipboardEntryComponent`

**Files:**
- Modify: `src/app/features/clipboard-list/clipboard-entry.component.ts`

- [ ] **Step 1: Add `ocrLoading` input**

Add after the existing `editMode = input(false);`:

```typescript
  ocrLoading = input(false);
```

- [ ] **Step 2: Add `relative` positioning class to the outer container and spinner overlay**

In the template, change the outer `<div>` class binding to include `relative`:

```html
<div
  class="relative flex items-center gap-2 pl-3.5 pr-3 group transition-colors border-l-2"
  [class.cursor-pointer]="!editMode()"
  [class]="selected() ? 'border-l-brand bg-card' : 'border-l-transparent hover:bg-card/60'"
  (click)="onOuterClick()"
>
```

Then add the spinner overlay as the **first child** inside that outer div (before the `@if (editMode())` block):

```html
  @if (ocrLoading()) {
    <div class="absolute inset-0 z-10 flex items-center justify-center bg-background/60 rounded-sm">
      <div class="w-4 h-4 border-2 border-brand/40 border-t-brand rounded-full animate-spin"></div>
    </div>
  }
```

- [ ] **Step 3: Run TypeScript check**

Run: `pnpm exec tsc --noEmit`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add src/app/features/clipboard-list/clipboard-entry.component.ts
git commit -m "feat(ocr): add spinner overlay to ClipboardEntryComponent"
```

---

## Task 7: Add OCR key handler, toast, and footer hint to `ClipboardListComponent`

**Files:**
- Modify: `src/app/features/clipboard-list/clipboard-list.component.ts`
- Modify: `src/app/features/clipboard-list/clipboard-list.component.spec.ts`

- [ ] **Step 1: Write failing test for `isOcrTrigger`**

Add to `clipboard-list.component.spec.ts`:

```typescript
import { getQuickPasteDigit, isOcrTrigger, resolveEditModeAction, shouldCancelEditOnSelect } from './clipboard-list.component';

describe('isOcrTrigger', () => {
  function makeEvent(key: string, mods: Partial<KeyboardEvent> = {}): KeyboardEvent {
    return {
      key,
      ctrlKey: false,
      shiftKey: false,
      altKey: false,
      metaKey: false,
      ...mods,
    } as KeyboardEvent;
  }

  it('returns true for lowercase o', () => {
    expect(isOcrTrigger(makeEvent('o'))).toBe(true);
  });

  it('returns true for uppercase O', () => {
    expect(isOcrTrigger(makeEvent('O'))).toBe(true);
  });

  it('returns false with Ctrl modifier', () => {
    expect(isOcrTrigger(makeEvent('o', { ctrlKey: true }))).toBe(false);
  });

  it('returns false with Alt modifier', () => {
    expect(isOcrTrigger(makeEvent('o', { altKey: true }))).toBe(false);
  });

  it('returns false with Meta modifier', () => {
    expect(isOcrTrigger(makeEvent('o', { metaKey: true }))).toBe(false);
  });

  it('returns false for other keys', () => {
    expect(isOcrTrigger(makeEvent('p'))).toBe(false);
    expect(isOcrTrigger(makeEvent('e'))).toBe(false);
    expect(isOcrTrigger(makeEvent('Enter'))).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- --testPathPattern clipboard-list.component.spec`
Expected: FAIL — `isOcrTrigger` not exported

- [ ] **Step 3: Export `isOcrTrigger` from `clipboard-list.component.ts`**

Add at the bottom of `clipboard-list.component.ts` (alongside the existing exported functions):

```typescript
/** Returns true when the event is the O key without modifier keys. Exported for unit testing. */
export function isOcrTrigger(event: KeyboardEvent): boolean {
  return event.key.toLowerCase() === 'o' && !event.ctrlKey && !event.altKey && !event.metaKey;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- --testPathPattern clipboard-list.component.spec`
Expected: all tests PASS

- [ ] **Step 5: Add OCR state signals and timer fields to the component class**

In the `ClipboardListComponent` class body, add after the existing signal/timer declarations:

```typescript
  protected ocrLoadingEntryId = signal<number | null>(null);
  protected ocrToast = signal<{ key: string; params?: Record<string, unknown>; success: boolean } | null>(null);
  private ocrToastTimer: ReturnType<typeof setTimeout> | null = null;
```

- [ ] **Step 6: Add `selectedEntryIsImage` computed signal**

Add after `protected pinnedCount`:

```typescript
  protected selectedEntryIsImage = computed(() => {
    const entry = this.filteredEntries()[this.selectedIndex()];
    return entry?.kind === 'image' ?? false;
  });
```

- [ ] **Step 7: Add `triggerOcr` private method**

Add after `onEditCancel`:

```typescript
  private async triggerOcr(): Promise<void> {
    const entry = this.filteredEntries()[this.selectedIndex()];
    if (!entry || entry.kind !== 'image') return;
    if (this.ocrLoadingEntryId() !== null) return; // debounce: ignore while loading

    this.ocrLoadingEntryId.set(entry.id);
    try {
      const text = await this.bridge.ocrImage(entry.id);
      if (text === '') {
        this.showOcrToast('OCR.NO_TEXT', undefined, false);
      } else {
        this.clipboard.entries.reload();
        this.activeTab.set('recent');
        this.selectedIndex.set(0);
        this.showOcrToast('OCR.SUCCESS', { count: text.length }, true);
      }
    } catch (err: unknown) {
      const error = typeof err === 'string' ? err : 'Unknown error';
      this.showOcrToast('OCR.ERROR', { error }, false);
    } finally {
      this.ocrLoadingEntryId.set(null);
    }
  }

  private showOcrToast(key: string, params: Record<string, unknown> | undefined, success: boolean): void {
    if (this.ocrToastTimer) clearTimeout(this.ocrToastTimer);
    this.ocrToast.set({ key, params, success });
    this.ocrToastTimer = setTimeout(() => this.ocrToast.set(null), 2500);
  }
```

- [ ] **Step 8: Handle `O` key in `onKeyDown`**

In the `default:` branch of the `switch (event.key)` block, add the OCR branch. The current structure is:

```typescript
      default:
        if (event.key.length === 1 && !event.ctrlKey && !event.altKey && !event.metaKey) {
          if (event.key.toLowerCase() === 'p') {
            event.preventDefault();
            this.pinSelected();
          } else if (event.key.toLowerCase() === 'e') {
            event.preventDefault();
            this.enterEditMode();
          } else {
```

Change to:

```typescript
      default:
        if (event.key.length === 1 && !event.ctrlKey && !event.altKey && !event.metaKey) {
          if (event.key.toLowerCase() === 'p') {
            event.preventDefault();
            this.pinSelected();
          } else if (event.key.toLowerCase() === 'e') {
            event.preventDefault();
            this.enterEditMode();
          } else if (isOcrTrigger(event)) {
            event.preventDefault();
            this.triggerOcr();
          } else {
```

- [ ] **Step 9: Clear `ocrToastTimer` in `ngOnDestroy`**

In `ngOnDestroy`, add:

```typescript
    if (this.ocrToastTimer) clearTimeout(this.ocrToastTimer);
```

- [ ] **Step 10: Pass `[ocrLoading]` to `<app-clipboard-entry>` in the template**

Find the existing `<app-clipboard-entry>` binding and add `[ocrLoading]`:

```html
<app-clipboard-entry
  [entry]="entry"
  [selected]="selectedIndex() === i"
  [editMode]="editingEntryId() === entry.id"
  [ocrLoading]="ocrLoadingEntryId() === entry.id"
  (select)="selectEntry(i)"
  (delete)="deleteEntry(i)"
  (pin)="pinEntry(i)"
  (editConfirm)="onEditConfirm($event)"
  (editCancel)="onEditCancel()"
/>
```

- [ ] **Step 11: Add OCR toast display in the template**

After the existing `@if (editCopyFailed())` toast block (and before the footer `<div>`), add:

```html
      @if (ocrToast()) {
        <div
          class="px-3.5 py-1.5 border-t text-[11px] shrink-0 animate-slide-up"
          [class]="ocrToast()!.success
            ? 'bg-brand/10 border-brand/20 text-brand-300'
            : 'bg-destructive/10 border-destructive/20 text-destructive'">
          {{ ocrToast()!.key | translate:ocrToast()!.params }}
        </div>
      }
```

- [ ] **Step 12: Add OCR keyboard hint to footer**

In the second footer row (the one with `⌫`, `P`, `E`, `Ctrl+1–9`, `Esc`), add the conditional OCR hint after `E`:

```html
          <app-keyboard-hint key="⌫" [label]="'CLIPBOARD.HINT_DELETE' | translate" />
          <app-keyboard-hint key="P" [label]="'CLIPBOARD.HINT_PIN' | translate" />
          <app-keyboard-hint key="E" [label]="'CLIPBOARD.HINT_EDIT' | translate" />
          @if (selectedEntryIsImage()) {
            <app-keyboard-hint key="O" [label]="'OCR.KEYBOARD_HINT' | translate" />
          }
          <app-keyboard-hint key="Ctrl+1–9" [label]="'CLIPBOARD.HINT_QUICK_PASTE' | translate" />
          <app-keyboard-hint key="Esc" [label]="'CLIPBOARD.HINT_CLOSE' | translate" class="ml-auto" />
```

- [ ] **Step 13: Run TypeScript check and tests**

Run both:
```
pnpm exec tsc --noEmit
pnpm test -- --testPathPattern clipboard-list.component.spec
```
Expected: no TypeScript errors, all tests PASS

- [ ] **Step 14: Commit**

```bash
git add src/app/features/clipboard-list/clipboard-list.component.ts src/app/features/clipboard-list/clipboard-list.component.spec.ts
git commit -m "feat(ocr): handle O key, toast, loading state and footer hint in ClipboardListComponent"
```

---

## Task 8: Full build verification

- [ ] **Step 1: Run all Rust tests**

Run: `cd src-tauri && cargo test`
Expected: all tests PASS

- [ ] **Step 2: Run all Angular tests**

Run: `pnpm test`
Expected: all tests PASS

- [ ] **Step 3: Build the full app**

Run: `pnpm tauri build` (or `pnpm tauri dev` for a dev build)
Expected: compiles without errors

- [ ] **Step 4: Manual smoke test**
  1. Launch the app (`pnpm tauri dev`)
  2. Copy an image to the clipboard (e.g. screenshot)
  3. Open YANK, navigate to the image entry with arrow keys
  4. Verify the footer shows `O  extract text`
  5. Press `O` — verify spinner appears on the entry card
  6. After OCR completes, verify:
     - A new text entry is at position 0 in Recent
     - The new entry is auto-focused (selected)
     - A toast shows "Text extracted — N characters"
  7. Copy an image with no text (solid colour block)
  8. Press `O` on it — verify toast shows "No text found in image."
  9. Press `O` while OCR is running (second press) — verify nothing happens (debounce)

- [ ] **Step 5: Final commit (if any cleanup needed)**

```bash
git add -p  # stage only intentional changes
git commit -m "feat(ocr): OCR from images — complete implementation"
```

---

## Spec Coverage Checklist

| Spec requirement | Task |
|---|---|
| `O` key on image entry triggers OCR | Task 7, Step 8 |
| Key ignored on text entries | Task 7, Step 7 (`entry.kind !== 'image'` guard) |
| "Extract text" label in footer when image focused | Task 7, Step 12 |
| `ocr_image` Tauri command | Task 3 |
| Load PNG bytes from store | Task 2 (`ocr_entry` → `store.get_entry_image`) |
| Convert to SoftwareBitmap via `BitmapDecoder` | Task 2 (`run_ocr_on_png_bytes`) |
| `OcrEngine::TryCreateFromUserProfileLanguages` + English fallback | Task 2 |
| Join `OcrLine` results with `\n` | Task 2 |
| Insert text via `store.save_entry` with `source_app = None` | Task 2 |
| Return extracted text string | Task 3 |
| `windows` crate feature flags | Task 1 |
| Spinner overlay during loading | Task 6 |
| `O` key debounced while loading | Task 7, Step 7 (`ocrLoadingEntryId` guard) |
| Success: refresh entries | Task 7, Step 7 |
| Success: toast "Text extracted — N characters" | Task 7, Steps 7 + 11 |
| Success: auto-focus new text entry (index 0) | Task 7, Step 7 |
| Error toast "OCR failed: {error}" | Task 7, Steps 7 + 11 |
| Empty result: toast "No text found" | Task 7, Steps 7 + 11 |
| Empty result: no entry inserted | Task 2 (`!text.is_empty()` guard) |
| i18n keys (all 5) | Task 4 |
