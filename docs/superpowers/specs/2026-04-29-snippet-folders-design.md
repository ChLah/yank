# Snippet Folders / Groups — Design Spec

**Date:** 2026-04-29

---

## Overview

Organize snippets into named, collapsible folder sections within the existing Snippets tab. Folders are managed inline and support drag-and-drop reordering of both folders and the snippets within them.

---

## UI Layout

The Snippets tab renders a vertical list of **folder sections**, each with:

```
▼ General                          (permanent, always first)
    snippet A
    snippet B
▼ Work                             (user folder, collapsible)
    snippet C
▶ Dev                              (collapsed)
                          [+ Add folder]
```

- **Folder header row**: collapse/expand chevron · folder name · trash icon (on hover, not for General) · drag handle (for user folders)
- **Snippets inside a section**: existing `SnippetItemComponent` rows, draggable within and across sections
- **"+ Add folder" button**: below the last folder section, creates a new folder inline

---

## Folder Management (inline)

### Create
Clicking "+ Add folder" appends a new folder at the bottom with its name field in edit mode (auto-focused). Pressing Enter or blurring saves; pressing Escape cancels.

### Rename
Clicking the folder name activates an inline text input in place. Same Enter/Escape/blur behaviour as create.

### Delete
A trash icon appears on hover of any user folder header (not General). Clicking it shows a confirmation prompt:
> "Move all snippets in [folder name] to General and delete this folder?"

On confirm: snippets are moved to General (`folder_id = NULL`), folder is deleted. On cancel: no change.

### Reorder folders
Folder headers have a drag handle (same pattern as snippet drag handles). Dragging a folder header reorders folders. General is always pinned at the top and cannot be dragged.

---

## Moving Snippets Between Folders

Dragging a snippet and hovering over a **folder header** highlights the header as a drop target. Dropping assigns the snippet to that folder. Dropping within the same folder's body reorders as today.

---

## Collapse / Expand

Each folder tracks collapsed state locally in the component (not persisted). All folders start expanded. Clicking the chevron or the folder name (when not in edit mode) toggles collapsed state.

---

## Data Model

### New table: `snippet_folders`

```sql
CREATE TABLE snippet_folders (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);
```

### Updated table: `snippets`

```sql
ALTER TABLE snippets ADD COLUMN folder_id INTEGER REFERENCES snippet_folders(id) ON DELETE SET NULL;
```

`folder_id = NULL` means the snippet belongs to General. General is not a database row — it is a virtual group rendered for all snippets without a folder.

---

## TypeScript Models

```ts
export interface SnippetFolder {
  id: number;
  name: string;
  sortOrder: number;
}
```

`Snippet` gains an optional `folderId: number | null` field.

---

## Tauri Commands

| Command | Description |
|---|---|
| `get_snippet_folders` | Returns all folders ordered by `sort_order` |
| `create_snippet_folder(name)` | Inserts a new folder, returns it |
| `rename_snippet_folder(id, name)` | Updates name |
| `delete_snippet_folder(id)` | Sets `folder_id = NULL` for all snippets in folder, then deletes folder |
| `reorder_snippet_folder(id, new_sort_order)` | Updates sort order (same transaction pattern as `reorder_snippet`) |
| `move_snippet_to_folder(snippet_id, folder_id)` | Updates `folder_id` on a snippet |

---

## Components Affected

| Layer | Change |
|---|---|
| Rust (`store.rs`) | Migration adding `snippet_folders` table and `folder_id` column; implement above commands |
| Rust (`commands.rs`) | Expose new Tauri commands |
| `TauriBridgeService` | Add TypeScript wrappers for all new commands |
| `SnippetsService` | Load folders alongside snippets; expose combined state |
| Snippets tab (inside `ClipboardListComponent`) | Render folder sections, collapse/expand, inline create/rename, drag-and-drop for folders and cross-folder snippets |
| `SnippetItemComponent` | No structural change; receives `folderId` context for drop-target logic |
| i18n (`en.ts`, `de.ts`) | Add keys for folder header actions, confirmation prompt, "+ Add folder" button |

---

## Out of Scope

- Persisting collapse/expand state across sessions
- Nested folders (max one level of grouping)
- Filtering/searching snippets by folder
- Folder colours or icons
