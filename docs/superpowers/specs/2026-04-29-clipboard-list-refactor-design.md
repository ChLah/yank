# Clipboard List Refactor Design

**Date:** 2026-04-29
**Status:** Approved

## Problem

`ClipboardListComponent` has grown to ~1300 lines and handles three unrelated concerns in one file: the Recent/Pinned clipboard tab, the Snippets tab, and the shell layout. All state, keyboard handling, drag-drop, and data loading live in a single component, making it hard to reason about and change independently.

## Goal

Extract each tab into its own smart component with its own data loading, selection, keyboard handling, and drag-drop logic. The shell becomes a thin coordinator (~120 lines) that owns only layout, tab switching, and global keyboard shortcuts.

## Accepted Visual Change

The filter buttons (All / Text / Image) currently share the same horizontal band as the tab switcher. After this refactor they move inside `ClipboardTabComponent` and appear as a separate row below the tabs when on a clipboard tab. This is an intentional layout improvement.

---

## New Components

### `ClipboardTabComponent` (`clipboard-tab.component.ts`)

Smart component for the Recent and Pinned tabs.

**Exports:**
```ts
export type ClipboardTabType = 'recent' | 'pinned';
```

**Inputs:**
- `tab = input.required<ClipboardTabType>()`

**Owns:**
- Injects `ClipboardService`, `TauriBridgeService`, `Router`
- Subscribes to `TauriBridgeService.onPopupShown()` independently to reset own state
- Filter row UI and `activeFilter` signal
- Search bar UI and `isSearching` / `searchQuery` signals
- `filteredEntries`, `selectedIndex`, `editingEntryId`, `showTransformPicker`, `ocrLoadingEntryId`
- Calls `toast.error()` / `toast.success()` from `@spartan-ng/brain/sonner` directly for edit failures and OCR results
- Host `(keydown)`: all clipboard keys (arrows, Enter, Delete, Escape, Ctrl+P/E/O, digits, search chars); calls `event.stopPropagation()` for handled keys; Ctrl+Tab is NOT handled here and bubbles up to the shell

**Outputs:**
- `selectedEntry = output<ClipboardEntry | null>()` — emits the currently selected entry whenever selection changes; shell uses it to derive `showOcrHint` (`entry?.kind === 'image'`) for `ClipboardFooterHintsComponent`, and is available for any future per-entry shell behaviour

**Utility functions** (exported for unit testing, moved from `clipboard-list.component.ts`):
- `getQuickPasteDigit`
- `isOcrTrigger`
- `shouldCancelEditOnSelect`

---

### `SnippetsTabComponent` (`snippets-tab.component.ts`)

Smart component for the Snippets tab.

**Owns:**
- Injects `SnippetsService`, `TauriBridgeService`, `Injector`
- Subscribes to `TauriBridgeService.onPopupShown()` independently to reset own state
- All folder expand/collapse state
- All drag-drop (snippets within/between folders, folder reorder)
- Snippet CRUD (create, edit, delete via `SnippetItemComponent`, `NewSnippetFormComponent`)
- Folder CRUD (create, rename, delete via `SnippetFolderHeaderComponent`)
- Placeholder overlay (`PlaceholderOverlayComponent`)
- `snippetSelectedIndex`, `editingSnippetId`, `showNewSnippetForm`, `showPlaceholderOverlay`, `addingFolder`, `newFolderName`
- Host `(keydown)`: all snippet keys (arrows, Enter, Delete, Escape, N, E); calls `event.stopPropagation()` for handled keys; Ctrl+Tab is NOT handled here and bubbles up to the shell

---

### `SkeletonListComponent` (`shared/ui/skeleton-list/skeleton-list.component.ts`)

Presentational. Both tabs currently duplicate the animated skeleton loading markup.

**Inputs:**
- `count = input(5)` — number of skeleton rows to render

The two usages have slightly different width calculations; these are standardized to one pattern in the shared component.

---

### `ClipboardFooterHintsComponent` (`clipboard-footer-hints.component.ts`)

Presentational. Renders the two rows of clipboard keyboard hints.

