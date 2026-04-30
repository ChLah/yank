# Snippet Mutation Design

**Date:** 2026-04-30
**Status:** Approved

## Problem

`SnippetsService` contains four methods that each implement the same optimistic-update pattern: apply a transformation to a local signal, persist via the bridge, and recover on failure. The pattern is duplicated across `reorderSnippet`, `moveSnippetToFolder`, `moveAndReorderSnippet`, and `reorderFolder` — with subtle differences in each copy. A bug in the pattern must be found and fixed in every variant.

Additionally, the current failure recovery calls `resource.reload()` — a full refetch from the backend. This is slower than necessary: the previous state is already in memory.

Finally, the transformation logic (computing reordered arrays, computing post-move arrays) is embedded inside async methods, making it impossible to test without an async context, a live service, and bridge mocks.

## Goal

- Extract one generic `applyOptimistically<T>()` helper used by all mutation methods
- Replace `reload()` on failure with a true rollback (`signal.set(previous)`)
- Extract transformation logic as exported pure functions, independently testable

## Decisions

| Question | Decision |
|---|---|
| Helper shape | Receives a `WritableSignal<T>`, a transform `(current: T) => T`, and a `persist: () => Promise<void>`. Applies transform, awaits persist, rolls back on error. |
| Generic vs snippets-only | Generic over the signal's value type, so `_folders` mutations use the same helper. |
| Failure recovery | True rollback: `signal.set(previous)` instead of `resource.reload()`. Faster, no network round trip. |
| Transform functions | Exported pure functions in a separate `snippet-mutations.ts` file. Tested independently. |

---

## Helper signature

```ts
private async applyOptimistically<T>(
  target: WritableSignal<T | undefined>,
  transform: (current: T) => T,
  persist: () => Promise<void>,
): Promise<void> {
  const previous = target.value();
  if (previous === undefined) return;
  target.value.set(transform(previous));
  try {
    await persist();
  } catch {
    target.value.set(previous);
  }
}
```

---

## Exported pure transform functions

```ts
// snippet-mutations.ts

export function computeReorderSnippets(
  snippets: Snippet[],
  id: number,
  newIndex: number,
): Snippet[];

export function computeMoveSnippetToFolder(
  snippets: Snippet[],
  snippetId: number,
  targetFolderId: number | null,
): Snippet[];

export function computeMoveAndReorderSnippet(
  snippets: Snippet[],
  snippetId: number,
  targetFolderId: number | null,
  newIndex: number,
): Snippet[];

export function computeReorderFolders(
  folders: SnippetFolder[],
  id: number,
  newIndex: number,
): SnippetFolder[];
```

Each function is a pure `(T[], ...args) => T[]` — no async, no service, no signals. The existing `moveItem` helper in `snippets.service.ts` moves here as a non-exported utility.

---

## How mutation methods simplify

**Before (`reorderSnippet`):**
```ts
async reorderSnippet(id: number, newIndex: number): Promise<void> {
  const snippets = this._snippets.value() ?? [];
  const snippet = snippets.find((s) => s.id === id);
  if (!snippet) return;
  const inFolder = snippets
    .filter((s) => s.folderId === snippet.folderId)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const reordered = moveItem(inFolder, inFolder.findIndex((s) => s.id === id), newIndex);
  const updatedById = new Map(reordered.map((s, i) => [s.id, i]));
  const updated = snippets.map((s) =>
    updatedById.has(s.id) ? { ...s, sortOrder: updatedById.get(s.id)! } : s,
  );
  this._snippets.value.set(updated);
  try {
    await this.bridge.reorderSnippet(id, newIndex);
  } catch {
    this._snippets.reload();
  }
}
```

**After:**
```ts
async reorderSnippet(id: number, newIndex: number): Promise<void> {
  await this.applyOptimistically(
    this._snippets,
    (s) => computeReorderSnippets(s, id, newIndex),
    () => this.bridge.reorderSnippet(id, newIndex),
  );
}
```

---

## Test surface

Pure transform functions are tested without any Angular or async infrastructure:

```ts
it('moves item within its folder and recalculates sortOrder', () => {
  const snippets = [
    { id: 1, folderId: null, sortOrder: 0 },
    { id: 2, folderId: null, sortOrder: 1 },
    { id: 3, folderId: null, sortOrder: 2 },
  ];
  const result = computeReorderSnippets(snippets, 1, 2);
  expect(result.find(s => s.id === 1)?.sortOrder).toBe(2);
  expect(result.find(s => s.id === 3)?.sortOrder).toBe(1);
});
```

The `applyOptimistically` helper is tested via the service with a mocked bridge — verifying that on throw the signal is restored to its previous value.

---

## File location

```
src/app/core/services/snippets.service.ts          ← simplified, uses helper
src/app/core/utils/snippet-mutations.ts            ← NEW: exported pure transforms
src/app/core/utils/snippet-mutations.spec.ts       ← NEW: pure function tests
```
