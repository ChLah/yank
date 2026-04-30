# ClipboardSelection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract selection and edit-mode state from `ClipboardTabComponent` into a plain, testable `ClipboardSelection` class.

**Architecture:** `ClipboardSelection` is a plain TypeScript class (no Angular DI) that takes a `Signal<ClipboardEntry[]>` in its constructor and exposes reactive state (`selectedIndex`, `selectedEntry`, `editingEntry`) via Angular signals. Internal state uses `linkedSignal` so that when `entries` changes, `selectedIndex` auto-resets to 0 and `editingEntry` is cleared. `ClipboardTabComponent` replaces its two local signals (`selectedIndex`, `editingEntryId`) with a single `private selection = new ClipboardSelection(this.filteredEntries)` field.

**Tech Stack:** Angular 21, `signal` / `computed` / `linkedSignal` from `@angular/core`, Vitest 4

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `src/app/features/clipboard-list/clipboard-selection.ts` | **Create** | `ClipboardSelection` class |
| `src/app/features/clipboard-list/clipboard-selection.spec.ts` | **Create** | Unit tests (no TestBed, no DOM) |
| `src/app/features/clipboard-list/clipboard-tab.component.ts` | **Modify** | Replace local signals with `ClipboardSelection` |

---

## Task 1: Scaffold `ClipboardSelection` spec — navigation basics

**Files:**
- Create: `src/app/features/clipboard-list/clipboard-selection.spec.ts`
- Create (stub): `src/app/features/clipboard-list/clipboard-selection.ts`

### Helper used throughout tests

Every test uses this factory. Write it once at the top of the spec file:

```ts
import { signal } from '@angular/core';
import { ClipboardEntry } from '../../core/models/clipboard-entry.model';
import { ClipboardSelection } from './clipboard-selection';

function makeEntry(id: number, kind: 'text' | 'image' = 'text'): ClipboardEntry {
  return {
    id,
    kind,
    content: kind === 'text' ? `entry ${id}` : null,
    thumbnail: null,
    width: null,
    height: null,
    hash: `hash${id}`,
    createdAt: id,
    lastUsedAt: id,
    pinned: false,
    sourceApp: null,
  };
}
```

- [ ] **Step 1: Write the failing navigation tests**

```ts
describe('ClipboardSelection — navigation', () => {
  it('starts at index 0', () => {
    const entries = signal([makeEntry(1), makeEntry(2), makeEntry(3)]);
    const sel = new ClipboardSelection(entries);
    expect(sel.selectedIndex()).toBe(0);
  });

  it('moveDown increments selectedIndex', () => {
    const entries = signal([makeEntry(1), makeEntry(2), makeEntry(3)]);
    const sel = new ClipboardSelection(entries);
    sel.moveDown();
    expect(sel.selectedIndex()).toBe(1);
  });

  it('moveDown clamps at last item', () => {
    const entries = signal([makeEntry(1), makeEntry(2)]);
    const sel = new ClipboardSelection(entries);
    sel.moveDown();
    sel.moveDown(); // attempt past end
    expect(sel.selectedIndex()).toBe(1);
  });

  it('moveUp decrements selectedIndex', () => {
    const entries = signal([makeEntry(1), makeEntry(2), makeEntry(3)]);
    const sel = new ClipboardSelection(entries);
    sel.moveDown();
    sel.moveUp();
    expect(sel.selectedIndex()).toBe(0);
  });

  it('moveUp clamps at 0', () => {
    const entries = signal([makeEntry(1), makeEntry(2)]);
    const sel = new ClipboardSelection(entries);
    sel.moveUp(); // already at 0
    expect(sel.selectedIndex()).toBe(0);
  });

  it('selectAt sets index within bounds', () => {
    const entries = signal([makeEntry(1), makeEntry(2), makeEntry(3)]);
    const sel = new ClipboardSelection(entries);
    sel.selectAt(2);
    expect(sel.selectedIndex()).toBe(2);
  });

  it('selectAt clamps negative index to 0', () => {
    const entries = signal([makeEntry(1), makeEntry(2)]);
    const sel = new ClipboardSelection(entries);
    sel.selectAt(-5);
    expect(sel.selectedIndex()).toBe(0);
  });

  it('selectAt clamps index past end to last', () => {
    const entries = signal([makeEntry(1), makeEntry(2)]);
    const sel = new ClipboardSelection(entries);
    sel.selectAt(99);
    expect(sel.selectedIndex()).toBe(1);
  });

  it('selectAt on empty entries keeps index at 0', () => {
    const entries = signal<ClipboardEntry[]>([]);
    const sel = new ClipboardSelection(entries);
    sel.selectAt(3);
    expect(sel.selectedIndex()).toBe(0);
  });
});
```

