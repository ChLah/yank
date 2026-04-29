# Snippet Folders Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Organize snippets into named, collapsible folder sections within the existing Snippets tab, with inline folder management and drag-and-drop for both folders and cross-folder snippet moves.

**Architecture:** Add a `snippet_folders` table and `folder_id` column to `snippets` via a migration. The backend exposes CRUD + reorder commands for folders and a `move_snippet_to_folder` command. The frontend renders folder sections in `ClipboardListComponent` using CDK drag-drop with connected per-folder drop lists; a new `SnippetFolderHeaderComponent` handles collapse/expand, inline rename, and delete confirmation.

**Tech Stack:** Rust/SQLite (rusqlite), Tauri commands, Angular 19 (signals, resource), Angular CDK drag-drop.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `src-tauri/src/models.rs` | Modify | Add `SnippetFolder` struct; add `folder_id` to `Snippet` |
| `src-tauri/src/store/sqlite_store.rs` | Modify | DB migration; folder CRUD + reorder store methods; update snippet methods; update `reorder_snippet` to be folder-scoped |
| `src-tauri/src/commands.rs` | Modify | Expose new Tauri commands; update imports |
| `src-tauri/src/lib.rs` | Modify | Register new commands in `invoke_handler` |
| `src/app/core/models/snippet-folder.model.ts` | Create | `SnippetFolder` TypeScript interface |
| `src/app/core/models/snippet.model.ts` | Modify | Add `folderId: number \| null` |
| `src/app/i18n/translation.interface.ts` | Modify | Add folder keys to `SNIPPETS` section |
| `src/app/i18n/en.ts` | Modify | English folder strings |
| `src/app/i18n/de.ts` | Modify | German folder strings |
| `src/app/core/services/tauri-bridge.service.ts` | Modify | Add folder bridge methods |
| `src/app/core/services/snippets.service.ts` | Modify | Add `folders` resource; folder operations; `moveAndReorderSnippet` |
| `src/app/features/clipboard-list/snippet-folder-header.component.ts` | Create | Folder header row: expand/collapse, inline rename, delete confirmation |
| `src/app/features/clipboard-list/clipboard-list.component.ts` | Modify | Render folder sections; CDK folder/snippet drag-drop; `+ Add folder`; new folder inline create |

---

## Task 1: Rust — DB migration and models

**Files:**
- Modify: `src-tauri/src/models.rs`
- Modify: `src-tauri/src/store/sqlite_store.rs`

- [ ] **Step 1: Add `SnippetFolder` struct and update `Snippet` in `models.rs`**

In `src-tauri/src/models.rs`, after the `Snippet` struct (line 95), add:

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SnippetFolder {
    pub id: i64,
    pub name: String,
    pub sort_order: i64,
}
```

Update the `Snippet` struct (lines 95–103) to add `folder_id`:

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Snippet {
    pub id: i64,
    pub title: String,
    pub content: String,
    pub created_at: i64,
    pub sort_order: i64,
    pub folder_id: Option<i64>,
}
```

- [ ] **Step 2: Add DB migration in `run_migrations()` in `sqlite_store.rs`**

After line 98 (the `CREATE TABLE IF NOT EXISTS snippets` block), inside `run_migrations`, add:

```rust
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
```

- [ ] **Step 3: Update `get_snippets()` to include `folder_id`**

In `sqlite_store.rs`, update `get_snippets()` (around line 471):

```rust
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
```

- [ ] **Step 4: Update `create_snippet()` to include `folder_id: None` in the returned struct**

In `create_snippet()` (around line 489), update the returned `Ok(Snippet { ... })`:

```rust
Ok(Snippet {
    id,
    title: title.to_string(),
    content: content.to_string(),
    created_at: now,
    sort_order,
    folder_id: None,
})
```

- [ ] **Step 5: Update `update_snippet()` SELECT to include `folder_id`**

In `update_snippet()` (around line 511), update the SELECT query and struct construction:

```rust
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
```

- [ ] **Step 6: Verify tests still pass**

Run: `cargo test -p yank-lib 2>&1 | tail -20`

Expected: all existing snippet tests pass (they all use `folder_id = NULL` which still works).

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/models.rs src-tauri/src/store/sqlite_store.rs
git commit -m "feat(rust): add snippet_folders table and folder_id to snippets"
```

---

## Task 2: Rust — Folder CRUD store methods

**Files:**
- Modify: `src-tauri/src/store/sqlite_store.rs`

- [ ] **Step 1: Write failing tests for folder CRUD (append to the `#[cfg(test)]` block)**

At the end of the test block in `sqlite_store.rs`, add:

```rust
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
    // Move a snippet into the folder
    let s = store.create_snippet("Test", "Body").unwrap();
    store.move_snippet_to_folder(s.id, Some(folder.id)).unwrap();
    // Delete the folder
    store.delete_snippet_folder(folder.id).unwrap();
    // Snippet is now in General (folder_id = NULL)
    let snippets = store.get_snippets().unwrap();
    assert_eq!(snippets[0].folder_id, None);
    // Folder is gone
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
    let s3 = store.create_snippet("C", "c").unwrap(); // in General (NULL)
    store.move_snippet_to_folder(s1.id, Some(folder.id)).unwrap();
    store.move_snippet_to_folder(s2.id, Some(folder.id)).unwrap();
    // Reorder within the folder: move s1 to index 1 (after s2)
    store.reorder_snippet(s1.id, 1).unwrap();
    let snippets = store.get_snippets().unwrap();
    let folder_snippets: Vec<_> = snippets.iter().filter(|s| s.folder_id == Some(folder.id)).collect();
    assert_eq!(folder_snippets[0].id, s2.id);
    assert_eq!(folder_snippets[1].id, s1.id);
    // General snippet unaffected
    let general: Vec<_> = snippets.iter().filter(|s| s.folder_id.is_none()).collect();
    assert_eq!(general[0].id, s3.id);
}
```

- [ ] **Step 2: Run tests to confirm they fail**

Run: `cargo test -p yank-lib test_create_and_get_snippet_folders 2>&1 | tail -10`

Expected: `error[E0425]: cannot find function ...`

- [ ] **Step 3: Implement `get_snippet_folders()` and `create_snippet_folder()`**

Add in `sqlite_store.rs` after `reorder_snippet()` (around line 575):

```rust
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
        stmt.query_map([], |row| row.get(0))?
            .collect::<Result<Vec<_>, _>>()?
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
    // Place snippet at the end of the target folder
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
```

- [ ] **Step 4: Update `reorder_snippet()` to be folder-scoped**

Replace the existing `reorder_snippet()` method (lines 541–575) with:

```rust
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
        stmt.query_map(params![folder_id], |row| row.get(0))?
            .collect::<Result<Vec<_>, _>>()?
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
```

- [ ] **Step 5: Also update `models.rs` import in `sqlite_store.rs`**

The top of `sqlite_store.rs` imports from `crate::models`. Ensure `SnippetFolder` is included:

```rust
use crate::models::{AppSettings, ClipboardContent, ClipboardEntry, ClipboardPayload, ExcludedApp, Language, Snippet, SnippetFolder, Theme, WindowPositionMode};
```

- [ ] **Step 6: Run all tests**

Run: `cargo test -p yank-lib 2>&1 | tail -30`

Expected: all tests pass, including the new folder tests.

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/store/sqlite_store.rs src-tauri/src/models.rs
git commit -m "feat(rust): add folder CRUD store methods and folder-scoped reorder_snippet"
```

---

## Task 3: Rust — Tauri commands + registration

**Files:**
- Modify: `src-tauri/src/commands.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Update import in `commands.rs`**

Change the `use crate::models` line (line 10):

```rust
use crate::{
    models::{AppSettings, ClipboardEntry, ExcludedApp, Snippet, SnippetFolder},
    store::SqliteStore,
    PauseCapture,
};
```

- [ ] **Step 2: Add folder commands after `reorder_snippet` command (around line 138)**

```rust
#[tauri::command]
pub fn get_snippet_folders(store: StoreState) -> Result<Vec<SnippetFolder>, String> {
    store.get_snippet_folders().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_snippet_folder(name: String, store: StoreState) -> Result<SnippetFolder, String> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err("Folder name cannot be empty".to_string());
    }
    store.create_snippet_folder(trimmed).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn rename_snippet_folder(id: i64, name: String, store: StoreState) -> Result<(), String> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err("Folder name cannot be empty".to_string());
    }
    store.rename_snippet_folder(id, trimmed).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_snippet_folder(id: i64, store: StoreState) -> Result<(), String> {
    store.delete_snippet_folder(id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn reorder_snippet_folder(id: i64, new_index: usize, store: StoreState) -> Result<(), String> {
    store.reorder_snippet_folder(id, new_index).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn move_snippet_to_folder(snippet_id: i64, folder_id: Option<i64>, store: StoreState) -> Result<(), String> {
    store.move_snippet_to_folder(snippet_id, folder_id).map_err(|e| e.to_string())
}
```

- [ ] **Step 3: Register new commands in `lib.rs` `invoke_handler`**

In `src-tauri/src/lib.rs`, inside `tauri::generate_handler![...]` (around line 142), add after `commands::reorder_snippet,`:

```rust
commands::get_snippet_folders,
commands::create_snippet_folder,
commands::rename_snippet_folder,
commands::delete_snippet_folder,
commands::reorder_snippet_folder,
commands::move_snippet_to_folder,
```

- [ ] **Step 4: Build to verify compilation**

Run: `cargo build -p yank-lib 2>&1 | tail -20`

