# Source App Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Record the foreground process name at clipboard-capture time and display it alongside the timestamp on each clipboard entry card.

**Architecture:** Add a nullable `source_app TEXT` column to SQLite, thread the foreground process name from the Win32 message pump through the clipboard processor to the store, then render it in the Angular entry card footer alongside the timestamp.

**Tech Stack:** Rust (windows 0.58 crate, WinAPI), rusqlite, Angular 18 (signals, OnPush), Tailwind CSS.

---

## File Map

| Action | File |
|--------|------|
| Modify | `src-tauri/Cargo.toml` — add Win32_System_Threading + Win32_System_ProcessStatus features |
| Modify | `src-tauri/src/models.rs` — add `source_app` to `ClipboardEntry` and `ClipboardPayload` |
| Modify | `src-tauri/src/store/sqlite_store.rs` — migration, INSERT, SELECT, test helper, new tests |
| Modify | `src-tauri/src/platform/windows/clipboard_monitor.rs` — `get_foreground_process_name()`, channel type, wnd_proc, process_clipboard_change |
| Modify | `src/app/core/models/clipboard-entry.model.ts` — add `sourceApp` field |
| Modify | `src/app/features/clipboard-list/clipboard-entry.component.ts` — footer row with source app + timestamp |
| Modify | `src/app/features/clipboard-list/clipboard-entry.component.spec.ts` — snapshot test for footer rendering |

---

## Task 1: Add required Windows crate features

**Files:**
- Modify: `src-tauri/Cargo.toml:52-59`

- [ ] **Step 1: Add Win32_System_Threading and Win32_System_ProcessStatus features**

In `src-tauri/Cargo.toml`, update the windows dependency block from:
```toml
windows = { version = "0.58", features = [
  "Win32_Foundation",
  "Win32_System_LibraryLoader",
  "Win32_UI_WindowsAndMessaging",
  "Win32_System_DataExchange",
  "Win32_Graphics_Gdi",
] }
```

To:
```toml
windows = { version = "0.58", features = [
  "Win32_Foundation",
  "Win32_System_LibraryLoader",
  "Win32_UI_WindowsAndMessaging",
  "Win32_System_DataExchange",
  "Win32_Graphics_Gdi",
  "Win32_System_Threading",
  "Win32_System_ProcessStatus",
] }
```

- [ ] **Step 2: Verify it compiles**

```bash
cd src-tauri && cargo check 2>&1 | tail -5
```

Expected: no errors (warnings are fine).

- [ ] **Step 3: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/Cargo.lock
git commit -m "chore: add Win32 threading/process-status features for foreground process capture"
```

---

## Task 2: Add source_app to Rust models

**Files:**
- Modify: `src-tauri/src/models.rs:5-16` (ClipboardEntry)
- Modify: `src-tauri/src/models.rs:85-89` (ClipboardPayload)

- [ ] **Step 1: Add source_app to ClipboardEntry**

In `src-tauri/src/models.rs`, replace the `ClipboardEntry` struct (lines 3–16) with:

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClipboardEntry {
    pub id: i64,
    pub kind: String,
    pub content: Option<String>,
    pub thumbnail: Option<String>,
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub hash: String,
    pub created_at: i64,
    pub last_used_at: i64,
    pub pinned: bool,
    pub source_app: Option<String>,
}
```

- [ ] **Step 2: Add source_app to ClipboardPayload**

In `src-tauri/src/models.rs`, replace the `ClipboardPayload` struct (lines 85–89) with:

```rust
#[derive(Debug, Clone)]
pub struct ClipboardPayload {
    pub content: ClipboardContent,
    pub hash: String,
    pub source_app: Option<String>,
}
```

- [ ] **Step 3: Fix ClipboardPayload construction in clipboard_monitor.rs**

In `src-tauri/src/platform/windows/clipboard_monitor.rs`, both `ClipboardPayload` struct literals inside `read_clipboard()` (lines 64–67 and 73–79) need `source_app: None` added. Replace `read_clipboard` with:

```rust
fn read_clipboard() -> Result<Option<ClipboardPayload>, Box<dyn std::error::Error + Send + Sync>> {
    let mut clipboard = arboard::Clipboard::new()?;

    if let Ok(text) = clipboard.get_text() {
        if text.trim().is_empty() {
            return Ok(None);
        }
        let hash = compute_hash(text.as_bytes());
        return Ok(Some(ClipboardPayload {
            hash,
            content: ClipboardContent::Text(text),
            source_app: None,
        }));
    }

    if let Ok(img) = clipboard.get_image() {
        let hash = compute_hash(&img.bytes);
        return Ok(Some(ClipboardPayload {
            hash,
            content: ClipboardContent::Image {
                rgba_bytes: img.bytes.into_owned(),
                width: img.width as u32,
                height: img.height as u32,
            },
            source_app: None,
        }));
    }

    Ok(None)
}
```

- [ ] **Step 4: Fix text_payload test helper in sqlite_store.rs**

In `src-tauri/src/store/sqlite_store.rs`, update the `text_payload` helper (lines 469–474):

```rust
fn text_payload(text: &str) -> ClipboardPayload {
    ClipboardPayload {
        hash: compute_hash(text.as_bytes()),
        content: ClipboardContent::Text(text.to_string()),
        source_app: None,
    }
}
```

- [ ] **Step 5: Verify it compiles**

```bash
cd src-tauri && cargo check 2>&1 | tail -5
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/models.rs src-tauri/src/platform/windows/clipboard_monitor.rs src-tauri/src/store/sqlite_store.rs
git commit -m "feat: add source_app field to ClipboardEntry and ClipboardPayload"
```

---

## Task 3: SQLite migration for source_app column

**Files:**
- Modify: `src-tauri/src/store/sqlite_store.rs:42-55` (run_migrations)
- Test: `src-tauri/src/store/sqlite_store.rs` (tests module)

- [ ] **Step 1: Write failing test for migration**

In `src-tauri/src/store/sqlite_store.rs`, add this test inside the `#[cfg(test)] mod tests` block (after the existing `test_migration_adds_pinned_to_legacy_schema` test):

```rust
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
    let store = SqliteStore { conn: Mutex::new(conn) };
    store.run_migrations().unwrap();
    // source_app column must now exist; save_entry should not error
    store.save_entry(&text_payload("legacy")).unwrap();
    let entries = store.get_all_entries().unwrap();
    assert_eq!(entries[0].source_app, None);
}
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd src-tauri && cargo test test_migration_adds_source_app_to_legacy_schema -- --nocapture 2>&1 | tail -15
```

