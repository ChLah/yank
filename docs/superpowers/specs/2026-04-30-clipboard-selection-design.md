# ClipboardSelection Design

**Date:** 2026-04-30
**Status:** Approved

## Problem

`ClipboardTabComponent` manages selection state through a mix of local signals (`selectedIndex`, `editingEntryId`) mutated from at least seven places: arrow navigation, filter changes, search input, entry deletion, edit confirm, edit cancel, and popup reset. The logic that governs *how* selection changes — clamp on entries change, move to previous on delete, reset on filter/search — is the core behaviour of the tab, but it is woven into a 509-line component alongside rendering, keyboard handling, and infrastructure calls. It cannot be tested without mounting the full component.

## Goal

Extract selection and edit-mode state into a plain `ClipboardSelection` class that:
- Owns `selectedIndex`, `selectedEntry`, `editingEntry` as computed signals
- Accepts the entries list as a `Signal<ClipboardEntry[]>` and reacts to changes automatically
- Provides a small, stable imperative API for navigation and edit mode
- Is instantiated by the component — no Angular DI, no `TestBed` required to test

## Decisions

| Question | Decision |
|---|---|
| Injectable vs plain class | Plain class. Instantiated by the component via `new ClipboardSelection(entries)`. Fully testable with `new`. |
| How entries are received | Constructor takes `Signal<ClipboardEntry[]>`. Class uses `computed()` internally to derive state. |
| Behaviour on entries change | Always reset to index 0. No attempt to preserve selection by id. |
| Edit mode | Included in `ClipboardSelection`. `enterEditMode()` / `exitEditMode()` live here alongside navigation. |

---

## Interface

```ts
export class ClipboardSelection {
  constructor(entries: Signal<ClipboardEntry[]>);

  // Read
  readonly selectedIndex: Signal<number>;
  readonly selectedEntry: Signal<ClipboardEntry | null>;
  readonly editingEntry: Signal<ClipboardEntry | null>;

  // Navigation
  moveUp(): void;
  moveDown(): void;
  selectAt(index: number): void;

  // Edit mode
  enterEditMode(): void;   // enters edit mode for the currently selected entry (text only)
  exitEditMode(): void;
}
```

---

## Behaviour contract

- `selectedIndex` is always clamped to `[0, entries.length - 1]`. When entries become empty it is `0`.
- When `entries` changes (new signal value), `selectedIndex` resets to `0` and `editingEntry` is cleared.
- `moveUp()` / `moveDown()` clamp at the boundaries — no wrap-around.
- `enterEditMode()` is a no-op if the selected entry is not a text entry, or if entries is empty.
- `exitEditMode()` clears editing state; navigation resumes normally.
- `selectAt(index)` clamps the provided index before setting it.

---

## What moves out of ClipboardTabComponent

| Before | After |
|---|---|
| `selectedIndex = signal(0)` | `selection.selectedIndex` |
| `editingEntryId = signal<number \| null>(null)` | `selection.editingEntry` |
| `selectedIndex.set(0)` in `setFilter()` | `selection.selectAt(0)` |
| `selectedIndex.set(0)` in `onSearchInput()` | handled by entries signal change |
| `selectedIndex.set(...)` in `deleteEntry()` | `selection.moveUp()` or no-op |
| `editingEntryId.set(entry.id)` in `enterEditMode()` | `selection.enterEditMode()` |
| `editingEntryId.set(null)` in `onEditCancel()` | `selection.exitEditMode()` |
| `emitSelectedEntry()` | reads `selection.selectedEntry()` |

---

## Impact on ClipboardTabComponent

`ClipboardTabComponent` instantiates `ClipboardSelection` as a field:

```ts
private selection = new ClipboardSelection(this.filteredEntries);
```

The component's `onKeyDown`, `selectEntry`, `deleteEntry`, and `resetState` methods shrink to delegates that call `selection.*` and then act on `selection.selectedEntry()`.

`editingEntryId` is removed from the component entirely. The template binds to `selection.editingEntry()?.id` instead.

---

## Test surface

```ts
const entries = signal<ClipboardEntry[]>([...]);
const sel = new ClipboardSelection(entries);

sel.moveDown();
expect(sel.selectedIndex()).toBe(1);

entries.set([]);
expect(sel.selectedIndex()).toBe(0);
expect(sel.editingEntry()).toBeNull();
```

No Angular TestBed. No DOM. No services. All behaviour is testable through the public API.

---

## File location

```
src/app/features/clipboard-list/clipboard-selection.ts
src/app/features/clipboard-list/clipboard-selection.spec.ts
```