Expected: `Finished` with no errors.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/commands.rs src-tauri/src/lib.rs
git commit -m "feat(rust): expose snippet folder Tauri commands"
```

---

## Task 4: TypeScript — Models and i18n

**Files:**
- Create: `src/app/core/models/snippet-folder.model.ts`
- Modify: `src/app/core/models/snippet.model.ts`
- Modify: `src/app/i18n/translation.interface.ts`
- Modify: `src/app/i18n/en.ts`
- Modify: `src/app/i18n/de.ts`

- [ ] **Step 1: Create `snippet-folder.model.ts`**

```typescript
export interface SnippetFolder {
  id: number;
  name: string;
  sortOrder: number;
}
```

- [ ] **Step 2: Update `snippet.model.ts`**

```typescript
export interface Snippet {
  id: number;
  title: string;
  content: string;
  createdAt: number;
  sortOrder: number;
  folderId: number | null;
}
```

- [ ] **Step 3: Add folder keys to `translation.interface.ts` `SNIPPETS` section**

In `translation.interface.ts`, update the `SNIPPETS` block (lines 102–118) to add folder keys:

```typescript
SNIPPETS: {
  TAB: string;
  EMPTY: string;
  EMPTY_HINT: string;
  TITLE_PLACEHOLDER: string;
  BODY_PLACEHOLDER: string;
  TITLE_REQUIRED: string;
  SAVE: string;
  CANCEL: string;
  EDIT_HINT: string;
  HINT_NEW: string;
  HINT_EDIT: string;
  HINT_DELETE: string;
  HINT_PASTE: string;
  PLACEHOLDER_OVERLAY_CONFIRM: string;
  PLACEHOLDER_OVERLAY_TITLE: string;
  FOLDER_GENERAL: string;
  FOLDER_ADD: string;
  FOLDER_NAME_PLACEHOLDER: string;
  FOLDER_DELETE_CONFIRM: string;
  FOLDER_DELETE_YES: string;
  FOLDER_DELETE_CANCEL: string;
};
```

- [ ] **Step 4: Add English translations in `en.ts`**

In `en.ts`, in the `SNIPPETS` object (line 103), add after `PLACEHOLDER_OVERLAY_TITLE`:

```typescript
FOLDER_GENERAL: 'General',
FOLDER_ADD: '+ Add folder',
FOLDER_NAME_PLACEHOLDER: 'Folder name',
FOLDER_DELETE_CONFIRM: 'Move all snippets in "{{name}}" to General and delete this folder?',
FOLDER_DELETE_YES: 'Delete',
FOLDER_DELETE_CANCEL: 'Cancel',
```

- [ ] **Step 5: Add German translations in `de.ts`**

In `de.ts`, in the `SNIPPETS` object, add after `PLACEHOLDER_OVERLAY_TITLE`:

```typescript
FOLDER_GENERAL: 'Allgemein',
FOLDER_ADD: '+ Ordner hinzufügen',
FOLDER_NAME_PLACEHOLDER: 'Ordnername',
FOLDER_DELETE_CONFIRM: 'Alle Snippets in „{{name}}" nach Allgemein verschieben und Ordner löschen?',
FOLDER_DELETE_YES: 'Löschen',
FOLDER_DELETE_CANCEL: 'Abbrechen',
```

- [ ] **Step 6: Run TypeScript build**

Run: `npm run build 2>&1 | tail -20`

Expected: no type errors.

- [ ] **Step 7: Commit**

```bash
git add src/app/core/models/snippet-folder.model.ts src/app/core/models/snippet.model.ts src/app/i18n/translation.interface.ts src/app/i18n/en.ts src/app/i18n/de.ts
git commit -m "feat(angular): add SnippetFolder model and folder i18n keys"
```

---

## Task 5: TypeScript — TauriBridgeService

**Files:**
- Modify: `src/app/core/services/tauri-bridge.service.ts`

- [ ] **Step 1: Add `SnippetFolder` import and folder methods**

Add import at top (after `Snippet` import):

```typescript
import { SnippetFolder } from '../models/snippet-folder.model';
```

After `reorderSnippet()` (line 89), add:

```typescript
getSnippetFolders(): Promise<SnippetFolder[]> {
  return invoke<SnippetFolder[]>('get_snippet_folders');
}

createSnippetFolder(name: string): Promise<SnippetFolder> {
  return invoke<SnippetFolder>('create_snippet_folder', { name });
}

renameSnippetFolder(id: number, name: string): Promise<void> {
  return invoke('rename_snippet_folder', { id, name });
}

deleteSnippetFolder(id: number): Promise<void> {
  return invoke('delete_snippet_folder', { id });
}

reorderSnippetFolder(id: number, newIndex: number): Promise<void> {
  return invoke('reorder_snippet_folder', { id, newIndex });
}

moveSnippetToFolder(snippetId: number, folderId: number | null): Promise<void> {
  return invoke('move_snippet_to_folder', { snippetId, folderId });
}
```

- [ ] **Step 2: Run build**

Run: `npm run build 2>&1 | tail -20`

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/core/services/tauri-bridge.service.ts
git commit -m "feat(angular): add folder bridge methods to TauriBridgeService"
```

---

## Task 6: TypeScript — SnippetsService

**Files:**
- Modify: `src/app/core/services/snippets.service.ts`

- [ ] **Step 1: Rewrite `snippets.service.ts`**