**Inputs:**
- `showOcrHint = input(false)` — shows the `Ctrl+O` OCR hint when the selected entry is an image

---

### `SnippetsFooterHintsComponent` (`snippets-footer-hints.component.ts`)

Presentational. Renders the single row of snippet keyboard hints. No inputs.

---

## Modified Components

### `ClipboardListComponent` (shell, ~120 lines)

**Keeps:**
- Header block (inline, unchanged)
- `type TabType = 'snippets' | ClipboardTabType`
- `activeTab = signal<TabType>('recent')`
- `captureIsPaused` signal and `onCaptureSwitchChange()`
- Tab switcher row (3 buttons)
- `@if` / `@else` rendering `<app-clipboard-tab>` or `<app-snippets-tab>`
- Footer row: renders `<app-clipboard-footer-hints [showOcrHint]="showOcrHint()">` or `<app-snippets-footer-hints>` based on `activeTab()`
  - `showOcrHint = computed(() => this.selectedEntry()?.kind === 'image')` derived from `selectedEntry` output stored locally as a signal
- Window-move listener → `bridge.saveWindowPosition()`
- Host `(keydown)`: Ctrl+Tab only → cycles tabs, calls `event.stopPropagation()`

**Removes:**
- All clipboard entry state, snippet state, folder state, drag-drop logic
- `isSearching`, `searchQuery`, `activeFilter`, `filteredEntries`, etc.
- Inline toast/error banner markup (`duplicateError`, `editCopyFailed`, `ocrToast`)
- `handleKeyDown` delegation to tabs

**Note:** `duplicateError` signal to be investigated — it appears to never be set to `true` in the current code and may be dead code. Remove if confirmed unused.

---

### `app.ts`

Switch from `BrnSonnerImports` / `<brn-sonner-toaster>` to `HlmToasterImports` / `<hlm-toaster />` to match the spartan-ng recommended API.

---

## Shared Utilities

### `keyboard.utils.ts` (new, in `clipboard-list/` feature folder)

Exports `resolveEditModeAction` — the only keyboard utility shared between both tab components.

---

## Spec / Test Changes

`clipboard-list.component.spec.ts` currently tests four pure functions that are moving:

| Function | Moves to | Spec moves to |
|---|---|---|
| `resolveEditModeAction` | `keyboard.utils.ts` | `keyboard.utils.spec.ts` |
| `getQuickPasteDigit` | `clipboard-tab.component.ts` | `clipboard-tab.component.spec.ts` |
| `isOcrTrigger` | `clipboard-tab.component.ts` | `clipboard-tab.component.spec.ts` |
| `shouldCancelEditOnSelect` | `clipboard-tab.component.ts` | `clipboard-tab.component.spec.ts` |

`clipboard-list.component.spec.ts` becomes empty and should be removed.

---

## Final File Structure

```
src/app/
  app.ts                                         ← updated (hlm-toaster)
  shared/ui/skeleton-list/
    skeleton-list.component.ts                   ← NEW
    skeleton-list.component.spec.ts              ← NEW (optional)
  features/clipboard-list/
    clipboard-list.component.ts                  ← slimmed shell
    clipboard-list.component.spec.ts             ← REMOVED (tests move out)
    clipboard-tab.component.ts                   ← NEW
    clipboard-tab.component.spec.ts              ← NEW
    snippets-tab.component.ts                    ← NEW
    snippets-tab.component.spec.ts               ← NEW (optional)
    clipboard-footer-hints.component.ts          ← NEW (presentational, feature-scoped)
    snippets-footer-hints.component.ts           ← NEW (presentational, feature-scoped)
    keyboard.utils.ts                            ← NEW
    keyboard.utils.spec.ts                       ← NEW
    [all 14 existing files unchanged]
```

## Existing Files — Unchanged

All existing sub-components remain untouched:
`clipboard-entry.component.ts`, `clipboard-entry-tooltip.component.ts`, `snippet-item.component.ts`, `snippet-folder-header.component.ts`, `placeholder-overlay.component.ts`, `new-snippet-form.component.ts`, `transform-picker.component.ts` and their spec files.
