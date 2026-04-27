# Inline Edit Before Paste — Design Spec

**Date:** 2026-04-27  
**Status:** Approved

## Overview

Users can press `E` on a selected text entry to expand it into an editable textarea, make quick changes, and immediately paste the edited content via `Enter`. The original history entry is never modified — the edit is always ephemeral.

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
- A small hint below the textarea: `Enter to paste · Esc to cancel`

## Keyboard

| Key | Action |
|---|---|
| `E` | Enter edit mode on focused entry |
| `Shift+Enter` | Insert newline |
| `Enter` | Paste edited content + close popup |
| `Escape` | Cancel edit, collapse back to normal entry view |
| `Tab` | Move focus to next focusable element (exits edit mode — treated as cancel) |

Clicking on a different entry also cancels the edit (no changes made).

## Paste Behavior

On `Enter` (without Shift):

1. Read current textarea value.
2. Call `TauriBridgeService.setClipboardText(text)` with the edited text.
3. Hide popup via `TauriBridgeService.hidePopup()`.
4. The stored entry in the DB is **not modified**.

> Note: The original draft referenced `Ctrl+Enter` and `set_clipboard(entryId)` with an override. The implemented approach uses plain `Enter` (matching the keyboard table) and the already-available `set_clipboard_text(text)` command.

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

- Empty textarea on `Enter`: allowed — pastes an empty string (same as the existing clipboard behavior).
- `set_clipboard_text` failure: toast notification "Failed to copy to clipboard."

## What is NOT in scope

- Persisting the edited version to history (no "save" option — use Feature 1's transform picker for that).
- Edit mode for image entries.
- Undo/redo within the textarea beyond the browser's native support.
