---
# Snippet Drag & Drop Reordering — Design Spec

**Date:** 2026-04-29
**Status:** Approved

## Overview

Allow users to reorder snippets in the Snippets tab by dragging rows via a grip handle. The new order is persisted to SQLite via a Tauri command. Snippets that have never been reordered retain their natural creation order without any extra work.

## Sort Order Strategy

`sort_order` remains `NOT NULL`, always assigned as `MAX(sort_order) + 1` on create (current behavior). Users who never drag see snippets in creation order — no schema change needed. On first drag, the backend normalizes any pre-existing gaps or duplicates by reassigning dense `0, 1, 2, ...` values.

## Backend

### New Tauri command: `reorder_snippet`

**Signature:** `(id: i64, new_index: usize) → ()`

**Logic (single transaction):**
1. Fetch all snippets ordered by `sort_order ASC, id ASC`
2. Remove the item with the given `id` from its current position
3. Insert it at `new_index` (clamped to valid range)
4. Reassign `sort_order = 0, 1, 2, ...` to all items in order

This normalizes any pre-existing duplicate or gapped sort orders on the first drag.

## Frontend

### `SnippetItemComponent`

- Apply `cdkDrag` as a host directive
- Add a `lucideGripVertical` icon on the far left, wrapped with `cdkDragHandle`
- Grip icon follows the same hover-visibility pattern as the existing delete button: `opacity-0 group-hover:opacity-100`
- Grip icon and `cdkDrag` are disabled when `editMode()` is true (no reordering during inline edit)

### `TauriBridgeService`

- Add `reorderSnippet(id: number, newIndex: number): Promise<void>`

### `SnippetsService`

- Add `reorderSnippet(reorderedArray: Snippet[], id: number, newIndex: number): Promise<void>`
  1. Optimistically updates `snippets.value.set(reorderedArray)` immediately
  2. Calls `bridge.reorderSnippet(id, newIndex)` in the background
  3. On error: calls `snippets.reload()` to restore the persisted order

### `ClipboardListComponent`

- Add `cdkDropList` to the snippet list container
- Handle `(cdkDropListDropped)` event:
  1. Extract `event.item.data` (the snippet `id`) and `event.currentIndex`
  2. Call `moveItemInArray` on a local copy of `allSnippets()`
  3. Call `snippetsService.reorderSnippet(reorderedArray, id, newIndex)`

## Edge Cases

| Case | Handling |
|---|---|
| Duplicate `sort_order` values | Normalized to dense integers on first drag |
| Drag while in edit mode | Grip handle hidden; `cdkDrag` disabled |
| Click vs drag conflict | `cdkDragHandle` scopes drag to grip icon only |
| Backend error | `snippets.reload()` restores pre-drag order |

## What is NOT in scope

- Keyboard-based reordering (Alt+Up/Down or similar)
- Drag & drop across tabs
- Drag & drop for clipboard entries or pinned items