Replace the entire file content with:

```typescript
import { Injectable, inject, resource } from '@angular/core';
import { Snippet } from '../models/snippet.model';
import { SnippetFolder } from '../models/snippet-folder.model';
import { TauriBridgeService } from './tauri-bridge.service';

@Injectable({ providedIn: 'root' })
export class SnippetsService {
  private bridge = inject(TauriBridgeService);

  readonly snippets = resource({
    loader: () => this.bridge.getSnippets(),
  });

  readonly folders = resource({
    loader: () => this.bridge.getSnippetFolders(),
  });

  async createSnippet(title: string, content: string): Promise<void> {
    await this.bridge.createSnippet(title, content);
    this.snippets.reload();
  }

  async updateSnippet(id: number, title: string, content: string): Promise<void> {
    await this.bridge.updateSnippet(id, title, content);
    this.snippets.reload();
  }

  async deleteSnippet(id: number): Promise<void> {
    await this.bridge.deleteSnippet(id);
    this.snippets.reload();
  }

  async reorderSnippet(reordered: Snippet[], id: number, newIndex: number): Promise<void> {
    this.snippets.value.set(reordered);
    try {
      await this.bridge.reorderSnippet(id, newIndex);
    } catch {
      this.snippets.reload();
    }
  }

  async moveAndReorderSnippet(
    reordered: Snippet[],
    snippetId: number,
    folderId: number | null,
    newIndex: number,
  ): Promise<void> {
    this.snippets.value.set(reordered);
    try {
      await this.bridge.moveSnippetToFolder(snippetId, folderId);
      await this.bridge.reorderSnippet(snippetId, newIndex);
    } catch {
      this.snippets.reload();
    }
  }

  async moveSnippetToFolder(reordered: Snippet[], snippetId: number, folderId: number | null): Promise<void> {
    this.snippets.value.set(reordered);
    try {
      await this.bridge.moveSnippetToFolder(snippetId, folderId);
    } catch {
      this.snippets.reload();
    }
  }

  async createFolder(name: string): Promise<void> {
    await this.bridge.createSnippetFolder(name);
    this.folders.reload();
  }

  async renameFolder(id: number, name: string): Promise<void> {
    await this.bridge.renameSnippetFolder(id, name);
    this.folders.reload();
  }

  async deleteFolder(id: number): Promise<void> {
    await this.bridge.deleteSnippetFolder(id);
    this.folders.reload();
    this.snippets.reload();
  }

  async reorderFolder(reordered: SnippetFolder[], id: number, newIndex: number): Promise<void> {
    this.folders.value.set(reordered);
    try {
      await this.bridge.reorderSnippetFolder(id, newIndex);
    } catch {
      this.folders.reload();
    }
  }
}
```

- [ ] **Step 2: Run build**

Run: `npm run build 2>&1 | tail -20`

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/core/services/snippets.service.ts
git commit -m "feat(angular): add folder operations and moveAndReorderSnippet to SnippetsService"
```

---

## Task 7: Angular — SnippetFolderHeaderComponent

**Files:**
- Create: `src/app/features/clipboard-list/snippet-folder-header.component.ts`

- [ ] **Step 1: Create the component**

```typescript
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideChevronDown, lucideChevronRight, lucideTrash2 } from '@ng-icons/lucide';
import { TranslatePipe } from '@ngx-translate/core';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmIcon } from '@spartan-ng/helm/icon';
import { SnippetFolder } from '../../core/models/snippet-folder.model';

@Component({
  selector: 'app-snippet-folder-header',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgIcon, HlmIcon, HlmButton, TranslatePipe],
  providers: [provideIcons({ lucideChevronDown, lucideChevronRight, lucideTrash2 })],
  template: `
    <div class="flex items-center gap-1 w-full min-w-0 h-7 px-2">
      <button
        class="shrink-0 text-muted-foreground hover:text-foreground transition-colors p-0.5"
        (click)="$event.stopPropagation(); toggleCollapse.emit()"
      >
        <ng-icon
          hlm
          size="xs"
          [name]="isExpanded() ? 'lucideChevronDown' : 'lucideChevronRight'"
        />
      </button>

      @if (editingName()) {
        <input
          #nameInput
          type="text"
          [value]="pendingName()"
          (input)="pendingName.set($any($event.target).value)"
          (keydown)="onNameKeyDown($event)"
          (blur)="saveName()"
          class="flex-1 min-w-0 bg-muted/50 text-[12px] font-semibold text-foreground rounded px-1.5 py-0.5 outline-none focus:ring-1 focus:ring-brand/50"
        />
      } @else if (confirmingDelete()) {
        <span class="text-[11px] text-destructive flex-1 min-w-0 truncate">
          {{ 'SNIPPETS.FOLDER_DELETE_CONFIRM' | translate: { name: folder().name } }}
        </span>
        <button
          hlmBtn
          variant="destructive"
          size="xs"
          class="shrink-0 text-[11px] h-5 px-1.5"
          (click)="$event.stopPropagation(); confirmDelete()"
        >
          {{ 'SNIPPETS.FOLDER_DELETE_YES' | translate }}
        </button>
        <button
          hlmBtn
          variant="ghost"
          size="xs"
          class="shrink-0 text-[11px] h-5 px-1.5"
          (click)="$event.stopPropagation(); confirmingDelete.set(false)"
        >
          {{ 'SNIPPETS.FOLDER_DELETE_CANCEL' | translate }}
        </button>
      } @else {
        <span
          class="flex-1 min-w-0 text-[12px] font-semibold text-muted-foreground truncate select-none"
          [class.cursor-pointer]="!isGeneral()"
          [class.hover:text-foreground]="!isGeneral()"
          (click)="$event.stopPropagation(); startEdit()"
        >
          {{ isGeneral() ? ('SNIPPETS.FOLDER_GENERAL' | translate) : folder().name }}
        </span>
        @if (!isGeneral()) {
          <button
            class="opacity-0 group-hover:opacity-100 shrink-0 text-muted-foreground hover:text-destructive transition-opacity p-0.5"
            (click)="$event.stopPropagation(); confirmingDelete.set(true)"
          >
            <ng-icon hlm size="xs" name="lucideTrash2" />
          </button>
        }
      }
    </div>
  `,
})
export class SnippetFolderHeaderComponent {
  folder = input.required<SnippetFolder>();
  isGeneral = input<boolean>(false);
  isExpanded = input.required<boolean>();

