# Entry Hover Tooltip Design

**Date:** 2026-04-28
**Status:** Approved

## Overview

Show a rich hover card when the user hovers over a clipboard or snippet entry in the list. The card previews extended text content and displays metadata (dates, source app, character count, dimensions) that is otherwise hidden in the compact list row.

## Goals

- Surface enough context that the user can identify an entry without clicking it
- Keep it non-intrusive: appears only on mouse hover with a short delay, never interferes with keyboard navigation or edit mode
- Consistent with the existing spartan.ng / helm pattern used throughout the project

## Architecture

### Hover-card library path fix

The spartan CLI generated the hover-card helm wrappers at `src/libs/ui/hover-card/hover-card/src/` (double-nested). Move all files one level up to `src/libs/ui/hover-card/src/` to match the standard layout of every other ui lib (`button/src/`, `tabs/src/`, etc.), and update the tsconfig path alias accordingly:

```
"@spartan-ng/helm/hover-card": ["./src/libs/ui/hover-card/src/index.ts"]
```

### New component: `ClipboardEntryTooltipComponent`

File: `src/app/features/clipboard-list/clipboard-entry-tooltip.component.ts`

- `entry = input.required<ClipboardEntry>()`
- Renders the card body — no trigger logic, no overlay setup
- Computed signals:
  - `formattedCreatedAt` — `Intl.DateTimeFormat` (e.g. "Apr 28, 2026") from `entry().createdAt * 1000`
  - `formattedLastUsedAt` — same for `entry().lastUsedAt`
  - `charCount` — `entry().content?.length ?? 0`
- Imports `HlmHoverCardContent` for card styling
- Imports `NgIcon` / `HlmIcon` for metadata row icons (lucide icons already available in the feature)
- Imports `TranslatePipe` for i18n labels

### Changes to `ClipboardEntryComponent`

- Import `HlmHoverCardTrigger` from `@spartan-ng/helm/hover-card`
- Import `ClipboardEntryTooltipComponent`
- Wrap the outer row `<div>` with `[hlmHoverCardTrigger]`
- Bind `[hlmHoverCardTriggerFor]` to a `<ng-template #entryCard>` that contains `<app-clipboard-entry-tooltip [entry]="entry()" />`
- Disable hover card when in edit mode or OCR is loading: `[hlmHoverCardTriggerFor]="editMode() || ocrLoading() ? undefined : entryCard"`
- Set `[showDelay]="600"` and `[hideDelay]="200"`

No changes to `ClipboardListComponent`.

## Tooltip Content

### Text entry

```
┌─────────────────────────────────┐
│ (full content preview,          │
│  up to 8 lines, monospace,      │
│  break-all for long words)      │
├─────────────────────────────────┤
│ 🔖 Pinned           (if pinned) │
│ ⬛ ScreenshotTool   (sourceApp) │
│ # 142 characters               │
│ 🕒 Last used: Apr 28, 2026     │
│ 📅 Added: Apr 27, 2026         │
└─────────────────────────────────┘
```

### Image entry

```
┌─────────────────────────────────┐
│ 🔖 Pinned           (if pinned) │
│ ⬛ ScreenshotTool   (sourceApp) │
│ 📐 1920 × 1080                  │
│ 🕒 Last used: Apr 28, 2026     │
│ 📅 Added: Apr 27, 2026         │
└─────────────────────────────────┘
```

Fields are omitted when their value is absent (e.g. no source app row if `sourceApp` is null).

## Styling

- Card width: `w-72` (slightly wider than default `w-64` to comfortably show content)
- Content preview: `text-[11px] font-mono leading-relaxed line-clamp-8 break-all text-foreground/80`
- Separator between preview and metadata: `border-t border-border my-2.5`
- Metadata rows: `flex items-center gap-2 text-[11px] text-muted-foreground` with small lucide icons
- Animations and positioning are handled by the `HlmHoverCardContent` directive (already includes `data-[state=open]:animate-in` etc.)

## i18n

Add translation keys for tooltip metadata labels:

```
TOOLTIP.PINNED
TOOLTIP.CHARACTERS
TOOLTIP.LAST_USED
TOOLTIP.ADDED
```

Existing keys can be used where they overlap (e.g. `ENTRY.IMAGE` for the image type label).

## Out of Scope

- Hover tooltips for snippet items (`SnippetItemComponent`) — not requested
- Rich image preview inside the tooltip — already handled by the existing preview page
- Keyboard-accessible tooltip — the hover card is mouse-only; keyboard users navigate with arrow keys and can see full content via the preview route
