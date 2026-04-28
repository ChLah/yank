---
# Quick-Paste Shortcut Index Indicators — Design Spec

**Date:** 2026-04-28
**Status:** Approved

## Overview

Show shortcut indices (1–9) on clipboard entries so users can see at a glance which `Ctrl+N` key maps to which entry, without disrupting the visual alignment of entries beyond position 9.

## Approach: Fixed-Width Left Gutter

Reserve a fixed 20px gutter to the left of every entry. Entries 1–9 render their digit inside the gutter. Entries 10+ leave the gutter empty. Because the gutter is always present, all entries share identical left indent — no alignment shift for rows beyond 9.

```
 1  First copied item          📌 ✕
 2  Second copied item         📌 ✕
 3  Third copied item          📌 ✕
    Eleventh copied item       📌 ✕   ← gutter empty, same indent
```

## Component Changes

### `ClipboardEntryComponent`

Add a new optional input:

```typescript
shortcutIndex = input<number | null>(null);
```

Prepend a gutter span inside the existing flex container. Adjust left padding from `pl-3.5` to `pl-1.5` — the gutter absorbs the visual breathing room:

```html
<div class="flex items-center gap-2 pl-1.5 pr-3 …">
  <span class="w-5 shrink-0 text-[11px] text-muted-foreground font-mono tabular-nums text-right select-none">
    @if (shortcutIndex() !== null) { {{ shortcutIndex() }} }
  </span>
  <!-- existing content unchanged -->
</div>
```

Styling rationale:
- `w-5` (20px) — fits a single digit with room; `shrink-0` prevents compression
- `text-[11px] text-muted-foreground` — matches secondary metadata text elsewhere in the entry
- `font-mono tabular-nums` — consistent with time/size values in the entry
- `text-right` — digit aligns toward content, feels like a label pointing right
- `select-none` — prevents accidental selection on double-click

### `ClipboardListComponent`

Pass the index in the template loop (no logic change):

```html
<app-clipboard-entry
  [shortcutIndex]="i < 9 ? i + 1 : null"
  …
/>
```

`i` is the zero-based `$index` from the `@for` loop; `i + 1` maps it to the 1-based shortcut key.

## Scope

| Area | Included |
|---|---|
| Recent tab | Yes |
| Pinned tab | Yes (shortcuts work there per spec) |
| Snippets tab | No (shortcuts not supported there per spec) |
| Ctrl-held reveal | No — always visible |

## What Is NOT in Scope

- Animating the digit in/out on Ctrl press
- Showing a full `Ctrl+N` badge (adds width; digit alone is sufficient)
- Any change to the shortcut logic itself (already implemented)