  toggleCollapse = output<void>();
  rename = output<string>();
  delete = output<void>();

  private injector = inject(Injector);
  protected editingName = signal(false);
  protected pendingName = signal('');
  protected confirmingDelete = signal(false);
  protected nameInput = viewChild<ElementRef<HTMLInputElement>>('nameInput');

  protected startEdit(): void {
    if (this.isGeneral()) return;
    this.pendingName.set(this.folder().name);
    this.editingName.set(true);
    afterNextRender(
      () => {
        this.nameInput()?.nativeElement.focus();
        this.nameInput()?.nativeElement.select();
      },
      { injector: this.injector },
    );
  }

  protected saveName(): void {
    const trimmed = this.pendingName().trim();
    if (trimmed && trimmed !== this.folder().name) {
      this.rename.emit(trimmed);
    }
    this.editingName.set(false);
  }

  protected onNameKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      this.saveName();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      this.editingName.set(false);
    }
  }

  protected confirmDelete(): void {
    this.confirmingDelete.set(false);
    this.delete.emit();
  }
}
```

- [ ] **Step 2: Run build**

Run: `npm run build 2>&1 | tail -20`

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/features/clipboard-list/snippet-folder-header.component.ts
git commit -m "feat(angular): add SnippetFolderHeaderComponent"
```

---

## Task 8: Angular — ClipboardListComponent snippets tab refactor

**Files:**
- Modify: `src/app/features/clipboard-list/clipboard-list.component.ts`

This task rewrites the snippets tab rendering. The key CDK design:
- An outer `cdkDropList` (`id="folder-reorder"`) wraps user folder sections for folder reordering — General is rendered ABOVE it and is not draggable.
- Each user folder section is a `cdkDrag` with `cdkDragHandle` in the header row.
- Each folder has a snippet body `cdkDropList` (`id="folder-body-{id}"` / `"folder-body-general"`). These are connected to each other via `[cdkDropListConnectedTo]="allSnippetBodyIds()"`.
- Each folder section also has a header `cdkDropList` (`id="folder-header-{id}"` / `"folder-header-general"`) that accepts snippet drags and fires `onSnippetDroppedOnFolderHeader`. These header zones are included in `allSnippetBodyIds()` so snippets can be dragged onto them.
- When a snippet is dropped in its own folder body: reorder within folder.
- When dropped in another folder's body: `moveAndReorderSnippet`.
- When dropped on a folder header: `moveSnippetToFolder` (places at end of target folder).

- [ ] **Step 1: Update imports at the top of the component**

Change the CDK import line:

```typescript
import { CdkDropList, CdkDrag, CdkDragDrop, CdkDragHandle, CdkDragPlaceholder, moveItemInArray } from '@angular/cdk/drag-drop';
```

Add `SnippetFolder` model import:

```typescript
import { SnippetFolder } from '../../core/models/snippet-folder.model';
```

Add `SnippetFolderHeaderComponent` import:

```typescript
import { SnippetFolderHeaderComponent } from './snippet-folder-header.component';
```

Add Lucide icon imports for folder drag:

```typescript
import { lucideClipboard, lucideSearch, lucideSettings, lucideX, lucideGripVertical } from '@ng-icons/lucide';
```

- [ ] **Step 2: Update the `imports` array in `@Component`**

Add to the `imports` array:
```typescript
CdkDragHandle,
CdkDragPlaceholder,
SnippetFolderHeaderComponent,
```

Update providers to include `lucideGripVertical`:
```typescript
providers: [provideIcons({ lucideClipboard, lucideSearch, lucideSettings, lucideX, lucideGripVertical })],
```

