---
# Custom Snippets — Design Spec

**Date:** 2026-04-27
**Status:** Approved

## Overview

A **Snippets** tab sits alongside **Recent** and **Pinned**. Users define reusable text templates with optional `{{placeholder}}` variables that are filled in interactively at paste time. Snippets are permanent (never auto-deleted) and not captured from clipboard activity.

## Snippet Model

```ts
interface Snippet {
  id: number;
  title: string;       // short label shown in the list
  content: string;     // body, may contain {{placeholder}} tokens
  createdAt: number;
  sortOrder: number;   // lower = higher in list
}
```

```rust
pub struct Snippet {
    pub id: i64,
    pub title: String,
    pub content: String,
    pub created_at: i64,
    pub sort_order: i64,
}
```

## SQLite Schema

```sql
CREATE TABLE IF NOT EXISTS snippets (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    title       TEXT    NOT NULL,
    content     TEXT    NOT NULL,
    created_at  INTEGER NOT NULL,
    sort_order  INTEGER NOT NULL DEFAULT 0
);
```

## Tauri Commands

| Command | Signature | Notes |
|---|---|---|
| `get_snippets` | `() → Vec<Snippet>` | Returns all snippets ordered by `sort_order ASC, id ASC` |
| `create_snippet` | `(title, content) → Snippet` | Assigns `sort_order = MAX(sort_order) + 1` |
| `update_snippet` | `(id, title, content) → Snippet` | Updates title and content |
| `delete_snippet` | `(id) → ()` | Hard delete |

## Keyboard Shortcuts in Snippets Tab

| Key | Action |
|---|---|
| `↑` / `↓` | Navigate snippets |
| `Enter` | Paste snippet (or open placeholder overlay if `{{...}}` found) |
| `E` | Edit snippet inline (same UX as clipboard inline edit) |
| `Delete` | Delete focused snippet |
| `N` | Open new-snippet inline form |
| `Esc` | Close window / cancel inline form |

## Inline Creation Form

Pressing `N` in the Snippets tab inserts an inline form at the top of the list:

```
┌──────────────────────────────────────┐
│ Title  [ ___________________________ ]│
│ Body   [ ___________________________ ]│
│        [    Save    ]  [   Cancel   ] │
└──────────────────────────────────────┘
```

- `Tab` moves focus between Title → Body → Save → Cancel.
- `Ctrl+Enter` in the Body field submits (same as clicking Save).
- `Esc` cancels without saving.
- Empty title is rejected with inline validation message.

## Placeholder Syntax

Placeholders use double curly braces: `{{name}}`, `{{email}}`, `{{date}}`.

Rules:
- Placeholder names are case-sensitive (`{{Name}}` and `{{name}}` are distinct fields).
- A name may contain letters, digits, hyphens, and underscores. No spaces.
- Multiple occurrences of the same placeholder name receive the same value.

## Placeholder Fill-In Overlay

When `Enter` is pressed on a snippet that contains one or more `{{...}}` tokens:

1. An overlay appears over the popup (same visual layer as the transform picker).
2. One labeled input field per **unique** placeholder name, in order of first appearance in the content.
3. `Enter` confirms: substitutes all occurrences and pastes the result.
4. `Esc` cancels and returns to the snippet list.

Example — snippet content:

```
Dear {{recipient}},

Please find attached {{document}}.

Kind regards
```

Overlay shows two fields: **recipient** and **document**.

After fill-in: the substituted text is written to the clipboard via `set_clipboard_text` and the popup closes.

The filled snippet is **not** added to clipboard history (it would pollute Recent with boilerplate).

## SnippetsService

New Angular service `SnippetsService` with:

```ts
snippets: Signal<Snippet[]>
loadSnippets(): Promise<void>
createSnippet(title, content): Promise<void>
updateSnippet(id, title, content): Promise<void>
deleteSnippet(id): Promise<void>
```

## Tab Integration

`ClipboardListComponent` gains a third tab. The active tab is a local `signal<'recent' | 'pinned' | 'snippets'>`. Navigation via `Ctrl+Tab` / `Ctrl+Shift+Tab` cycles through tabs (consistent with standard tab nav).

The search bar is hidden when the Snippets tab is active (snippets are few enough that keyboard navigation suffices; search can be added later).

## What is NOT in scope

- Snippet categories or folders.
- Snippet import/export.
- Rich-text snippet bodies.
- Search within snippets.
- Snippet ordering via drag-and-drop.
- Filled snippets appearing in clipboard history.
