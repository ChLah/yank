# Text Transformations Before Paste — Design Spec

**Date:** 2026-04-27  
**Status:** Approved

## Overview

When a user wants to paste a text clipboard entry in a modified form, they can open a transformation picker via `Shift+Enter`. A small overlay lists available transforms. The user selects one, optionally ticks "Save to history", and the transformed text is written to the clipboard and the popup closes.

All transforms are implemented as pure TypeScript functions in the frontend — no new Tauri commands are needed.

## Trigger

- `Shift+Enter` on a selected **text** entry opens the transform picker.
- Ignored on image entries.

## UI

A small overlay panel renders in-place, positioned below (or above if near the bottom) the selected entry card. It contains:

1. A keyboard-navigable list of transform options (arrow keys + Enter to apply, Escape to cancel).
2. A "Save to history" checkbox at the bottom (default: **unchecked**).

The overlay closes on: transform applied, `Escape`, or click outside.

## Transforms

| Name | Behavior |
|---|---|
| Strip whitespace | `trim()` + collapse internal whitespace runs to single space |
| UPPERCASE | `toUpperCase()` |
| lowercase | `toLowerCase()` |
| Title Case | Capitalize first letter of each word |
| URL Encode | `encodeURIComponent()` |
| URL Decode | `decodeURIComponent()` |
| JSON Format | `JSON.parse()` + `JSON.stringify(value, null, 2)` — shows error state if not valid JSON |
| Strip HTML | Replace all `<[^>]+>` tags with empty string |

Only one transform can be applied per paste operation.

## Save to History

- **Unchecked (default):** The transformed text is written to the clipboard via the existing `set_clipboard` Tauri command. The stored entry is not modified.
- **Checked:** Additionally, `update_entry_content` (new Tauri command) is called to update the entry's `content` field in the DB to the transformed text in-place (same `id`, `hash` is recalculated).

## Data Flow

```
Shift+Enter
  → TransformPickerComponent opens (overlay)
  → User picks transform + optionally checks "Save to history"
  → Enter confirms
  → TransformService.apply(transform, content) → transformed string
  → TauriBridgeService.setClipboardText(transformedText)  [new command, see below]
  → if "Save to history": TauriBridgeService.updateEntryContent(id, transformedText)
  → popup hides
```

## New Tauri Commands

`set_clipboard_text(text: string) → Result<(), String>`

- Writes the given string directly to the system clipboard.
- Does not create a new DB entry.
- **Shared with Feature 4 (Inline Edit)** — implement once, reuse across both features.

`update_entry_content(id: number, content: string) → Result<(), String>` (conditional path only)

- Recalculates SHA256 hash of new content.
- Updates `content` and `hash` columns for the given entry id.
- On hash collision (duplicate already exists): returns an error; frontend shows a brief toast.

## Components

- **`TransformPickerComponent`** — standalone overlay, receives `content: string` as input, emits `(apply, saveToHistory)` output. Handles its own keyboard navigation.
- **`TransformService`** — pure functions, no state, easily unit-testable.

## Error Handling

- **JSON Format on invalid JSON:** The "JSON Format" option is shown but applying it shows an inline error message within the picker ("Not valid JSON") without closing the picker.
- **URL Decode on invalid encoding:** Catches `URIError`, shows inline error.
- **`update_entry_content` hash collision:** Toast notification "A duplicate entry already exists." Entry is not saved, but paste still proceeds.

## What is NOT in scope

- Chaining multiple transforms.
- Custom user-defined transforms.
- Transforms for image entries.