- [ ] **Step 3: Add folder-related signals and computed values to the class body**

After `protected captureIsPaused = signal(false);` (around line 430), add:

```typescript
protected expandedFolderIds = signal<Set<string>>(new Set(['general']));
protected addingFolder = signal(false);
protected newFolderName = signal('');
```

Replace the existing `allSnippets` computed (line 445) with:

```typescript
protected allSnippets = computed(() => {
  const snippets = this.snippetsService.snippets.value() ?? [];
  const folders = this.snippetsService.folders.value() ?? [];
  const general = snippets
    .filter(s => s.folderId === null)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const folderSnippets = folders
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .flatMap(f =>
      snippets
        .filter(s => s.folderId === f.id)
        .sort((a, b) => a.sortOrder - b.sortOrder),
    );
  return [...general, ...folderSnippets];
});

protected userFolders = computed(() =>
  (this.snippetsService.folders.value() ?? []).slice().sort((a, b) => a.sortOrder - b.sortOrder),
);

protected generalSnippets = computed(() =>
  (this.snippetsService.snippets.value() ?? [])
    .filter(s => s.folderId === null)
    .sort((a, b) => a.sortOrder - b.sortOrder),
);

protected snippetBodyIds = computed(() => [
  'folder-body-general',
  ...this.userFolders().map(f => 'folder-body-' + f.id),
]);

protected allSnippetTargetIds = computed(() => [
  ...this.snippetBodyIds(),
  'folder-header-general',
  ...this.userFolders().map(f => 'folder-header-' + f.id),
]);

protected getSnippetsByFolder(folderId: number): Snippet[] {
  return (this.snippetsService.snippets.value() ?? [])
    .filter(s => s.folderId === folderId)
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

protected isFolderExpanded(key: string | number): boolean {
  return this.expandedFolderIds().has(String(key));
}

protected toggleFolder(key: string | number): void {
  const id = String(key);
  const set = new Set(this.expandedFolderIds());
  if (set.has(id)) {
    set.delete(id);
  } else {
    set.add(id);
  }
  this.expandedFolderIds.set(set);
}

// Virtual folder object for General so the header component can receive a SnippetFolder shape
protected readonly generalFolder: SnippetFolder = { id: -1, name: '', sortOrder: -1 };
```

- [ ] **Step 4: Replace the snippets tab template**

In the `@Component` template, find the `@if (activeTab() === 'snippets')` block (around line 172) and replace the inner `@else` block (starting `} @else {`, containing the `cdkDropList` for snippets, line ~214) with the new folder-based rendering. Keep the loading/error/empty states as-is. Replace only the `@else {` block (from `} @else {` through the closing `}` before `} @else {` for the clipboard list):

