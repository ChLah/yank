# Search, Filter & Pin — Design Spec

**Date:** 2026-04-23
**Feature:** Add type-to-search, type filtering, and pinned-favorites to the clipboard-list popup.

---

## Overview

Three related UX additions to the 420×520 px frameless popup:

1. **Search** — type any character to instantly filter the visible list; animated slide-in bar.
2. **Type filter** — pill buttons (All / Text / Image) narrow by entry kind.
3. **Pinning** — users mark favorite entries so they persist across history pruning and are always one tab away.

All filtering is client-side (entries are fully loaded on popup open).

---

## Layout

```
┌─────────────────────────────────────────┐  44px  header (unchanged)
│ 📋 Clipboard [n]              ⚙          │
├─────────────────────────────────────────┤  34px  tab + filter row
│ Recent · Pinned        All  Text  Image │
├─────────────────────────────────────────┤  0→36px animated (type-to-search)
│ 🔍 filter...                        ✕  │
├─────────────────────────────────────────┤  flex-1 scrollable
│  entry row                    3m ago 📌✕│
│  ...                                    │
├─────────────────────────────────────────┤  36px  footer (updated)
│ ↑↓ navigate  ↵ paste  ⌫ del  P pin     │
│                         type search Esc │
└─────────────────────────────────────────┘
```

---

## Backend Changes

### 1. DB Migration

Additive `ALTER TABLE` — no data loss, safe on first launch with existing DB:

```sql
ALTER TABLE entries ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0;
```

Run inside `run_migrations()` in `sqlite_store.rs`. SQLite does not support `ADD COLUMN IF NOT EXISTS`, so guard it by reading `PRAGMA table_info(entries)` and only executing the ALTER when the `pinned` column is absent:

```rust
let has_pinned: bool = conn
    .prepare("PRAGMA table_info(entries)")?
    .query_map([], |row| row.get::<_, String>(1))?
    .any(|name| name.unwrap_or_default() == "pinned");
if !has_pinned {
    conn.execute_batch(
        "ALTER TABLE entries ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0;"
    )?;
}
```

### 2. Rust Model (`models.rs`)

Add `pinned: bool` to `ClipboardEntry`. Serde maps it to `"pinned"` in camelCase output via the existing `#[serde(rename_all = "camelCase")]`.

### 3. New Tauri Command — `toggle_pin`

```rust
#[tauri::command]
pub fn toggle_pin(id: i64, store: StoreState) -> Result<bool, String>
```

Flips `pinned` for the given entry and returns the new value. Single command, no separate pin/unpin.

Implementation in `SqliteStore`:

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

Register in `lib.rs` alongside existing commands.

### 4. Pruning Guard (`sqlite_store.rs` — `save_entry`)

Pinned entries must never be auto-deleted when `max_entries` is exceeded. Update the pruning query to exclude pinned rows:

```sql
-- before
DELETE FROM entries WHERE id IN (
    SELECT id FROM entries ORDER BY last_used_at DESC LIMIT -1 OFFSET ?1
)

-- after
DELETE FROM entries WHERE id IN (
    SELECT id FROM entries WHERE pinned = 0 ORDER BY last_used_at DESC LIMIT -1 OFFSET ?1
)
```

`max_entries` now caps unpinned history only. Pinned entries accumulate beyond the cap and are removed only by explicit user action (delete or unpin).

### 5. `get_entries` query

Add `pinned` to the SELECT as the last column (position index 9) in `get_all_entries`:

```sql
SELECT id, kind, content, thumbnail, width, height, hash, created_at, last_used_at, pinned
FROM entries ORDER BY last_used_at DESC
```

Map it in the `query_map` closure: `pinned: row.get::<_, i64>(9)? != 0`. Pinned entries do not need special ordering at the DB level — tab separation handles presentation in the frontend.

---

## Angular Changes

### `clipboard-entry.model.ts`

Add `pinned: boolean` to the `ClipboardEntry` interface.

### `tauri-bridge.service.ts`

Add:
```ts
togglePin(id: number): Promise<boolean> {
  return invoke<boolean>('toggle_pin', { id });
}
```

### `clipboard.service.ts`

Add:
```ts
async togglePin(id: number): Promise<void> {
  await this.bridge.togglePin(id);
  this.entries.reload();
}
```

### `clipboard-list.component.ts`

**New signals:**
```ts
activeTab    = signal<'recent' | 'pinned'>('recent');
activeFilter = signal<'all' | 'text' | 'image'>('all');
searchQuery  = signal('');
isSearching  = signal(false);
```

**Derived list:**
```ts
filteredEntries = computed(() => {
  let list = this.clipboard.entries.value() ?? [];
  if (this.activeTab() === 'pinned')        list = list.filter(e => e.pinned);
  if (this.activeFilter() !== 'all')        list = list.filter(e => e.kind === this.activeFilter());
  const q = this.searchQuery().toLowerCase().trim();
  if (q) list = list.filter(e => e.content?.toLowerCase().includes(q));
  return list;
});
```

**Tab row:** Rendered in the template between header and search bar. Tab underline style (indigo active indicator). Filter pills on the right (All/Text/Image), small rounded toggles.

**Search bar animation:** CSS `max-height` + `opacity` transition. A signal-driven class (`searching`) toggles the bar from `max-h-0 opacity-0` to `max-h-10 opacity-100`. Transition duration ~150ms ease-out.

**`onKeyDown` updates:**
- Any printable single character (length === 1, no modifier keys) → set `isSearching(true)`, append character to `searchQuery`, focus search `<input>`.
- `Escape` → if searching: clear query and collapse; else: hide popup (existing behaviour).
- `P` key → only when `!isSearching()`: call `togglePin` on the selected entry.
- Arrow keys and Enter continue to work normally; when `isSearching()` is true, arrow keys still navigate the list, Enter pastes.

**Selected index reset:** When `activeTab`, `activeFilter`, or `searchQuery` changes, reset `selectedIndex` to 0.

**Footer:** Add two new hints — `P pin` and `type search` — to the existing hint row. Reflow so hints wrap neatly at 420px.

**Empty state — Pinned tab:** "No pinned items yet — select an entry and press P."

### `clipboard-entry.component.ts`

**New inputs/outputs:**
```ts
pinned = input(false);
pin    = output<void>();
```

**Pin button:** Sits between the timestamp and delete button. Same opacity-on-hover/selected behaviour as delete. Icon: filled pin (indigo) when `pinned()` is true, outline pin (zinc-600) when false. Click emits `pin` and stops propagation (does not trigger `select`).

---

## Keyboard Map (updated)

| Key | Action |
|-----|--------|
| `↑` / `↓` | Navigate list |
| `↵` | Paste selected entry |
| `⌫` | Delete selected entry |
| `P` | Toggle pin on selected entry (only when not searching) |
| Any printable char | Open search bar, begin filtering |
| `Esc` (searching) | Clear search & collapse bar |
| `Esc` (not searching) | Close popup |

---

## Constraints & Edge Cases

- **Images in search:** Image entries have no text content, so the search query only matches text entries. Image entries are always shown when the query is empty or when the Image filter is active.
- **Tab badge:** The `Pinned` tab shows a count badge when at least one entry is pinned, so users know pins exist without switching.
- **Pruning with all-pinned edge case:** If every entry is pinned, the pruning query deletes nothing and the history grows beyond `max_entries`. This is acceptable — the user explicitly protected those entries.
- **Migration safety:** The `ALTER TABLE` must be guarded. Use `PRAGMA table_info(entries)` to check whether the `pinned` column already exists before running the ALTER.
