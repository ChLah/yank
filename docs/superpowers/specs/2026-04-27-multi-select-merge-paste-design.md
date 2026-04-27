# Multi-Select & Merge Paste — Design Spec

**Date:** 2026-04-27  
**Status:** Approved

## Overview

Users can enter a selection mode within the clipboard list to select multiple entries, then either merge-paste all selected text entries (joined by newline) or batch-delete them. Selection mode is explicit — triggered by a keypress — so normal list navigation is never affected.

## Selection Mode

### Enter / Exit

| Action | Result |
|---|---|
| `Space` on any entry | Toggles that entry selected; enters selection mode if not already in it |
| `Escape` | Clears all selections and exits selection mode |

### Selecting Items

| Key / Gesture | Behavior |
|---|---|
| `Space` | Toggle focused entry selected/deselected |
| `Ctrl+Space` | Same as `Space` (explicit individual toggle) |
| `Ctrl+click` | Toggle clicked entry without affecting others |
| `Shift+↑` / `Shift+↓` | Extend selection range from anchor to current position |
| `Shift+click` | Extend selection range from anchor to clicked entry |
| `Ctrl+A` | Select all visible entries |

Arrow keys (`↑`/`↓` without modifiers) move focus without changing selection in selection mode.

### Anchor

The anchor is the entry that was focused when selection mode was entered (or the last item toggled individually). Range selections (`Shift`) extend from the anchor.

## UI

- Checkboxes appear on all entry cards while in selection mode.
- Selected entries show a filled checkbox + subtle background highlight.
- A status bar replaces the keyboard hints footer:  
  `{n} items selected — Enter to paste · Del to delete · Esc to cancel`
- The status bar updates reactively as selection changes.

## Merge Paste

`Enter` while in selection mode:

1. Collect all selected entries that are **text** kind, in list display order (top to bottom).
2. Concatenate their `content` values joined by `\n`.
3. Call `TauriBridgeService.setClipboardText(mergedText)` (the new command introduced in Feature 4).
4. Exit selection mode (clear selection).
5. Hide popup.

Image entries in the selection are silently skipped. If the resulting merged string is empty (only images were selected), nothing is pasted and a brief toast shows "No text entries selected."

## Batch Delete

`Delete` while in selection mode:

1. Collect all selected entry ids.
2. Call `TauriBridgeService.deleteEntries(ids: number[])` (new batch command, or sequential individual deletes — see below).
3. Exit selection mode.
4. Refresh the entries list.

### New Tauri Command

`delete_entries(ids: Vec<i64>) → Result<(), String>`

- Deletes all entries with the given ids in a single SQL `DELETE WHERE id IN (...)`.
- More efficient than calling `delete_entry` N times from the frontend.

## Availability

Selection mode is available on:
- **Recent** tab
- **Pinned** tab

Selection mode is **not available** during active search (search mode and selection mode are mutually exclusive — entering search cancels selection).

## State Management

`ClipboardListComponent` gains:

- `selectionMode: signal<boolean>`
- `selectedIds: signal<Set<number>>`
- `anchorId: signal<number | null>`

These are reset on: tab switch, search activation, popup hide event.

## Interaction with Other Features

- **Inline edit (Feature 4):** Entering edit mode on an entry while in selection mode cancels selection mode first.
- **Transform picker (Feature 1):** `Shift+Enter` in selection mode is ignored (transform applies to a single entry only).
- **Pinning:** `P` key in selection mode does nothing (no batch pin in this scope).

## Error Handling

- All-image selection on `Enter`: toast "No text entries selected."
- `delete_entries` failure: toast "Failed to delete entries." No partial state — the command is atomic.
- Empty selection on `Enter` or `Delete`: no-op (status bar already shows count so this shouldn't happen in practice).

## What is NOT in scope

- Batch pin/unpin.
- Configurable merge separator (line break only for now).
- Selection mode during search.
- Drag-to-reorder in selection mode.