```html
} @else {
  <!-- Snippet folders -->
  <div class="py-1">

    <!-- General folder section (always first, not reorderable) -->
    <div class="folder-section relative group/folder">
      <div
        class="relative"
        cdkDropList
        id="folder-header-general"
        [cdkDropListConnectedTo]="snippetBodyIds()"
        [cdkDropListSortingDisabled]="true"
        (cdkDropListDropped)="onSnippetDroppedOnFolderHeader($event, null)"
      >
        <app-snippet-folder-header
          [folder]="generalFolder"
          [isGeneral]="true"
          [isExpanded]="isFolderExpanded('general')"
          (toggleCollapse)="toggleFolder('general')"
        />
      </div>
      @if (isFolderExpanded('general')) {
        <div
          cdkDropList
          id="folder-body-general"
          [cdkDropListConnectedTo]="allSnippetTargetIds()"
          [cdkDropListData]="null"
          (cdkDropListDropped)="onSnippetDrop($event, null)"
        >
          @if (showNewSnippetForm()) {
            <app-new-snippet-form
              (saved)="onSnippetCreated($event)"
              (cancelled)="onSnippetFormCancelled()"
            />
          }
          @for (snippet of generalSnippets(); track snippet.id; let i = $index) {
            <div
              class="snippet-item"
              cdkDrag
              [cdkDragData]="snippet"
              [cdkDragDisabled]="editingSnippetId() !== null || showNewSnippetForm()"
            >
              <app-snippet-item
                [snippet]="snippet"
                [selected]="snippetSelectedIndex() === allSnippets().indexOf(snippet)"
                [editMode]="editingSnippetId() === snippet.id"
                (select)="selectSnippet(allSnippets().indexOf(snippet))"
                (delete)="deleteSnippetByIndex(allSnippets().indexOf(snippet))"
                (editConfirm)="onSnippetEditConfirm($event)"
                (editCancel)="onSnippetEditCancel()"
              />
            </div>
          }
        </div>
      }
    </div>

    <!-- User folder sections (reorderable) -->
    <div
      cdkDropList
      id="folder-reorder"
      (cdkDropListDropped)="onFolderDrop($event)"
    >
      @for (folder of userFolders(); track folder.id) {
        <div cdkDrag [cdkDragData]="folder" class="folder-section group/folder">
          <div *cdkDragPlaceholder class="h-7 mx-2 my-0.5 rounded border border-dashed border-border/50 bg-muted/20"></div>

          <!-- Folder header: also a drop zone for snippets -->
          <div
            class="relative"
            cdkDropList
            [id]="'folder-header-' + folder.id"
            [cdkDropListConnectedTo]="snippetBodyIds()"
            [cdkDropListSortingDisabled]="true"
            (cdkDropListDropped)="onSnippetDroppedOnFolderHeader($event, folder.id)"
          >
            <div class="flex items-center">
              <span
                cdkDragHandle
                class="opacity-0 group-hover/folder:opacity-100 cursor-grab active:cursor-grabbing shrink-0 text-muted-foreground transition-opacity pl-1"
              >
                <ng-icon hlm size="xs" name="lucideGripVertical" />
              </span>
              <app-snippet-folder-header
                class="flex-1 min-w-0"
                [folder]="folder"
                [isGeneral]="false"
                [isExpanded]="isFolderExpanded(folder.id)"
                (toggleCollapse)="toggleFolder(folder.id)"
                (rename)="onFolderRename(folder.id, $event)"
                (delete)="onFolderDelete(folder.id)"
              />
            </div>
          </div>

          <!-- Snippet body -->
          @if (isFolderExpanded(folder.id)) {
            <div
              cdkDropList
              [id]="'folder-body-' + folder.id"
              [cdkDropListConnectedTo]="allSnippetTargetIds()"
              [cdkDropListData]="folder.id"
              (cdkDropListDropped)="onSnippetDrop($event, folder.id)"
            >
              @for (snippet of getSnippetsByFolder(folder.id); track snippet.id) {
                <div
                  class="snippet-item"
                  cdkDrag
                  [cdkDragData]="snippet"
                  [cdkDragDisabled]="editingSnippetId() !== null"
                >
                  <app-snippet-item
                    [snippet]="snippet"
                    [selected]="snippetSelectedIndex() === allSnippets().indexOf(snippet)"
                    [editMode]="editingSnippetId() === snippet.id"
                    (select)="selectSnippet(allSnippets().indexOf(snippet))"
                    (delete)="deleteSnippetByIndex(allSnippets().indexOf(snippet))"
                    (editConfirm)="onSnippetEditConfirm($event)"
                    (editCancel)="onSnippetEditCancel()"
                  />
                </div>
              }
            </div>
          }
        </div>
      }
    </div>

    <!-- Add folder button / inline new folder input -->
    @if (addingFolder()) {
      <div class="flex items-center gap-1.5 px-3 py-1">
        <input
          #newFolderInput
          type="text"
          [value]="newFolderName()"
          (input)="newFolderName.set($any($event.target).value)"
          (keydown)="onNewFolderKeyDown($event)"
          (blur)="saveNewFolder()"
          [placeholder]="'SNIPPETS.FOLDER_NAME_PLACEHOLDER' | translate"
          class="flex-1 min-w-0 bg-muted/50 text-[12px] text-foreground rounded px-2 py-1 outline-none focus:ring-1 focus:ring-brand/50"
        />
      </div>
    } @else {
      <button
        class="w-full text-left px-3 py-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
        (click)="startAddFolder()"
      >
        {{ 'SNIPPETS.FOLDER_ADD' | translate }}
      </button>
    }
  </div>
}
```

- [ ] **Step 5: Add new event handlers in the class body**

After `onSnippetDrop()` (around line 919), replace it with the updated version and add new handlers:

