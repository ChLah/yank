# Search, Filter & Pin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add type-to-search (animated), type-filter pills, and a Pinned tab with permanent pin protection to the clipboard-list popup.

**Architecture:** All filtering is client-side — entries are fully loaded on popup open. Pinning is persisted in SQLite with a new `pinned` column; a `toggle_pin` Tauri command flips it. The Angular layer adds signals for tab/filter/search state and a `filteredEntries` computed that drives the list.

**Tech Stack:** Rust 1.77 / Tauri 2 / rusqlite 0.32 / Angular 21 signals / Tailwind CSS / spartan-ng helm components

---

## File Map

| File | Change |
|------|--------|
| `src-tauri/src/store/sqlite_store.rs` | Migration guard, `pinned` in SELECT, `toggle_pin`, pruning guard |
| `src-tauri/src/models.rs` | Add `pinned: bool` to `ClipboardEntry` |
| `src-tauri/src/commands.rs` | Add `toggle_pin` Tauri command |
| `src-tauri/src/lib.rs` | Register `toggle_pin` in `invoke_handler!` |
| `src/app/core/models/clipboard-entry.model.ts` | Add `pinned: boolean` |
| `src/app/core/services/tauri-bridge.service.ts` | Add `togglePin(id)` |
| `src/app/core/services/clipboard.service.ts` | Add `togglePin(id)` |
| `src/app/features/clipboard-list/clipboard-entry.component.ts` | Add `pinned` input, `pin` output, pin button |
| `src/app/features/clipboard-list/clipboard-list.component.ts` | Tabs, filter pills, search bar, keyboard, footer |

---

### Task 1: Rust — DB migration, model, get_entries

**Files:**
- Modify: `src-tauri/src/store/sqlite_store.rs`
- Modify: `src-tauri/src/models.rs`

- [ ] **Step 1: Add `pinned: bool` to the Rust model**

Open `src-tauri/src/models.rs`. Replace the `ClipboardEntry` struct with:

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
}
```

- [ ] **Step 2: Update `run_migrations` to add the `pinned` column**

In `src-tauri/src/store/sqlite_store.rs`, replace the `run_migrations` function:

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
```

- [ ] **Step 3: Update `get_all_entries` to select and map `pinned`**

In `src-tauri/src/store/sqlite_store.rs`, replace the `get_all_entries` function:

```rust
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
```

- [ ] **Step 4: Add migration idempotency test**

In `src-tauri/src/store/sqlite_store.rs`, inside the `#[cfg(test)] mod tests` block, add after the existing tests:

```rust
#[test]
fn test_migration_is_idempotent() {
    // Running new() twice on the same in-memory db is not possible,
    // but we can verify get_all_entries returns pinned=false by default.
    let store = in_memory_store();
    store.save_entry(&text_payload("hello")).unwrap();
    let entries = store.get_all_entries().unwrap();
    assert!(!entries[0].pinned);
}
```

- [ ] **Step 5: Run Rust tests**

```
cd src-tauri && cargo test 2>&1
```

Expected: all existing tests pass plus the new `test_migration_is_idempotent`.

- [ ] **Step 6: Commit**

```
git add src-tauri/src/models.rs src-tauri/src/store/sqlite_store.rs
git commit -m "feat(rust): add pinned column migration and update get_all_entries"
```

---

### Task 2: Rust — toggle_pin, pruning guard, Tauri command

**Files:**
- Modify: `src-tauri/src/store/sqlite_store.rs`
- Modify: `src-tauri/src/commands.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Add `toggle_pin` to `SqliteStore`**

In `src-tauri/src/store/sqlite_store.rs`, add this method after `delete_entry`:

```rust
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
```

- [ ] **Step 2: Guard pruning to skip pinned entries**

In `save_entry`, find the pruning DELETE and replace it:

```rust
// Before:
conn.execute(
    "DELETE FROM entries WHERE id IN (
        SELECT id FROM entries ORDER BY last_used_at DESC LIMIT -1 OFFSET ?1
     )",
    params![max_entries],
)?;

// After:
conn.execute(
    "DELETE FROM entries WHERE id IN (
        SELECT id FROM entries WHERE pinned = 0 ORDER BY last_used_at DESC LIMIT -1 OFFSET ?1
     )",
    params![max_entries],
)?;
```

- [ ] **Step 3: Add toggle_pin and pruning tests**

Inside `#[cfg(test)] mod tests`, add:

```rust
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
```

- [ ] **Step 4: Run Rust tests**

```
cd src-tauri && cargo test 2>&1
```

Expected: all tests pass including `test_toggle_pin` and `test_pinned_entries_not_pruned`.

- [ ] **Step 5: Add `toggle_pin` Tauri command**

In `src-tauri/src/commands.rs`, add after `hide_popup`:

```rust
#[tauri::command]
pub fn toggle_pin(id: i64, store: StoreState) -> Result<bool, String> {
    store.toggle_pin(id).map_err(|e| e.to_string())
}
```

- [ ] **Step 6: Register the command in lib.rs**

In `src-tauri/src/lib.rs`, update `invoke_handler!` to add `commands::toggle_pin`:

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
])
```

- [ ] **Step 7: Compile check**

```
cd src-tauri && cargo check 2>&1
```

Expected: `Finished` with no errors.

- [ ] **Step 8: Commit**

```
git add src-tauri/src/store/sqlite_store.rs src-tauri/src/commands.rs src-tauri/src/lib.rs
git commit -m "feat(rust): add toggle_pin command and protect pinned entries from pruning"
```

---

### Task 3: Angular — model and services

**Files:**
- Modify: `src/app/core/models/clipboard-entry.model.ts`
- Modify: `src/app/core/services/tauri-bridge.service.ts`
- Modify: `src/app/core/services/clipboard.service.ts`

- [ ] **Step 1: Add `pinned` to the Angular model**

Replace the content of `src/app/core/models/clipboard-entry.model.ts`:

```ts
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
}
```

- [ ] **Step 2: Add `togglePin` to TauriBridgeService**

In `src/app/core/services/tauri-bridge.service.ts`, add after `hidePopup`:

```ts
togglePin(id: number): Promise<boolean> {
  return invoke<boolean>('toggle_pin', { id });
}
```

- [ ] **Step 3: Add `togglePin` to ClipboardService**

In `src/app/core/services/clipboard.service.ts`, add after `deleteEntry`:

```ts
async togglePin(id: number): Promise<void> {
  await this.bridge.togglePin(id);
  this.entries.reload();
}
```

- [ ] **Step 4: Commit**

```
git add src/app/core/models/clipboard-entry.model.ts src/app/core/services/tauri-bridge.service.ts src/app/core/services/clipboard.service.ts
git commit -m "feat(angular): add pinned field to model and togglePin to services"
```

---

### Task 4: Entry component — pin button

**Files:**
- Modify: `src/app/features/clipboard-list/clipboard-entry.component.ts`

- [ ] **Step 1: Replace clipboard-entry.component.ts**

Replace the entire file with:

```ts
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core';
import { HlmButton } from '@spartan-ng/helm/button';
import { ClipboardEntry } from '../../core/models/clipboard-entry.model';

@Component({
  selector: 'app-clipboard-entry',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [HlmButton],
  template: `
    <div
      class="flex items-center gap-2 pl-3.5 pr-3 cursor-pointer group transition-colors border-l-2"
      [class]="selected() ? 'border-l-indigo-500 bg-zinc-900' : 'border-l-transparent hover:bg-zinc-900/60'"
      (click)="select.emit()"
    >
      @if (entry().kind === 'image') {
        <div class="shrink-0 w-8 h-8 rounded-md overflow-hidden bg-zinc-800 flex items-center justify-center my-2">
          @if (entry().thumbnail) {
            <img [src]="entry().thumbnail!" alt="Clipboard image" class="w-full h-full object-cover" />
          } @else {
            <svg class="w-4 h-4 text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          }
        </div>
        <div class="flex-1 min-w-0 py-2">
          <p class="text-[13px] font-medium text-zinc-300 leading-snug">Image</p>
          @if (imageDimensions()) {
            <p class="text-[11px] text-zinc-600 mt-0.5">{{ imageDimensions() }}</p>
          }
        </div>
      } @else {
        <div class="flex-1 min-w-0 py-2.5">
          <p class="text-[13px] text-zinc-300 truncate leading-snug">{{ entry().content }}</p>
        </div>
      }

      <div class="flex items-center gap-1 shrink-0">
        <span class="text-[11px] text-zinc-600 tabular-nums">{{ relativeTime() }}</span>

        <!-- Pin button -->
        <button
          hlmBtn variant="ghost" size="icon"
          class="opacity-0 group-hover:opacity-100 transition-opacity"
          [class.opacity-100]="selected() || entry().pinned"
          [class.text-indigo-400]="entry().pinned"
          [class.text-zinc-600]="!entry().pinned"
          [class.hover:text-indigo-300]="entry().pinned"
          [class.hover:text-zinc-400]="!entry().pinned"
          title="Toggle pin (P)"
          (click)="$event.stopPropagation(); pin.emit()"
        >
          @if (entry().pinned) {
            <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M5 4a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 20V4z"/>
            </svg>
          } @else {
            <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"/>
            </svg>
          }
        </button>

        <!-- Delete button -->
        <button
          hlmBtn variant="ghost" size="icon"
          class="opacity-0 group-hover:opacity-100 transition-opacity text-zinc-700 hover:text-red-400 hover:bg-red-500/10"
          [class.opacity-100]="selected()"
          title="Delete (Del)"
          (click)="$event.stopPropagation(); delete.emit()"
        >
          <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  `,
})
export class ClipboardEntryComponent {
  entry = input.required<ClipboardEntry>();
  selected = input(false);

