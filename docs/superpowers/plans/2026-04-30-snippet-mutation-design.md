# Snippet Mutation Design Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract duplicated optimistic-update logic into a generic helper and move transformation logic into independently testable pure functions.

**Architecture:** Pure transform functions live in `snippet-mutations.ts` alongside a non-exported `moveItem` utility. The service gains a private `applyOptimistically<T>` helper that captures the previous signal value, applies the transform, awaits the persist call, and rolls back via `signal.set(previous)` on error — no full refetch.

**Tech Stack:** Angular 21 signals (`WritableSignal`, `resource`), TypeScript, Vitest

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `src/app/core/utils/snippet-mutations.ts` | **Create** | 4 exported pure transform functions + private `moveItem` utility |
| `src/app/core/utils/snippet-mutations.spec.ts` | **Create** | Vitest specs for all 4 pure functions |
| `src/app/core/services/snippets.service.ts` | **Modify** | Add `applyOptimistically` helper, simplify 4 mutation methods, update imports, remove `moveItem` |

---

### Task 1: computeReorderSnippets

**Files:**
- Create: `src/app/core/utils/snippet-mutations.spec.ts`
- Create: `src/app/core/utils/snippet-mutations.ts`

- [ ] **Step 1: Write the failing test**

Create `src/app/core/utils/snippet-mutations.spec.ts`:

```ts
import { computeReorderSnippets } from './snippet-mutations';
import { Snippet } from '../models/snippet.model';

function makeSnippet(partial: Partial<Snippet>): Snippet {
  return {
    id: 0,
    title: '',
    content: '',
    createdAt: 0,
    sortOrder: 0,
    folderId: null,
    ...partial,
  };
}

describe('computeReorderSnippets', () => {
  it('moves item within its folder and recalculates sortOrder', () => {
    const snippets = [
      makeSnippet({ id: 1, folderId: null, sortOrder: 0 }),
      makeSnippet({ id: 2, folderId: null, sortOrder: 1 }),
      makeSnippet({ id: 3, folderId: null, sortOrder: 2 }),
    ];
    const result = computeReorderSnippets(snippets, 1, 2);
    expect(result.find((s) => s.id === 1)?.sortOrder).toBe(2);
    expect(result.find((s) => s.id === 2)?.sortOrder).toBe(0);
    expect(result.find((s) => s.id === 3)?.sortOrder).toBe(1);
  });

  it('does not affect snippets in other folders', () => {
    const snippets = [
      makeSnippet({ id: 1, folderId: null, sortOrder: 0 }),
      makeSnippet({ id: 2, folderId: null, sortOrder: 1 }),
      makeSnippet({ id: 3, folderId: 10, sortOrder: 0 }),
    ];
    const result = computeReorderSnippets(snippets, 1, 1);
    expect(result.find((s) => s.id === 3)?.folderId).toBe(10);
    expect(result.find((s) => s.id === 3)?.sortOrder).toBe(0);
  });

  it('returns unchanged array when snippet id is not found', () => {
    const snippets = [makeSnippet({ id: 1, sortOrder: 0 })];
    const result = computeReorderSnippets(snippets, 99, 0);
    expect(result).toEqual(snippets);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```
pnpm test
```
Expected: FAIL — `Cannot find module './snippet-mutations'`

- [ ] **Step 3: Create snippet-mutations.ts with computeReorderSnippets**

Create `src/app/core/utils/snippet-mutations.ts`:

```ts
import { Snippet } from '../models/snippet.model';
import { SnippetFolder } from '../models/snippet-folder.model';

function moveItem<T>(arr: T[], from: number, to: number): T[] {
  const result = [...arr];
  const [item] = result.splice(from, 1);
  result.splice(to, 0, item);
  return result;
}