```typescript
protected onSnippetDrop(event: CdkDragDrop<number | null>): void {
  if (event.previousIndex === event.currentIndex && event.container.id === event.previousContainer.id) return;
  const snippet = event.item.data as Snippet;
  const targetFolderId = event.container.data as number | null;
  const sourceFolderId = event.previousContainer.data as number | null;
  const all = this.snippetsService.snippets.value() ?? [];

  if (sourceFolderId === targetFolderId) {
    // Reorder within same folder
    const folderItems = sourceFolderId === null
      ? all.filter(s => s.folderId === null).sort((a, b) => a.sortOrder - b.sortOrder)
      : all.filter(s => s.folderId === sourceFolderId).sort((a, b) => a.sortOrder - b.sortOrder);
    const reordered = [...folderItems];
    moveItemInArray(reordered, event.previousIndex, event.currentIndex);
    const updated = all.map(s => {
      const idx = reordered.findIndex(r => r.id === s.id);
      return idx !== -1 ? { ...s, sortOrder: idx } : s;
    });
    this.snippetSelectedIndex.set(this.allSnippets().findIndex(s => s.id === snippet.id));
    this.snippetsService.reorderSnippet(updated, snippet.id, event.currentIndex);
  } else {
    // Cross-folder move + reorder
    const updated = all
      .filter(s => s.id !== snippet.id)
      .concat([{ ...snippet, folderId: targetFolderId }]);
    this.snippetsService.moveAndReorderSnippet(updated, snippet.id, targetFolderId, event.currentIndex);
  }
}

protected onSnippetDroppedOnFolderHeader(event: CdkDragDrop<number | null>, targetFolderId: number | null): void {
  const snippet = event.item.data as Snippet;
  if (snippet.folderId === targetFolderId) return;
  const all = this.snippetsService.snippets.value() ?? [];
  const updated = all.map(s => s.id === snippet.id ? { ...s, folderId: targetFolderId } : s);
  this.snippetsService.moveSnippetToFolder(updated, snippet.id, targetFolderId);
}

protected onFolderDrop(event: CdkDragDrop<SnippetFolder[]>): void {
  if (event.previousIndex === event.currentIndex) return;
  const folder = event.item.data as SnippetFolder;
  const folders = [...this.userFolders()];
  moveItemInArray(folders, event.previousIndex, event.currentIndex);
  this.snippetsService.reorderFolder(folders, folder.id, event.currentIndex);
}

protected onFolderRename(id: number, name: string): void {
  this.snippetsService.renameFolder(id, name);
}

protected onFolderDelete(id: number): void {
  this.snippetsService.deleteFolder(id);
}

protected startAddFolder(): void {
  this.newFolderName.set('');
  this.addingFolder.set(true);
  // Focus is handled by [cdkMonitorSubtreeFocus] or afterNextRender in template — we rely on (blur) to save
}

protected saveNewFolder(): void {
  const name = this.newFolderName().trim();
  this.addingFolder.set(false);
  if (name) {
    this.snippetsService.createFolder(name).then(() => {
      // Expand the newly created folder
      const folders = this.snippetsService.folders.value() ?? [];
      if (folders.length > 0) {
        const newest = folders[folders.length - 1];
        this.toggleFolder(newest.id);
      }
    });
  }
}

protected onNewFolderKeyDown(event: KeyboardEvent): void {
  if (event.key === 'Enter') {
    event.preventDefault();
    (event.target as HTMLInputElement).blur(); // triggers saveNewFolder via (blur)
  } else if (event.key === 'Escape') {
    event.preventDefault();
    this.addingFolder.set(false);
  }
}
```

- [ ] **Step 6: Update `onPopupShown` reset to clear folder state**

In `ngOnInit()`, inside the `onPopupShown` callback (around line 473), add:

```typescript
this.addingFolder.set(false);
this.newFolderName.set('');
this.expandedFolderIds.set(new Set(['general']));
```

And reload folders on popup shown so they stay fresh:

```typescript
this.snippetsService.folders.reload();
```

- [ ] **Step 7: Run build**

Run: `npm run build 2>&1 | tail -30`

Fix any remaining type errors (common: missing `CdkDragDrop` import, or `CdkDragPlaceholder` not exported — if so, import from `'@angular/cdk/drag-drop'` directly).

- [ ] **Step 8: Run the dev server and manually test**

Run: `npm run tauri dev`

Test these scenarios:
1. Snippets tab shows "General" folder with all existing snippets inside (expanded by default)
2. Click chevron to collapse/expand General
3. Click "+ Add folder" → type a name → press Enter → new folder appears
4. Press Escape while adding folder → cancelled
5. Drag a snippet from General to the new folder's body → snippet moves
6. Drag a snippet onto a folder header row → snippet moves to that folder
7. Drag a user folder header's grip icon → folder reorders
8. Click a folder name → inline rename input appears → type new name → Enter saves
9. Click trash icon on folder → confirmation appears → confirm → folder deleted, snippets return to General
10. General folder cannot be dragged or renamed

- [ ] **Step 9: Commit**

```bash
git add src/app/features/clipboard-list/clipboard-list.component.ts
git commit -m "feat(angular): implement snippet folder sections with CDK drag-drop"
```

---

## Self-Review

### Spec coverage check

| Spec requirement | Task |
|---|---|
| Folder sections: General (permanent), user folders, collapsible | Tasks 7, 8 |
| Folder header: chevron, name, trash (hover, not General), drag handle | Tasks 7, 8 |
| "+ Add folder" button below last folder | Task 8 |
| Create folder: Enter/Esc/blur behavior | Task 8 |
| Rename folder: click name → inline input → Enter/Esc/blur | Task 7 |
| Delete folder: confirmation prompt, move to General | Tasks 2, 7 |
| Reorder folders: drag handle, General pinned at top | Task 8 |
| Move snippet via drag onto folder header | Task 8 |
| Move snippet via drag within/across folder bodies | Task 8 |
| Collapse state: local signal, all start expanded | Task 8 |
| `snippet_folders` table + migration | Tasks 1, 2 |
| `folder_id` column on snippets | Task 1 |
| `SnippetFolder` TS model, `folderId` on Snippet | Task 4 |
| All 6 Tauri commands | Tasks 2, 3 |
| i18n keys for folder UI | Task 4 |
| `reorder_snippet` folder-scoped | Task 2 |

### Out-of-scope (confirmed not included)
- Persisting collapse state across sessions ✓
- Nested folders ✓
- Search by folder ✓
- Folder colors/icons ✓
