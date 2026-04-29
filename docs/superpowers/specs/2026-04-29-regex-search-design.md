# Regex Search — Design Spec

**Date:** 2026-04-29

---

## Overview

Extend the existing search bar with an opt-in regex mode. When active, the search input is interpreted as a regular expression instead of a plain substring. The feature applies to both the clipboard history and snippets tabs — whichever is currently visible.

---

## Toggle

A small `.*` button sits inside the right edge of the search bar (same row, similar to how VS Code and browser dev tools place their regex toggle).

- **Inactive (plain text mode):** button is visually muted (secondary/ghost style)
- **Active (regex mode):** button is visually highlighted (primary/accent style), matching the existing active-filter pattern in the UI

The toggle is a runtime state — it resets to off when the popup closes, consistent with other transient UI state in Yank.

---

## Search Behaviour in Regex Mode

- The input value is compiled as a JavaScript `RegExp` with the `i` flag (case-insensitive), consistent with the existing plain-text search which is case-insensitive.
- The regex is tested against the same fields as the current plain-text search (entry content for history; title + content for snippets).
- An empty search input shows all entries regardless of mode.

---

## Invalid Regex Handling

When the current input is not a valid regex:

1. The search bar border turns **red** (e.g., `border-destructive`) as an inline error indicator.
2. The results list keeps displaying the last **valid** results (or all entries if no valid regex has been entered yet in this session).
3. No error message or toast — the red border is the sole signal. It disappears as soon as the input becomes a valid regex again.

---

## UI Changes

| Element | Change |
|---|---|
| Search bar container | Add `.*` toggle button on the right side inside the input area |
| Search bar border | Conditionally apply `border-destructive` when regex mode is on and input is invalid |
| `.*` button | Ghost when inactive, accent/primary when active |

---

## State

Two new pieces of local component state in `ClipboardListComponent` (or wherever search state lives):

```ts
regexMode: boolean = false;          // toggled by the .* button
lastValidRegex: RegExp | null = null; // updated whenever input compiles successfully
isRegexInvalid: boolean = false;      // true when regexMode && input is non-empty && compile fails
```

No persistence — all three reset when the popup closes.

---

## Filtering Logic (pseudocode)

```ts
function filterEntries(entries, query, regexMode) {
  if (!query) return entries;
  if (!regexMode) return entries.filter(e => e.content?.toLowerCase().includes(query.toLowerCase()));

  try {
    const rx = new RegExp(query, 'i');
    lastValidRegex = rx;
    isRegexInvalid = false;
    return entries.filter(e => e.content && rx.test(e.content));
  } catch {
    isRegexInvalid = true;
    return lastValidRegex
      ? entries.filter(e => e.content && lastValidRegex.test(e.content))
      : entries;
  }
}
```

---

## Components Affected

| Layer | Change |
|---|---|
| `ClipboardListComponent` | Add `regexMode`, `lastValidRegex`, `isRegexInvalid` state; update filter logic; add `.*` button to search bar template; conditionally apply `border-destructive` |
| i18n (`en.ts`, `de.ts`) | Add `aria-label` key for the `.*` toggle button (e.g., `SEARCH.REGEX_TOGGLE`) |

No backend changes required — filtering is done client-side.

---

## Out of Scope

- Case-sensitive toggle (always case-insensitive, consistent with plain search)
- Regex search history or saved patterns
- Highlighting matched substrings within entry content
- Persisting regex mode across sessions