- [ ] **Step 2: Create the minimal stub so the file compiles**

```ts
// src/app/features/clipboard-list/clipboard-selection.ts
import { Signal, WritableSignal, computed, linkedSignal, signal } from '@angular/core';
import { ClipboardEntry } from '../../core/models/clipboard-entry.model';

export class ClipboardSelection {
  private readonly _entries: Signal<ClipboardEntry[]>;
  private readonly _rawIndex: WritableSignal<number>;
  private readonly _editingId: WritableSignal<number | null>;

  readonly selectedIndex: Signal<number>;
  readonly selectedEntry: Signal<ClipboardEntry | null>;
  readonly editingEntry: Signal<ClipboardEntry | null>;

  constructor(entries: Signal<ClipboardEntry[]>) {
    this._entries = entries;

    this._rawIndex = linkedSignal({
      source: () => entries(),
      computation: () => 0,
    });

    this._editingId = linkedSignal<ClipboardEntry[], number | null>({
      source: () => entries(),
      computation: () => null,
    });

    this.selectedIndex = computed(() => {
      const len = this._entries().length;
      return len === 0 ? 0 : Math.max(0, Math.min(len - 1, this._rawIndex()));
    });

    this.selectedEntry = computed(() => this._entries()[this.selectedIndex()] ?? null);

    this.editingEntry = computed(() => {
      const id = this._editingId();
      if (id === null) return null;
      return this._entries().find(e => e.id === id) ?? null;
    });
  }

  moveUp(): void {
    if (this._entries().length === 0) return;
    this._rawIndex.update(i => Math.max(0, i - 1));
  }

  moveDown(): void {
    const len = this._entries().length;
    if (len === 0) return;
    this._rawIndex.update(i => Math.min(len - 1, i + 1));
  }

  selectAt(index: number): void {
    const len = this._entries().length;
    this._rawIndex.set(len === 0 ? 0 : Math.max(0, Math.min(len - 1, index)));
  }

  enterEditMode(): void {
    const entry = this.selectedEntry();
    if (!entry || entry.kind !== 'text') return;
    this._editingId.set(entry.id);
  }

  exitEditMode(): void {
    this._editingId.set(null);
  }
}
```

- [ ] **Step 3: Run the navigation tests and confirm they fail**

```
npx vitest run src/app/features/clipboard-list/clipboard-selection.spec.ts
```

Expected: `FAIL` — `ClipboardSelection` is not yet imported (the stub will be there but let tests fail to confirm wiring).

> If you already wrote both files in the previous step and tests pass, that is fine — proceed. If tests error on import, check the import path.

- [ ] **Step 4: Run tests and confirm navigation suite passes**

```
npx vitest run src/app/features/clipboard-list/clipboard-selection.spec.ts
```

Expected: all navigation tests **PASS**.

- [ ] **Step 5: Commit**

```bash
git add src/app/features/clipboard-list/clipboard-selection.ts src/app/features/clipboard-list/clipboard-selection.spec.ts
git commit -m "feat: add ClipboardSelection — navigation tests green"
```

---

## Task 2: selectedEntry + entries-change reset tests

**Files:**
- Modify: `src/app/features/clipboard-list/clipboard-selection.spec.ts` (add test blocks)

- [ ] **Step 1: Write the failing tests**

Add two new `describe` blocks at the end of the spec file:

```ts
describe('ClipboardSelection — selectedEntry', () => {
  it('returns the entry at the current index', () => {
    const a = makeEntry(1);
    const b = makeEntry(2);
    const entries = signal([a, b]);
    const sel = new ClipboardSelection(entries);
    expect(sel.selectedEntry()).toBe(a);
    sel.moveDown();
    expect(sel.selectedEntry()).toBe(b);
  });

  it('returns null when entries is empty', () => {
    const entries = signal<ClipboardEntry[]>([]);
    const sel = new ClipboardSelection(entries);
    expect(sel.selectedEntry()).toBeNull();
  });
});

describe('ClipboardSelection — entries change resets state', () => {
  it('resets selectedIndex to 0 when entries signal changes', () => {
    const entries = signal([makeEntry(1), makeEntry(2), makeEntry(3)]);
    const sel = new ClipboardSelection(entries);
    sel.moveDown();
    sel.moveDown();
    expect(sel.selectedIndex()).toBe(2);

    entries.set([makeEntry(10), makeEntry(11), makeEntry(12)]);
    expect(sel.selectedIndex()).toBe(0);
  });

  it('clears editingEntry when entries signal changes', () => {
    const entries = signal([makeEntry(1), makeEntry(2)]);
    const sel = new ClipboardSelection(entries);
    sel.enterEditMode();
    expect(sel.editingEntry()).not.toBeNull();

    entries.set([makeEntry(10), makeEntry(11)]);
    expect(sel.editingEntry()).toBeNull();
  });

  it('returns selectedIndex 0 when entries becomes empty', () => {
    const entries = signal([makeEntry(1), makeEntry(2)]);
    const sel = new ClipboardSelection(entries);
    sel.moveDown();

    entries.set([]);
    expect(sel.selectedIndex()).toBe(0);
    expect(sel.selectedEntry()).toBeNull();
    expect(sel.editingEntry()).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests and confirm they fail**

```
npx vitest run src/app/features/clipboard-list/clipboard-selection.spec.ts
```

Expected: the new tests **FAIL** (since `ClipboardSelection` is not yet implemented).

> If the stub from Task 1 already implements this correctly and tests pass — proceed to Step 3.

- [ ] **Step 3: Run tests and confirm all pass**

```
npx vitest run src/app/features/clipboard-list/clipboard-selection.spec.ts
```

Expected: all tests **PASS** (the `linkedSignal` implementation from Task 1 handles these).

- [ ] **Step 4: Commit**

```bash
git add src/app/features/clipboard-list/clipboard-selection.spec.ts
git commit -m "test: add selectedEntry and entries-change reset tests to ClipboardSelection"
```

---

## Task 3: Edit mode tests

**Files:**
- Modify: `src/app/features/clipboard-list/clipboard-selection.spec.ts` (add edit-mode block)

- [ ] **Step 1: Write the failing tests**

```ts
describe('ClipboardSelection — edit mode', () => {
  it('enterEditMode sets editingEntry for a text entry', () => {
    const entry = makeEntry(1, 'text');
    const entries = signal([entry]);
    const sel = new ClipboardSelection(entries);
    sel.enterEditMode();
    expect(sel.editingEntry()).toBe(entry);
  });

  it('enterEditMode is a no-op for an image entry', () => {
    const entries = signal([makeEntry(1, 'image')]);
    const sel = new ClipboardSelection(entries);
    sel.enterEditMode();
    expect(sel.editingEntry()).toBeNull();
  });

  it('enterEditMode is a no-op when entries is empty', () => {
    const entries = signal<ClipboardEntry[]>([]);
    const sel = new ClipboardSelection(entries);
    sel.enterEditMode();
    expect(sel.editingEntry()).toBeNull();
  });

  it('exitEditMode clears editing state', () => {
    const entries = signal([makeEntry(1, 'text')]);
    const sel = new ClipboardSelection(entries);
    sel.enterEditMode();
    expect(sel.editingEntry()).not.toBeNull();
    sel.exitEditMode();
    expect(sel.editingEntry()).toBeNull();
  });

  it('navigation works normally after exitEditMode', () => {
    const entries = signal([makeEntry(1, 'text'), makeEntry(2, 'text')]);
    const sel = new ClipboardSelection(entries);
    sel.enterEditMode();
    sel.exitEditMode();
    sel.moveDown();
    expect(sel.selectedIndex()).toBe(1);
    expect(sel.editingEntry()).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests — confirm they fail**

```
npx vitest run src/app/features/clipboard-list/clipboard-selection.spec.ts
```

Expected: edit mode tests **FAIL**.

- [ ] **Step 3: Run tests — confirm all pass**

```
npx vitest run src/app/features/clipboard-list/clipboard-selection.spec.ts
```

Expected: **all tests pass**.

- [ ] **Step 4: Commit**

```bash
git add src/app/features/clipboard-list/clipboard-selection.spec.ts
git commit -m "test: add edit mode tests to ClipboardSelection"
```

---

## Task 4: Wire `ClipboardSelection` into `ClipboardTabComponent`

**Files:**
- Modify: `src/app/features/clipboard-list/clipboard-tab.component.ts`

### Summary of changes

| What changes | Old | New |
|---|---|---|
| Field declarations | `selectedIndex = signal(0)`, `editingEntryId = signal<number \| null>(null)` | `private selection = new ClipboardSelection(this.filteredEntries)` |
| Template `[selected]` | `selectedIndex() === i` | `selection.selectedIndex() === i` |
| Template `[editMode]` | `editingEntryId() === entry.id` | `selection.editingEntry()?.id === entry.id` |
| Template transform picker condition | `showTransformPicker() && selectedIndex() === i` | `showTransformPicker() && selection.selectedIndex() === i` |
| `resetState()` | `editingEntryId.set(null)`, `selectedIndex.set(0)` | `selection.exitEditMode()`, `selection.selectAt(0)` |
| `emitSelectedEntry()` | `filteredEntries()[selectedIndex()]` | `selection.selectedEntry()` |
| `setFilter()` | `editingEntryId.set(null)`, `selectedIndex.set(0)` | `selection.exitEditMode()`, `selection.selectAt(0)` |
| `selectEntry()` | `editingEntryId()`, `editingEntryId.set(null)`, `selectedIndex.set(index)` | `selection.editingEntry()?.id`, `selection.exitEditMode()`, `selection.selectAt(index)` |
| `deleteEntry()` | manual index clamp | snapshot index, delete, `selection.selectAt(Math.min(currentIndex, newLen - 1))` |
| `onSearchInput()` | `selectedIndex.set(0)` | remove (handled by entries change) |
| `clearSearch()` | `selectedIndex.set(0)` | remove (handled by entries change) |
| `onEditConfirm()` | `editingEntryId.set(null)` | `selection.exitEditMode()` |
| `onEditCancel()` | `editingEntryId.set(null)` | `selection.exitEditMode()` |
| `moveSelection()` | `selectedIndex.set(next)` | `selection.selectAt(next)` |
| `enterEditMode()` (private) | manual guard + `editingEntryId.set(entry.id)` | `selection.enterEditMode()` |
| `onKeyDown()` edit check | `editingEntryId() !== null` | `selection.editingEntry() !== null` |
| `scrollSelectedIntoView()` | `this.selectedIndex()` | `this.selection.selectedIndex()` |

- [ ] **Step 1: Add the import and field, remove old signals**

At the top of the component file add the `ClipboardSelection` import alongside existing imports:

```ts
import { ClipboardSelection } from './clipboard-selection';
```

Remove these two field declarations from the class body:
```ts
protected selectedIndex = signal(0);
protected editingEntryId = signal<number | null>(null);
```

Add this field directly below `filteredEntries`:
```ts
private selection = new ClipboardSelection(this.filteredEntries);
```

- [ ] **Step 2: Update the template**

Change `selectedIndex()` → `selection.selectedIndex()` and `editingEntryId() === entry.id` → `selection.editingEntry()?.id === entry.id` throughout the template.

Diff for the `@for` block (lines ~131–155):

```ts
// Before:
[selected]="selectedIndex() === i"
[editMode]="editingEntryId() === entry.id"
// ...
@if (showTransformPicker() && selectedIndex() === i && entry.kind === 'text') {

// After:
[selected]="selection.selectedIndex() === i"
[editMode]="selection.editingEntry()?.id === entry.id"
// ...
@if (showTransformPicker() && selection.selectedIndex() === i && entry.kind === 'text') {
```

- [ ] **Step 3: Update `emitSelectedEntry()`**

```ts
private emitSelectedEntry(): void {
  this.selectedEntry.emit(this.selection.selectedEntry());
}
```

- [ ] **Step 4: Update `resetState()`**

```ts
private resetState(): void {
  this.selection.exitEditMode();
  this.selection.selectAt(0);
  this.activeFilter.set('all');
  this.clearSearch();
  this.showTransformPicker.set(false);
  this.ocrLoadingEntryId.set(null);
  this.emitSelectedEntry();
  this.hostEl.nativeElement.focus();
}
```

- [ ] **Step 5: Update `setFilter()`**

```ts
protected setFilter(filter: ClipboardKindFilter): void {
  this.selection.exitEditMode();
  this.activeFilter.set(filter);
  this.selection.selectAt(0);
  this.emitSelectedEntry();
}
```

- [ ] **Step 6: Update `selectEntry()`**

```ts
protected selectEntry(index: number): void {
  if (this.selection.editingEntry() !== null) {
    const clickedEntry = this.filteredEntries()[index];
    if (!shouldCancelEditOnSelect(clickedEntry?.id, this.selection.editingEntry()!.id)) return;
    this.selection.exitEditMode();
    this.selection.selectAt(index);
    this.emitSelectedEntry();
    return;
  }
  this.selection.selectAt(index);
  this.emitSelectedEntry();
  const entry = this.filteredEntries()[index];
  if (!entry) return;
  if (entry.kind === 'image') {
    this.router.navigate(['/preview'], { queryParams: { id: entry.id } });
  } else {
    this.clipboard.setClipboard(entry.id);
  }
}
```

- [ ] **Step 7: Update `deleteEntry()`**

```ts
protected deleteEntry(index: number): void {
  const entry = this.filteredEntries()[index];
  if (!entry) return;
  const currentIndex = this.selection.selectedIndex();
  const newLen = this.filteredEntries().length - 1;
  this.clipboard.deleteEntry(entry.id);
  if (newLen > 0) {
    this.selection.selectAt(Math.min(currentIndex, newLen - 1));
  }
  this.emitSelectedEntry();
}
```

- [ ] **Step 8: Update `onSearchInput()` and `clearSearch()`**

`onSearchInput()` — remove the `selectedIndex.set(0)` line; entries signal change auto-resets:

```ts
protected onSearchInput(event: Event): void {
  this.searchQuery.set((event.target as HTMLInputElement).value);
  this.emitSelectedEntry();
}
```

`clearSearch()` — remove `selectedIndex.set(0)`:

```ts
protected clearSearch(): void {
  this.searchQuery.set('');
  this.isSearching.set(false);
  this.emitSelectedEntry();
  this.hostEl.nativeElement.focus();
}
```

- [ ] **Step 9: Update `onEditConfirm()`, `onEditCancel()`, private `enterEditMode()`**

```ts
protected async onEditConfirm(text: string): Promise<void> {
  this.selection.exitEditMode();
  try {
    await this.bridge.setClipboardText(text);
    this.bridge.hidePopup();
  } catch {
    toast.error(this.translate.instant('CLIPBOARD.EDIT_COPY_FAILED'));
  }
}

protected onEditCancel(): void {
  this.selection.exitEditMode();
  this.hostEl.nativeElement.focus();
}

private enterEditMode(): void {
  this.selection.enterEditMode();
}
```

- [ ] **Step 10: Update `moveSelection()` and `onKeyDown()` edit check**

```ts
private moveSelection(delta: number): void {
  const len = this.filteredEntries().length;
  if (len === 0) return;
  const next = Math.max(0, Math.min(len - 1, this.selection.selectedIndex() + delta));
  this.selection.selectAt(next);
  this.emitSelectedEntry();
  this.scrollSelectedIntoView();
}
```

In `onKeyDown()` change the edit-check guard:

```ts
if (this.selection.editingEntry() !== null) {
```

Also update `scrollSelectedIntoView()`:

```ts
private scrollSelectedIntoView(): void {
  const items = this.listContainer().nativeElement.querySelectorAll<HTMLElement>('.entry-item');
  items[this.selection.selectedIndex()]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}
```

- [ ] **Step 11: Update the quick-paste digit handler in `onKeyDown()`**

In the quick-paste block, `selectedIndex` references are already handled via `selectEntry(idx)`, so no change needed there.

Also update the typing-starts-search block (the `else if (event.key.length === 1 ...)` branch) — remove `this.selectedIndex.set(0)`:

```ts
} else if (event.key.length === 1 && !event.ctrlKey && !event.altKey && !event.metaKey) {
  this.isSearching.set(true);
  this.searchQuery.set(event.key);
  this.emitSelectedEntry();
  setTimeout(() => {
    const input = this.searchInput()?.nativeElement;
    if (input) {
      input.value = this.searchQuery();
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    }
  }, 0);
}
```

- [ ] **Step 12: Run the full test suite**

```
npx vitest run
```

Expected: **all tests pass**, no errors, no warnings.

- [ ] **Step 13: Commit**

```bash
git add src/app/features/clipboard-list/clipboard-tab.component.ts
git commit -m "refactor: wire ClipboardSelection into ClipboardTabComponent"
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Covered |
|---|---|
| `selectedIndex` signal | Task 1 (implementation + tests) |
| `selectedEntry` signal | Task 2 |
| `editingEntry` signal | Task 3 |
| `moveUp()` / `moveDown()` with clamping | Task 1 |
| `selectAt(index)` with clamping | Task 1 |
| `enterEditMode()` text-only, no-op guards | Task 3 |
| `exitEditMode()` | Task 3 |
| Entries change resets `selectedIndex` to 0 | Task 2 |
| Entries change clears `editingEntry` | Task 2 |
| Empty entries → `selectedIndex` stays 0 | Tasks 1 + 2 |
| Component wiring: template `selectedIndex` | Task 4, Step 2 |
| Component wiring: template `editingEntry` | Task 4, Step 2 |
| Component wiring: `deleteEntry` preserves position | Task 4, Step 7 |
| File locations match spec | Tasks 1–3 |

**No placeholders found.** All steps include exact code or commands.

**Type consistency:** `ClipboardEntry`, `Signal<ClipboardEntry[]>`, `WritableSignal<number>`, `WritableSignal<number | null>` — consistent throughout.