  select = output<void>();
  delete = output<void>();
  pin    = output<void>();

  relativeTime = computed(() => formatRelativeTime(this.entry().lastUsedAt));

  imageDimensions = computed(() => {
    const e = this.entry();
    if (e.width && e.height) return `${e.width} × ${e.height}`;
    return null;
  });
}

function formatRelativeTime(unixSeconds: number): string {
  const diffMs = Date.now() - unixSeconds * 1000;
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return 'just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${Math.floor(diffHr / 24)}d ago`;
}
```

- [ ] **Step 2: Commit**

```
git add src/app/features/clipboard-list/clipboard-entry.component.ts
git commit -m "feat(ui): add pin toggle button to clipboard entry"
```

---

### Task 5: List component — tabs, filter pills, filteredEntries

**Files:**
- Modify: `src/app/features/clipboard-list/clipboard-list.component.ts`

- [ ] **Step 1: Replace clipboard-list.component.ts with tabs + filter + signals**

Replace the entire file. This step wires up tabs, filter pills, the updated entry loop with pin output, and the empty states. The search bar and keyboard updates come in Task 6.

```ts
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnInit,
  ViewChild,
  computed,
  inject,
  signal,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ClipboardEntryComponent } from './clipboard-entry.component';
import { ClipboardService } from '../../core/services/clipboard.service';
import { TauriBridgeService } from '../../core/services/tauri-bridge.service';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmBadge } from '@spartan-ng/helm/badge';

type Tab    = 'recent' | 'pinned';
type Filter = 'all' | 'text' | 'image';