export function computeReorderSnippets(snippets: Snippet[], id: number, newIndex: number): Snippet[] {
  const snippet = snippets.find((s) => s.id === id);
  if (!snippet) return snippets;
  const inFolder = snippets
    .filter((s) => s.folderId === snippet.folderId)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const reordered = moveItem(inFolder, inFolder.findIndex((s) => s.id === id), newIndex);
  const updatedById = new Map(reordered.map((s, i) => [s.id, i]));
  return snippets.map((s) => (updatedById.has(s.id) ? { ...s, sortOrder: updatedById.get(s.id)! } : s));
}
```

- [ ] **Step 4: Run test to verify it passes**

```
pnpm test
```
Expected: PASS for all `computeReorderSnippets` tests

- [ ] **Step 5: Commit**

```bash
git add src/app/core/utils/snippet-mutations.ts src/app/core/utils/snippet-mutations.spec.ts
git commit -m "feat: add computeReorderSnippets pure function with tests"
```

---

### Task 2: computeMoveSnippetToFolder

**Files:**
- Modify: `src/app/core/utils/snippet-mutations.spec.ts`
- Modify: `src/app/core/utils/snippet-mutations.ts`

- [ ] **Step 1: Add failing tests**

In `snippet-mutations.spec.ts`, update the import line to:

```ts
import { computeReorderSnippets, computeMoveSnippetToFolder } from './snippet-mutations';
```

Then append at the end of the file:

```ts
describe('computeMoveSnippetToFolder', () => {
  it('updates folderId of the target snippet', () => {
    const snippets = [
      makeSnippet({ id: 1, folderId: null }),
      makeSnippet({ id: 2, folderId: null }),
    ];
    const result = computeMoveSnippetToFolder(snippets, 1, 10);
    expect(result.find((s) => s.id === 1)?.folderId).toBe(10);
  });

  it('does not modify other snippets', () => {
    const snippets = [
      makeSnippet({ id: 1, folderId: null }),
      makeSnippet({ id: 2, folderId: null }),
    ];
    const result = computeMoveSnippetToFolder(snippets, 1, 10);
    expect(result.find((s) => s.id === 2)?.folderId).toBeNull();
  });

  it('sets folderId to null when moving to general', () => {
    const snippets = [makeSnippet({ id: 1, folderId: 10 })];
    const result = computeMoveSnippetToFolder(snippets, 1, null);
    expect(result.find((s) => s.id === 1)?.folderId).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```
pnpm test
```
Expected: FAIL — `computeMoveSnippetToFolder is not a function`

- [ ] **Step 3: Implement computeMoveSnippetToFolder**

Append to `snippet-mutations.ts`:

```ts
export function computeMoveSnippetToFolder(
  snippets: Snippet[],
  snippetId: number,
  targetFolderId: number | null,
): Snippet[] {
  return snippets.map((s) => (s.id === snippetId ? { ...s, folderId: targetFolderId } : s));
}
```

- [ ] **Step 4: Run test to verify it passes**

```
pnpm test
```
Expected: PASS for all tests

- [ ] **Step 5: Commit**

```bash
git add src/app/core/utils/snippet-mutations.ts src/app/core/utils/snippet-mutations.spec.ts
git commit -m "feat: add computeMoveSnippetToFolder pure function with tests"
```

---

### Task 3: computeMoveAndReorderSnippet

**Files:**
- Modify: `src/app/core/utils/snippet-mutations.spec.ts`
- Modify: `src/app/core/utils/snippet-mutations.ts`

- [ ] **Step 1: Add failing tests**

Update the import line to:

```ts
import {
  computeReorderSnippets,
  computeMoveSnippetToFolder,
  computeMoveAndReorderSnippet,
} from './snippet-mutations';
```

Append at the end of the file:

```ts
describe('computeMoveAndReorderSnippet', () => {
  it('updates folderId and places snippet at the given index in the target folder', () => {
    const snippets = [
      makeSnippet({ id: 1, folderId: null, sortOrder: 0 }),
      makeSnippet({ id: 2, folderId: 10, sortOrder: 0 }),
      makeSnippet({ id: 3, folderId: 10, sortOrder: 1 }),
    ];
    const result = computeMoveAndReorderSnippet(snippets, 1, 10, 0);
    expect(result.find((s) => s.id === 1)?.folderId).toBe(10);
    expect(result.find((s) => s.id === 1)?.sortOrder).toBe(0);
    expect(result.find((s) => s.id === 2)?.sortOrder).toBe(1);
    expect(result.find((s) => s.id === 3)?.sortOrder).toBe(2);
  });

  it('does not change snippets outside the target folder', () => {
    const snippets = [
      makeSnippet({ id: 1, folderId: null, sortOrder: 0 }),
      makeSnippet({ id: 2, folderId: 10, sortOrder: 0 }),
      makeSnippet({ id: 3, folderId: 20, sortOrder: 0 }),
    ];
    const result = computeMoveAndReorderSnippet(snippets, 1, 10, 0);
    expect(result.find((s) => s.id === 3)?.sortOrder).toBe(0);
    expect(result.find((s) => s.id === 3)?.folderId).toBe(20);
  });

  it('appends to end when newIndex equals the destination folder length', () => {
    const snippets = [
      makeSnippet({ id: 1, folderId: null, sortOrder: 0 }),
      makeSnippet({ id: 2, folderId: 10, sortOrder: 0 }),
    ];
    const result = computeMoveAndReorderSnippet(snippets, 1, 10, 1);
    expect(result.find((s) => s.id === 1)?.sortOrder).toBe(1);
    expect(result.find((s) => s.id === 2)?.sortOrder).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```
pnpm test
```
Expected: FAIL — `computeMoveAndReorderSnippet is not a function`

- [ ] **Step 3: Implement computeMoveAndReorderSnippet**

Append to `snippet-mutations.ts`:

```ts
export function computeMoveAndReorderSnippet(
  snippets: Snippet[],
  snippetId: number,
  targetFolderId: number | null,
  newIndex: number,
): Snippet[] {
  const withNewFolder = snippets.map((s) => (s.id === snippetId ? { ...s, folderId: targetFolderId } : s));
  const inTarget = withNewFolder
    .filter((s) => s.folderId === targetFolderId)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const reordered = moveItem(inTarget, inTarget.findIndex((s) => s.id === snippetId), newIndex);
  const updatedById = new Map(reordered.map((s, i) => [s.id, i]));
  return withNewFolder.map((s) => (updatedById.has(s.id) ? { ...s, sortOrder: updatedById.get(s.id)! } : s));
}
```

- [ ] **Step 4: Run test to verify it passes**

```
pnpm test
```
Expected: PASS for all tests

- [ ] **Step 5: Commit**

```bash
git add src/app/core/utils/snippet-mutations.ts src/app/core/utils/snippet-mutations.spec.ts
git commit -m "feat: add computeMoveAndReorderSnippet pure function with tests"
```

---

### Task 4: computeReorderFolders

**Files:**
- Modify: `src/app/core/utils/snippet-mutations.spec.ts`
- Modify: `src/app/core/utils/snippet-mutations.ts`

- [ ] **Step 1: Add failing tests**

Update the import line to:

```ts
import {
  computeReorderSnippets,
  computeMoveSnippetToFolder,
  computeMoveAndReorderSnippet,
  computeReorderFolders,
} from './snippet-mutations';
import { SnippetFolder } from '../models/snippet-folder.model';
```

Append at the end of the file:

```ts
function makeFolder(partial: Partial<SnippetFolder>): SnippetFolder {
  return { id: 0, name: '', sortOrder: 0, ...partial };
}

describe('computeReorderFolders', () => {
  it('moves folder and recalculates sortOrder for all affected folders', () => {
    const folders = [
      makeFolder({ id: 1, sortOrder: 0 }),
      makeFolder({ id: 2, sortOrder: 1 }),
      makeFolder({ id: 3, sortOrder: 2 }),
    ];
    const result = computeReorderFolders(folders, 1, 2);
    expect(result.find((f) => f.id === 1)?.sortOrder).toBe(2);
    expect(result.find((f) => f.id === 2)?.sortOrder).toBe(0);
    expect(result.find((f) => f.id === 3)?.sortOrder).toBe(1);
  });

  it('returns unchanged array when folder id is not found', () => {
    const folders = [makeFolder({ id: 1, sortOrder: 0 })];
    const result = computeReorderFolders(folders, 99, 0);
    expect(result).toEqual(folders);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```
pnpm test
```
Expected: FAIL — `computeReorderFolders is not a function`

- [ ] **Step 3: Implement computeReorderFolders**

Append to `snippet-mutations.ts`:

```ts
export function computeReorderFolders(folders: SnippetFolder[], id: number, newIndex: number): SnippetFolder[] {
  const sorted = [...folders].sort((a, b) => a.sortOrder - b.sortOrder);
  const fromIndex = sorted.findIndex((f) => f.id === id);
  if (fromIndex === -1) return folders;
  const reordered = moveItem(sorted, fromIndex, newIndex);
  const updatedById = new Map(reordered.map((f, i) => [f.id, i]));
  return folders.map((f) => (updatedById.has(f.id) ? { ...f, sortOrder: updatedById.get(f.id)! } : f));
}
```

- [ ] **Step 4: Run test to verify it passes**

```
pnpm test
```
Expected: PASS for all tests

- [ ] **Step 5: Commit**

```bash
git add src/app/core/utils/snippet-mutations.ts src/app/core/utils/snippet-mutations.spec.ts
git commit -m "feat: add computeReorderFolders pure function with tests"
```

---

### Task 5: Refactor SnippetsService

**Files:**
- Modify: `src/app/core/services/snippets.service.ts`

- [ ] **Step 1: Update top-level imports**

In `src/app/core/services/snippets.service.ts`, replace:

```ts
import { Injectable, computed, inject, resource } from '@angular/core';
```

With:

```ts
import { Injectable, WritableSignal, computed, inject, resource } from '@angular/core';
import {
  computeMoveAndReorderSnippet,
  computeMoveSnippetToFolder,
  computeReorderFolders,
  computeReorderSnippets,
} from '../utils/snippet-mutations';
```

- [ ] **Step 2: Remove the moveItem helper**

Delete the entire `moveItem` function at the top of the file (lines 12–17 in the original):

```ts
function moveItem<T>(arr: T[], from: number, to: number): T[] {
  const result = [...arr];
  const [item] = result.splice(from, 1);
  result.splice(to, 0, item);
  return result;
}
```

- [ ] **Step 3: Add the applyOptimistically helper inside the class**

Inside the `SnippetsService` class, after the `reload()` method, add:

```ts
private async applyOptimistically<T>(
  target: { value: WritableSignal<T | undefined> },
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

- [ ] **Step 4: Replace reorderSnippet**

Replace the entire `reorderSnippet` method with:

```ts
async reorderSnippet(id: number, newIndex: number): Promise<void> {
  await this.applyOptimistically(
    this._snippets,
    (s) => computeReorderSnippets(s, id, newIndex),
    () => this.bridge.reorderSnippet(id, newIndex),
  );
}
```

- [ ] **Step 5: Replace moveSnippetToFolder**

Replace the entire `moveSnippetToFolder` method with:

```ts
async moveSnippetToFolder(snippetId: number, targetFolderId: number | null): Promise<void> {
  await this.applyOptimistically(
    this._snippets,
    (s) => computeMoveSnippetToFolder(s, snippetId, targetFolderId),
    () => this.bridge.moveSnippetToFolder(snippetId, targetFolderId),
  );
}
```

- [ ] **Step 6: Replace moveAndReorderSnippet**

Replace the entire `moveAndReorderSnippet` method with:

```ts
async moveAndReorderSnippet(
  snippetId: number,
  targetFolderId: number | null,
  newIndex: number,
): Promise<void> {
  await this.applyOptimistically(
    this._snippets,
    (s) => computeMoveAndReorderSnippet(s, snippetId, targetFolderId, newIndex),
    async () => {
      await this.bridge.moveSnippetToFolder(snippetId, targetFolderId);
      await this.bridge.reorderSnippet(snippetId, newIndex);
    },
  );
}
```

- [ ] **Step 7: Replace reorderFolder**

Replace the entire `reorderFolder` method with:

```ts
async reorderFolder(id: number, newIndex: number): Promise<void> {
  await this.applyOptimistically(
    this._folders,
    (f) => computeReorderFolders(f, id, newIndex),
    () => this.bridge.reorderSnippetFolder(id, newIndex),
  );
}
```

- [ ] **Step 8: Run all tests**

```
pnpm test
```
Expected: All tests PASS

- [ ] **Step 9: Format changed files**

```bash
npx prettier --write src/app/core/services/snippets.service.ts src/app/core/utils/snippet-mutations.ts src/app/core/utils/snippet-mutations.spec.ts
```

- [ ] **Step 10: Commit**

```bash
git add src/app/core/services/snippets.service.ts
git commit -m "refactor: extract applyOptimistically helper and simplify SnippetsService mutation methods"
```