Expected: FAIL (source_app column doesn't exist yet, save_entry will error).

- [ ] **Step 3: Add migration in run_migrations**

In `src-tauri/src/store/sqlite_store.rs`, add the `source_app` migration immediately after the `has_pinned` block (after line 55, before the settings versioning block). Insert:

```rust
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
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd src-tauri && cargo test test_migration_adds_source_app_to_legacy_schema -- --nocapture 2>&1 | tail -10
```

Expected: PASS.

- [ ] **Step 5: Run full test suite to confirm no regressions**

```bash
cd src-tauri && cargo test 2>&1 | tail -15
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/store/sqlite_store.rs
git commit -m "feat: migrate entries table to add nullable source_app column"
```

---

## Task 4: Update save_entry INSERT to persist source_app

**Files:**
- Modify: `src-tauri/src/store/sqlite_store.rs:103-118` (save_entry INSERT branches)
- Test: `src-tauri/src/store/sqlite_store.rs` (tests module)

- [ ] **Step 1: Write failing test**

Add to the `tests` module in `sqlite_store.rs`:

```rust
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
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd src-tauri && cargo test "test_save_entry_persists_source_app|test_save_entry_null_source_app" -- --nocapture 2>&1 | tail -15
```

Expected: FAIL (source_app not included in INSERT yet, so it's always NULL even when provided).

- [ ] **Step 3: Update INSERT statements in save_entry**

In `src-tauri/src/store/sqlite_store.rs`, replace the two `match &payload.content` INSERT branches (lines 102–119) with:

```rust
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
```

- [ ] **Step 4: Update SELECT and row mapping in get_all_entries**

In `src-tauri/src/store/sqlite_store.rs`, replace the `get_all_entries` SELECT statement and row mapping (lines 154–191) with:

```rust
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
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd src-tauri && cargo test "test_save_entry_persists_source_app|test_save_entry_null_source_app" -- --nocapture 2>&1 | tail -10
```

Expected: PASS.

- [ ] **Step 6: Run full test suite**

```bash
cd src-tauri && cargo test 2>&1 | tail -15
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/store/sqlite_store.rs
git commit -m "feat: persist and retrieve source_app in clipboard entries"
```

---

## Task 5: Capture foreground process name at clipboard-change time

**Files:**
- Modify: `src-tauri/src/platform/windows/clipboard_monitor.rs` (entire file)

The `WM_CLIPBOARDUPDATE` message arrives on the Win32 pump thread. We capture the foreground process at that moment (most accurate) and send it through the channel to the processor thread. This requires changing the channel type from `channel::<()>` to `channel::<Option<String>>()`.

- [ ] **Step 1: Add get_foreground_process_name function**

In `src-tauri/src/platform/windows/clipboard_monitor.rs`, add these imports at the top of the windows imports block (after line 88, inside the existing `use windows::Win32` block, or as a separate use block):

```rust
use windows::{
    core::PWSTR,
    Win32::{
        Foundation::CloseHandle,
        System::{
            ProcessStatus::GetModuleFileNameExW,
            Threading::{OpenProcess, PROCESS_QUERY_INFORMATION, PROCESS_VM_READ},
        },
        UI::WindowsAndMessaging::GetWindowThreadProcessId,
    },
};
```

Then add the function after `read_clipboard` (before the `// ── Win32 message pump` comment at line 86):

```rust
fn get_foreground_process_name() -> Option<String> {
    use windows::Win32::UI::WindowsAndMessaging::GetForegroundWindow;
    unsafe {
        let hwnd = GetForegroundWindow();
        if hwnd.0 == 0 {
            return None;
        }
        let mut pid: u32 = 0;
        GetWindowThreadProcessId(hwnd, Some(&mut pid));
        if pid == 0 {
            return None;
        }
        let handle = OpenProcess(PROCESS_QUERY_INFORMATION | PROCESS_VM_READ, false, pid).ok()?;
        let mut buf = [0u16; 260];
        let len = GetModuleFileNameExW(handle, None, PWSTR(buf.as_mut_ptr()), buf.len() as u32);
        let _ = CloseHandle(handle);
        if len == 0 {
            return None;
        }
        let path = String::from_utf16_lossy(&buf[..len as usize]);
        std::path::Path::new(&path)
            .file_name()
            .and_then(|n| n.to_str())
            .filter(|name| !name.eq_ignore_ascii_case("yank.exe"))
            .map(|name| name.to_owned())
    }
}
```

- [ ] **Step 2: Change channel type and wire source_app through**

Replace the `start` function, `process_clipboard_change` function, and the `thread_local! TRIGGER_TX` block with the following. The channel now carries `Option<String>` (the foreground process name captured at message time):

```rust
pub fn start(app_handle: tauri::AppHandle, store: Arc<SqliteStore>) {
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
                process_clipboard_change(&app_handle, &store, source_app);
            }
        })
        .expect("Failed to spawn clipboard processor thread");
}

fn process_clipboard_change(
    app_handle: &tauri::AppHandle,
    store: &Arc<SqliteStore>,
    source_app: Option<String>,
) {
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

- [ ] **Step 3: Update TRIGGER_TX and wnd_proc to send the process name**

Replace the `thread_local!` block and `wnd_proc` function:

```rust
thread_local! {
    static TRIGGER_TX: std::cell::RefCell<Option<std::sync::mpsc::Sender<Option<String>>>> =
        std::cell::RefCell::new(None);
}
```

And in `wnd_proc`, replace the `WM_CLIPBOARDUPDATE` arm:

```rust
        WM_CLIPBOARDUPDATE => {
            let proc_name = get_foreground_process_name();
            TRIGGER_TX.with(|cell| {
                if let Some(tx) = cell.borrow().as_ref() {
                    let _ = tx.send(proc_name);
                }
            });
            LRESULT(0)
        }
```

- [ ] **Step 4: Verify it compiles**

```bash
cd src-tauri && cargo check 2>&1 | tail -10
```

Expected: no errors.

- [ ] **Step 5: Run full test suite**

```bash
cd src-tauri && cargo test 2>&1 | tail -15
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/platform/windows/clipboard_monitor.rs
git commit -m "feat: capture foreground process name at clipboard-change time"
```

---

## Task 6: Update TypeScript model

**Files:**
- Modify: `src/app/core/models/clipboard-entry.model.ts`

- [ ] **Step 1: Add sourceApp to ClipboardEntry interface**

Replace the entire file content of `src/app/core/models/clipboard-entry.model.ts` with:

```typescript
export type ClipboardKind = 'text' | 'image';

export interface ClipboardEntry {
  id: number;
  kind: ClipboardKind;
  content: string | null;
  thumbnail: string | null;
  width: number | null;
  height: number | null;
  hash: string;
  createdAt: number;
  lastUsedAt: number;
  pinned: boolean;
  sourceApp: string | null;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors (or only pre-existing errors unrelated to this field).

- [ ] **Step 3: Commit**

```bash
git add src/app/core/models/clipboard-entry.model.ts
git commit -m "feat: add sourceApp field to TypeScript ClipboardEntry model"
```

---

## Task 7: Display source app in entry card footer

**Files:**
- Modify: `src/app/features/clipboard-list/clipboard-entry.component.ts`
- Modify: `src/app/features/clipboard-list/clipboard-entry.component.spec.ts`

The redesigned card footer shows `sourceApp · timestamp` (or just `timestamp` when `sourceApp` is null) as the second line inside the content div. The standalone timestamp `<span>` is removed from the right-side action div.

- [ ] **Step 1: Write failing test**

Open `src/app/features/clipboard-list/clipboard-entry.component.spec.ts` and add:

```typescript
import { buildRelativeTimeTranslation } from './clipboard-entry.component';

describe('buildRelativeTimeTranslation', () => {
  it('returns TIME_JUST_NOW for timestamps within the last minute', () => {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const result = buildRelativeTimeTranslation(nowSeconds - 30);
    expect(result.key).toBe('ENTRY.TIME_JUST_NOW');
  });

  it('returns TIME_MINUTES for timestamps 1-59 minutes ago', () => {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const result = buildRelativeTimeTranslation(nowSeconds - 5 * 60);
    expect(result.key).toBe('ENTRY.TIME_MINUTES');
    expect(result.params).toEqual({ n: 5 });
  });
});
```

Note: `buildRelativeTimeTranslation` must be exported from the component file (see Step 2).

- [ ] **Step 2: Run tests to verify current state**

```bash
npx ng test --include="**/clipboard-entry.component.spec.ts" --watch=false 2>&1 | tail -20
```

Expected: the new tests will fail because `buildRelativeTimeTranslation` is not exported yet.

- [ ] **Step 3: Update the component**

Replace the entire content of `src/app/features/clipboard-list/clipboard-entry.component.ts` with:

```typescript
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  output,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { timer } from 'rxjs';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideBookmark, lucideImage, lucideX } from '@ng-icons/lucide';
import { HlmButtonDirective as HlmButton } from '@spartan-ng/ui-button-helm';
import { HlmIconDirective as HlmIcon } from '@spartan-ng/ui-icon-helm';
import { TranslatePipe } from '../../core/pipes/translate.pipe';
import { ClipboardEntry } from '../../core/models/clipboard-entry.model';

export interface TimeTranslation {
  key: string;
  params: Record<string, unknown>;
}

@Component({
  selector: 'app-clipboard-entry',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgIcon, HlmIcon, HlmButton, TranslatePipe],
  providers: [provideIcons({ lucideImage, lucideBookmark, lucideX })],
  template: `
    <div
      class="flex items-center gap-2 pl-3.5 pr-3 group transition-colors border-l-2"
      [class.cursor-pointer]="!editMode()"
      [class]="selected() ? 'border-l-brand bg-card' : 'border-l-transparent hover:bg-card/60'"
      (click)="onOuterClick()"
    >
      @if (editMode()) {
        <div class="flex-1 min-w-0 py-2" (click)="$event.stopPropagation()">
          <textarea
            #editTextarea
            class="w-full bg-muted/50 text-[13px] text-foreground rounded-md px-2 py-1.5 resize-none outline-none focus:ring-1 focus:ring-brand/50 min-h-[60px]"
            rows="3"
            [value]="entry().content ?? ''"
            (keydown)="onTextareaKeyDown($event)"
          ></textarea>
          <p class="text-[11px] text-muted-foreground mt-1">{{ 'CLIPBOARD.EDIT_HINT' | translate }}</p>
        </div>
      } @else {
        @if (entry().kind === 'image') {
          <div class="shrink-0 w-8 h-8 rounded-md overflow-hidden bg-muted flex items-center justify-center my-2">
            @if (entry().thumbnail) {
              <img [src]="entry().thumbnail!" alt="Clipboard image" class="w-full h-full object-cover" />
            } @else {
              <ng-icon hlm size="sm" name="lucideImage" class="text-muted-foreground" />
            }
          </div>
          <div class="flex-1 min-w-0 py-2">
            <p class="text-[13px] font-medium text-foreground leading-snug">{{ 'ENTRY.IMAGE' | translate }}</p>
            <p class="text-[11px] text-muted-foreground mt-0.5">
              @if (entry().sourceApp) {
                <span>{{ entry().sourceApp }} · </span>
              }
              @if (imageDimensions()) {
                <span>{{ imageDimensions() }} · </span>
              }
              <span class="tabular-nums">{{ relativeTimeTranslation().key | translate:relativeTimeTranslation().params }}</span>
            </p>
          </div>
        } @else {
          <div class="flex-1 min-w-0 py-2">
            <p class="text-[13px] text-foreground truncate leading-snug">{{ entry().content }}</p>
            <p class="text-[11px] text-muted-foreground mt-0.5">
              @if (entry().sourceApp) {
                <span>{{ entry().sourceApp }} · </span>
              }
              <span class="tabular-nums">{{ relativeTimeTranslation().key | translate:relativeTimeTranslation().params }}</span>
            </p>
          </div>
        }

        <div class="flex items-center gap-1 shrink-0">
          <button
            hlmBtn variant="ghost" size="icon"
            [class]="pinButtonClass()"
            [title]="'ENTRY.TOGGLE_PIN' | translate"
            (click)="$event.stopPropagation(); pin.emit()"
          >
            <ng-icon hlm size="sm" name="lucideBookmark" />
          </button>

          <button
            hlmBtn variant="ghost" size="icon"
            class="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-red-400 hover:bg-red-500/10"
            [class.opacity-100]="selected()"
            [title]="'ENTRY.DELETE' | translate"
            (click)="$event.stopPropagation(); delete.emit()"
          >
            <ng-icon hlm size="sm" name="lucideX" />
          </button>
        </div>
      }
    </div>
  `,
})
export class ClipboardEntryComponent {
  entry    = input.required<ClipboardEntry>();
  selected = input(false);
  editMode = input(false);

  select      = output<void>();
  delete      = output<void>();
  pin         = output<void>();
  editConfirm = output<string>();
  editCancel  = output<void>();

  private textareaRef = viewChild<ElementRef<HTMLTextAreaElement>>('editTextarea');
  private injector    = inject(Injector);
  private tick        = toSignal(timer(0, 30_000));

  constructor() {
    effect(() => {
      if (this.editMode()) {
        afterNextRender(() => {
          const el = this.textareaRef()?.nativeElement;
          if (el) { el.focus(); el.select(); }
        }, { injector: this.injector });
      }
    });
  }

  protected onOuterClick(): void {
    if (!this.editMode()) {
      this.select.emit();
    }
  }

  protected onTextareaKeyDown(event: KeyboardEvent): void {
    const action = resolveTextareaKey(event.key, event.shiftKey);
    if (!action) return;
    event.preventDefault();
    event.stopPropagation();
    if (action === 'cancel') {
      this.editCancel.emit();
    } else {
      this.editConfirm.emit(this.textareaRef()?.nativeElement?.value ?? '');
    }
  }

  relativeTimeTranslation = computed<TimeTranslation>(() => {
    this.tick();
    return buildRelativeTimeTranslation(this.entry().lastUsedAt);
  });

  imageDimensions = computed(() => {
    const e = this.entry();
    if (e.width && e.height) return `${e.width} × ${e.height}`;
    return null;
  });

  protected pinButtonClass = computed(() => {
    const alwaysVisible = this.selected() || this.entry().pinned;
    const visibility = alwaysVisible ? 'opacity-100' : 'opacity-0 group-hover:opacity-100';
    const color = this.entry().pinned
      ? 'text-brand-400 hover:text-brand-300'
      : 'text-muted-foreground hover:text-foreground';
    return `${visibility} transition-opacity ${color}`;
  });
}

export function resolveTextareaKey(key: string, shiftKey: boolean): 'confirm' | 'cancel' | null {
  if (key === 'Escape' || key === 'Tab') return 'cancel';
  if (key === 'Enter' && !shiftKey) return 'confirm';
  return null;
}

export function buildRelativeTimeTranslation(unixSeconds: number): TimeTranslation {
  const diffMs = Date.now() - unixSeconds * 1000;
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return { key: 'ENTRY.TIME_JUST_NOW', params: {} };
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return { key: 'ENTRY.TIME_MINUTES', params: { n: diffMin } };
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return { key: 'ENTRY.TIME_HOURS', params: { n: diffHr } };
  return { key: 'ENTRY.TIME_DAYS', params: { n: Math.floor(diffHr / 24) } };
}
```

Note: `buildRelativeTimeTranslation` is now exported so it can be unit-tested. The `inject` import was moved to the top-level imports (not inside the class). The `import { inject }` at the bottom of the file in the original was a re-export trick — move it to the top imports block instead:

Actually the import needs to be at the top. The correct final structure has `inject` imported in the first `import` block:

```typescript
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  output,
  viewChild,
} from '@angular/core';
```

Remove the `// Re-export inject for template usage` comment and standalone `import { inject }` line.

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx ng test --include="**/clipboard-entry.component.spec.ts" --watch=false 2>&1 | tail -20
```

Expected: all tests pass including the new `buildRelativeTimeTranslation` tests.

- [ ] **Step 5: Run full TypeScript check**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/app/features/clipboard-list/clipboard-entry.component.ts src/app/features/clipboard-list/clipboard-entry.component.spec.ts
git commit -m "feat: display source app alongside timestamp in clipboard entry footer"
```

---

## Task 8: End-to-end build verification

- [ ] **Step 1: Run full Rust test suite**

```bash
cd src-tauri && cargo test 2>&1 | tail -20
```

Expected: all tests pass.

- [ ] **Step 2: Run full frontend test suite**

```bash
npx ng test --watch=false 2>&1 | tail -20
```

Expected: all tests pass.

- [ ] **Step 3: Build the full app**

```bash
npx tauri build 2>&1 | tail -20
```

Expected: build succeeds, no errors.

- [ ] **Step 4: Final commit (if any loose files)**

```bash
git status
```

If clean, done. If any stray changes, add and commit them.