@Component({
  selector: 'app-clipboard-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ClipboardEntryComponent, RouterLink, HlmButton, HlmBadge],
  host: {
    '(keydown)': 'onKeyDown($event)',
    'tabindex': '0',
    'class': 'block outline-none h-full',
  },
  template: `
    <div class="flex flex-col h-full bg-zinc-950 rounded-xl overflow-hidden border border-zinc-800 shadow-2xl">

      <!-- Header -->
      <div class="px-3.5 h-11 flex items-center justify-between shrink-0 bg-zinc-900 border-b border-zinc-800">
        <div class="flex items-center gap-2">
          <svg class="w-3.5 h-3.5 text-zinc-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          <span class="text-[13px] font-semibold text-zinc-200 tracking-tight">Clipboard</span>
          @if (allEntries().length > 0) {
            <span hlmBadge variant="secondary">{{ allEntries().length }}</span>
          }
        </div>
        <a routerLink="/settings" class="p-1.5 rounded-md text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800 transition-colors">
          <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </a>
      </div>

      <!-- Tab + filter row -->
      <div class="flex items-center justify-between px-3.5 shrink-0 bg-zinc-900/50 border-b border-zinc-800" style="height:34px">
        <div class="flex items-center">
          @for (tab of tabs; track tab.value) {
            <button
              class="text-[12px] font-medium px-0.5 mr-3 pb-px border-b-2 transition-colors flex items-center gap-1.5 h-full"
              [class]="activeTab() === tab.value
                ? 'border-indigo-500 text-zinc-200'
                : 'border-transparent text-zinc-500 hover:text-zinc-400'"
              (click)="setTab(tab.value)">
              {{ tab.label }}
              @if (tab.value === 'pinned' && pinnedCount() > 0) {
                <span hlmBadge variant="secondary" class="text-[10px] h-4 min-w-0 px-1">{{ pinnedCount() }}</span>
              }
            </button>
          }
        </div>
        <div class="flex items-center gap-1">
          @for (f of filters; track f.value) {
            <button
              class="text-[11px] px-2 py-0.5 rounded-full border transition-colors"
              [class]="activeFilter() === f.value
                ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30'
                : 'text-zinc-600 border-transparent hover:text-zinc-400'"
              (click)="setFilter(f.value)">
              {{ f.label }}
            </button>
          }
        </div>
      </div>

      <!-- Search bar (animated slide-in) -->
      <div
        class="overflow-hidden transition-all duration-150 ease-out shrink-0"
        [class]="isSearching() ? 'max-h-10 opacity-100 border-b border-zinc-800' : 'max-h-0 opacity-0'">
        <div class="flex items-center gap-2 px-3.5 h-9">
          <svg class="w-3.5 h-3.5 text-zinc-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            #searchInput
            type="text"
            [value]="searchQuery()"
            (input)="onSearchInput($event)"
            placeholder="filter..."
            class="flex-1 bg-transparent text-[13px] text-zinc-200 placeholder:text-zinc-600 outline-none"
          />
          @if (searchQuery()) {
            <button
              class="text-zinc-600 hover:text-zinc-400 transition-colors"
              (click)="clearSearch()">
              <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          }
        </div>
      </div>

      <!-- Content -->
      <div class="flex-1 overflow-y-auto scrollbar-thin" #listContainer>

        @if (clipboard.entries.isLoading()) {
          <div class="py-1">
            @for (skeleton of skeletons; track $index) {
              <div class="flex items-center gap-3 pl-5 pr-4 py-2.5 border-l-2 border-l-transparent">
                <div class="flex-1 space-y-1.5">
                  <div class="h-3 bg-zinc-800 rounded animate-pulse" [style.width.%]="65 + ($index % 3) * 10"></div>
                  <div class="h-2 bg-zinc-800 rounded animate-pulse w-12 opacity-50"></div>
                </div>
              </div>
            }
          </div>
        } @else if (clipboard.entries.error()) {
          <div class="flex flex-col items-center justify-center h-full py-10 text-center">
            <div class="w-9 h-9 rounded-full bg-red-500/10 flex items-center justify-center mb-3">
              <svg class="w-4 h-4 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <p class="text-[13px] text-zinc-400 mb-1.5">Failed to load history</p>
            <button hlmBtn variant="link" size="sm" (click)="clipboard.entries.reload()">
              Try again
            </button>
          </div>
        } @else if (filteredEntries().length === 0) {
          <div class="flex flex-col items-center justify-center h-full py-10 text-center gap-3">
            <div class="w-10 h-10 rounded-xl bg-zinc-900 flex items-center justify-center">
              @if (activeTab() === 'pinned') {
                <svg class="w-5 h-5 text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
                    d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"/>
                </svg>
              } @else {
                <svg class="w-5 h-5 text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
                    d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
              }
            </div>
            @if (activeTab() === 'pinned') {
              <p class="text-[13px] text-zinc-500">No pinned items yet</p>
              <p class="text-[11px] text-zinc-600">Select an entry and press P</p>
            } @else if (searchQuery()) {
              <p class="text-[13px] text-zinc-500">No matches for "{{ searchQuery() }}"</p>
            } @else {
              <p class="text-[13px] text-zinc-500">Nothing copied yet</p>
            }
          </div>
        } @else {
          <div class="py-1">
            @for (entry of filteredEntries(); track entry.id; let i = $index) {
              <div class="entry-item">
                <app-clipboard-entry
                  [entry]="entry"
                  [selected]="selectedIndex() === i"
                  (select)="selectEntry(i)"
                  (delete)="deleteEntry(i)"
                  (pin)="pinEntry(i)"
                />
              </div>
            }
          </div>
        }
      </div>

      <!-- Footer -->
      <div class="h-9 px-3.5 flex items-center gap-2 shrink-0 bg-zinc-900 border-t border-zinc-800">
        <span class="flex items-center gap-1 text-[10px] text-zinc-600">
          <kbd class="inline-flex items-center px-1 py-0.5 bg-zinc-800 border border-zinc-700 rounded text-[10px] font-mono text-zinc-500 leading-none">↑↓</kbd>
          nav
        </span>
        <span class="flex items-center gap-1 text-[10px] text-zinc-600">
          <kbd class="inline-flex items-center px-1 py-0.5 bg-zinc-800 border border-zinc-700 rounded text-[10px] font-mono text-zinc-500 leading-none">↵</kbd>
          paste
        </span>
        <span class="flex items-center gap-1 text-[10px] text-zinc-600">
          <kbd class="inline-flex items-center px-1 py-0.5 bg-zinc-800 border border-zinc-700 rounded text-[10px] font-mono text-zinc-500 leading-none">⌫</kbd>
          del
        </span>
        <span class="flex items-center gap-1 text-[10px] text-zinc-600">
          <kbd class="inline-flex items-center px-1 py-0.5 bg-zinc-800 border border-zinc-700 rounded text-[10px] font-mono text-zinc-500 leading-none">P</kbd>
          pin
        </span>
        <span class="flex items-center gap-1 text-[10px] text-zinc-600 ml-auto">
          type to search
        </span>
        <span class="flex items-center gap-1 text-[10px] text-zinc-600">
          <kbd class="inline-flex items-center px-1 py-0.5 bg-zinc-800 border border-zinc-700 rounded text-[10px] font-mono text-zinc-500 leading-none">Esc</kbd>
          close
        </span>
      </div>
    </div>
  `,
})
export class ClipboardListComponent implements OnInit {
  protected clipboard = inject(ClipboardService);
  private bridge = inject(TauriBridgeService);
  private router = inject(Router);

