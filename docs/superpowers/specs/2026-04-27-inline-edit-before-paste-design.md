# Inline Edit Before Paste — Design Spec

**Date:** 2026-04-27  
**Status:** Approved

## Overview

Users can press `E` on a selected text entry to expand it into an editable textarea, make quick changes, and immediately paste the edited content via `Ctrl+Enter`. The original history entry is never modified — the edit is always ephemeral.

## Trigger

- Press `E` on a selected **text** entry to enter edit mode.
- Ignored on image entries.
- Only one entry can be in edit mode at a time.

## UI

The selected entry card expands in-place. The text content is replaced by a `textarea` element:

- Pre-filled with the entry's full `content`.
- All text is selected on open (ready to retype from scratch or deselect to position cursor).
- The entry's timestamp, pin button, and delete button are hidden while in edit mode.
- The card grows vertically to fit the textarea (min 3 rows, no max — scrolls internally if very long).
- A small hint below the textarea: `Ctrl+Enter to paste · Esc to cancel`

## Keyboard

| Key | Action |
|---|---|
| `E` | Enter edit mode on focused entry |
| `Enter` | Insert newline (normal textarea behavior) |
| `Ctrl+Enter` | Paste edited content + close popup |
| `Escape` | Cancel edit, collapse back to normal entry view |
| `Tab` | Move focus to next focusable element (exits edit mode — treated as cancel) |

Clicking on a different entry also cancels the edit (no changes made).

## Paste Behavior

On `Ctrl+Enter`:

1. Read current textarea value.
2. Call `TauriBridgeService.setClipboard(entryId)` — but with the edited text rather than the stored content.

> Note: `set_clipboard` currently pastes by entry id. For inline edit, the command needs to accept an **override text** argument, or a new command `set_clipboard_text(text: string)` is added. The latter is cleaner and avoids coupling the command to the entry.

3. Hide popup via `TauriBridgeService.hidePopup()`.
4. The stored entry in the DB is **not modified**.

## New Tauri Command

`set_clipboard_text(text: string) → Result<(), String>`

- Writes the given string directly to the system clipboard.
- Does not create a new DB entry (the clipboard monitor handles deduplication naturally if the user re-opens the popup).

## Components

Edit mode is handled within the existing **`ClipboardEntryComponent`**:

- A boolean signal `editMode` controls which template block is rendered.
- The `textarea` is rendered via `@if (editMode())`.
- On render, `afterNextRender` (or `cdkFocusInitial`) focuses and selects all text.

No new component is needed — the entry component owns its own edit state.

## State Constraints

- `ClipboardListComponent` tracks `editingEntryId: signal<number | null>` to ensure only one entry is ever in edit mode.
- Navigating away (arrow keys) while in edit mode cancels the edit first, then moves focus.

## Error Handling

- Empty textarea on `Ctrl+Enter`: allowed — pastes an empty string (same as the existing clipboard behavior).
- `set_clipboard_text` failure: toast notification "Failed to copy to clipboard."

## What is NOT in scope

- Persisting the edited version to history (no "save" option — use Feature 1's transform picker for that).
- Edit mode for image entries.
- Undo/redo within the textarea beyond the browser's native support.
