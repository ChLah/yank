---
# Quick-Paste Number Shortcuts — Design Spec

**Date:** 2026-04-27
**Status:** Approved

## Overview

`Ctrl+1` through `Ctrl+9` paste the Nth visible entry directly, without navigating the list. This is the fastest possible paste path for recent items and reinforces YANK's keyboard-driven identity.

## Behaviour

| Key | Action |
|---|---|
| `Ctrl+1` | Paste the 1st entry in the current visible list |
| `Ctrl+2` | Paste the 2nd entry |
| … | … |
| `Ctrl+9` | Paste the 9th entry |

"Visible list" means the currently filtered and displayed entries — if a search is active, `Ctrl+1` pastes the first search result, not the first history item.

If fewer than N entries are visible, the keypress is a no-op (no error, no sound).

The shortcut works on both the **Recent** tab and the **Pinned** tab. It does **not** work on the **Snippets** tab (see Snippets spec — snippets have their own paste flow).

## Conflict with Search

`Ctrl+digit` does not conflict with the existing "any character starts a search" behaviour because the `Ctrl` modifier is checked first. Search typing only fires on unmodified character keys.

## Implementation

### Frontend only — no new Tauri command needed

`ClipboardListComponent` intercepts `keydown` at the host level. Add a branch:

```
if (event.ctrlKey && !event.shiftKey && !event.altKey && !event.metaKey) {
  const digit = parseInt(event.key, 10);
  if (digit >= 1 && digit <= 9) {
    const entry = this.visibleEntries()[digit - 1];
    if (entry) this.pasteEntry(entry);
    event.preventDefault();
    return;
  }
}
```

`visibleEntries()` is the same computed signal already driving the rendered list. `pasteEntry()` is the same method called by `Enter`. No new logic required.

## What is NOT in scope

- `Ctrl+0` (ambiguous — leave unbound).
- Visual number badges on entry cards (adds clutter; the shortcuts are discoverable via keyboard hint or docs).
- Number shortcuts in selection mode (selection mode has its own `Enter`/`Delete` contract).