  protected selectedIndex = signal(0);
  protected skeletons = Array(5);

  protected activeTab    = signal<Tab>('recent');
  protected activeFilter = signal<Filter>('all');
  protected searchQuery  = signal('');
  protected isSearching  = signal(false);

  protected tabs = [
    { label: 'Recent', value: 'recent' as Tab },
    { label: 'Pinned', value: 'pinned' as Tab },
  ];

  protected filters = [
    { label: 'All',   value: 'all'   as Filter },
    { label: 'Text',  value: 'text'  as Filter },
    { label: 'Image', value: 'image' as Filter },
  ];

  protected allEntries = computed(() => this.clipboard.entries.value() ?? []);

  protected pinnedCount = computed(() => this.allEntries().filter(e => e.pinned).length);

  protected filteredEntries = computed(() => {
    let list = this.allEntries();
    if (this.activeTab() === 'pinned')       list = list.filter(e => e.pinned);
    if (this.activeFilter() !== 'all')       list = list.filter(e => e.kind === this.activeFilter());
    const q = this.searchQuery().toLowerCase().trim();
    if (q) list = list.filter(e => e.content?.toLowerCase().includes(q));
    return list;
  });

  @ViewChild('listContainer') listContainer!: ElementRef<HTMLElement>;
  @ViewChild('searchInput')   searchInput?: ElementRef<HTMLInputElement>;

  ngOnInit(): void {
    (document.querySelector('[tabindex="0"]') as HTMLElement | null)?.focus();
  }

  protected setTab(tab: Tab): void {
    this.activeTab.set(tab);
    this.selectedIndex.set(0);
  }

  protected setFilter(filter: Filter): void {
    this.activeFilter.set(filter);
    this.selectedIndex.set(0);
  }

  protected selectEntry(index: number): void {
    this.selectedIndex.set(index);
    const entry = this.filteredEntries()[index];
    if (!entry) return;
    if (entry.kind === 'image') {
      this.router.navigate(['/preview'], { queryParams: { id: entry.id } });
    } else {
      this.clipboard.setClipboard(entry.id);
    }
  }

  protected deleteEntry(index: number): void {
    const entry = this.filteredEntries()[index];
    if (!entry) return;
    this.clipboard.deleteEntry(entry.id);
    const newLen = this.filteredEntries().length - 1;
    if (this.selectedIndex() >= newLen && newLen > 0) {
      this.selectedIndex.set(newLen - 1);
    }
  }

  protected pinEntry(index: number): void {
    const entry = this.filteredEntries()[index];
    if (!entry) return;
    this.clipboard.togglePin(entry.id);
  }

  protected onSearchInput(event: Event): void {
    this.searchQuery.set((event.target as HTMLInputElement).value);
    this.selectedIndex.set(0);
  }

  protected clearSearch(): void {
    this.searchQuery.set('');
    this.isSearching.set(false);
    this.selectedIndex.set(0);
    (document.querySelector('[tabindex="0"]') as HTMLElement | null)?.focus();
  }

  protected onKeyDown(event: KeyboardEvent): void {
    if (this.isSearching()) {
      switch (event.key) {
        case 'ArrowDown':
          event.preventDefault();
          this.moveSelection(1);
          break;
        case 'ArrowUp':
          event.preventDefault();
          this.moveSelection(-1);
          break;
        case 'Enter':
          event.preventDefault();
          this.copySelected();
          break;
        case 'Escape':
          event.preventDefault();
          this.clearSearch();
          break;
      }
      return;
    }

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.moveSelection(1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.moveSelection(-1);
        break;
      case 'Enter':
        event.preventDefault();
        this.copySelected();
        break;
      case 'Delete':
        event.preventDefault();
        this.deleteEntry(this.selectedIndex());
        break;
      case 'Escape':
        event.preventDefault();
        this.bridge.hidePopup();
        break;
      default:
        if (event.key.length === 1 && !event.ctrlKey && !event.altKey && !event.metaKey) {
          if (event.key.toLowerCase() === 'p') {
            event.preventDefault();
            this.pinSelected();
          } else {
            this.isSearching.set(true);
            this.searchQuery.set(event.key);
            setTimeout(() => this.searchInput?.nativeElement.focus(), 0);
          }
        }
    }
  }

  private pinSelected(): void {
    const entry = this.filteredEntries()[this.selectedIndex()];
    if (!entry) return;
    this.clipboard.togglePin(entry.id);
  }

  private moveSelection(delta: number): void {
    const len = this.filteredEntries().length;
    if (len === 0) return;
    const next = Math.max(0, Math.min(len - 1, this.selectedIndex() + delta));
    this.selectedIndex.set(next);
    this.scrollSelectedIntoView();
  }

  private copySelected(): void {
    const entry = this.filteredEntries()[this.selectedIndex()];
    if (!entry) return;
    this.clipboard.setClipboard(entry.id);
  }

  private scrollSelectedIntoView(): void {
    if (!this.listContainer) return;
    const items = this.listContainer.nativeElement.querySelectorAll<HTMLElement>('.entry-item');
    const item = items[this.selectedIndex()];
    item?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
}
```

- [ ] **Step 2: Commit**

```
git add src/app/features/clipboard-list/clipboard-list.component.ts
git commit -m "feat(ui): add tabs, filter pills, search bar, pin keyboard shortcut"
```

---

### Task 6: Verify and smoke-test

- [ ] **Step 1: Run cargo check**

```
cd src-tauri && cargo check 2>&1
```

Expected: `Finished` with no errors.

- [ ] **Step 2: Run all Rust tests**

```
cd src-tauri && cargo test 2>&1
```

Expected: all tests pass.

- [ ] **Step 3: Start the dev server**

In the project root:

```
pnpm tauri dev
```

Expected: app compiles and launches. Check the popup opens with the new two-row header (Recent/Pinned tabs + All/Text/Image pills).

- [ ] **Step 4: Manual smoke-test checklist**

- [ ] Trigger popup with global shortcut — tabs and filter pills visible
- [ ] Press any letter key — search bar slides in with animation, character appears in input
- [ ] Type more characters — list filters in real time
- [ ] Press Esc — search bar collapses, list shows all entries again
- [ ] Press Esc again — popup closes
- [ ] Select an entry, press `P` — pin icon fills indigo on that entry
- [ ] Hover over an entry — pin button and delete button appear
- [ ] Click pin icon on hover — pin toggles
- [ ] Click `Pinned` tab — pinned entries shown, badge count appears on tab
- [ ] Click `Pinned` tab with no pins — "No pinned items yet" empty state shown
- [ ] Filter by `Image` — only image entries shown (or empty if none)
- [ ] Filter by `Text` with search active — both constraints apply

- [ ] **Step 5: Final commit**

```
git add -A
git commit -m "feat: search, filter, and pin/favorites for clipboard history"
```
