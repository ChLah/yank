# Merge Entries (Multi-Paste Queue) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user mark multiple text entries in the clipboard list, press Enter to open a separator-picker, and write the joined string to the OS clipboard as a single paste payload.

**Architecture:** Frontend-only feature. A new `mergeEntries` pure utility joins trimmed strings with a chosen separator. `ClipboardSelection` gains a `Set<number>` of marked entry IDs (independent of the cursor). The command resolver gains three behaviors: Space toggles a mark, Enter is "smart" (≥ 2 marks → open merge picker, else paste focused), Escape clears marks before closing the popup. A new `MergePickerComponent` mirrors the existing `TransformPickerComponent` pattern. `ClipboardEntryComponent` gains a conditional checkbox column shown when ≥ 1 entry is currently marked-and-visible. No Tauri/Rust changes — uses existing `setClipboardText` / `hidePopup`.

**Tech Stack:** Angular 20 (signals, OnPush), Tauri 2, Vitest, ngx-translate, Spartan UI, Tailwind.

---

## Design decisions (locked in via grill)

| | |
|---|---|
| Mechanism | "Merge & paste" — selected items are concatenated with a chosen separator, written to OS clipboard as one payload. User pastes once with Ctrl+V. |
| Multi-select | **Space toggles** the focused row's mark. Mouse: click on the checkbox cell to toggle; clicking the row body still pastes (unchanged). |
| Trigger | **Smart Enter** — if ≥ 2 entries are *visible-and-marked*, Enter opens the merge picker; otherwise Enter copies the focused row (today's behavior). Shift+Enter and Ctrl+1-9 are unchanged regardless of marks. |
| Merge order | List order, top → bottom (matches what the user sees in the visible list). |
| Separators | `Newline` (`\n`), `Bullet list` (each line prefixed with `- `, joined by `\n`), `Comma` (`, `). |
| Trim/empty | Each entry's content is `.trim()`ed before joining; entries that become empty after trim are dropped silently. No special-case if all become empty or only one is left. |
| Images | Not markable. Space on an image row is a no-op. The checkbox cell shows nothing on image rows even when the column is visible. |
| Snippets tab | Untouched. Feature lives in `ClipboardTabComponent` only. |
| Mark lifecycle | Marks are tracked by **entry ID** (a `Set<number>`). They survive tab switches (Recent ↔ Pinned), filter changes (All/Text/Image), search start/clear, and entry-list refreshes. They are cleared on: popup hide, successful merge, Esc-when-marks-present (then a second Esc closes the popup as today), and when an individual marked entry is deleted. |
| Counter UI | Small "N selected ×" badge in the filter row (left side). Clicking the × clears all marks. |
| Footer hint | When `visibleMarkedCount >= 2`, the "↵ paste" hint becomes "↵ merge". Other hints unchanged. |
| Picker placement | Inline overlay below the focused row, identical pattern to the existing transform picker. |

---

## File structure

### Files to create

| Path | Responsibility |
|---|---|
| `src/app/core/utils/merge-entries.ts` | Pure function `mergeEntries(contents, separator)` and `MergeSeparator` type. Handles trim + drop-empty + join. |
| `src/app/core/utils/merge-entries.spec.ts` | Unit tests for the merge utility. |
| `src/app/features/clipboard-list/merge-picker.component.ts` | Three-option picker (newline / bullet / comma). Mirrors `TransformPickerComponent`. |
| `src/app/features/clipboard-list/merge-picker.component.spec.ts` | Component spec — verifies picker emits the right separator. |

### Files to modify

| Path | Change |
|---|---|
| `src/app/features/clipboard-list/clipboard-selection.ts` | Add `markedIds: Signal<Set<number>>`, `markedCount`, `isMarked(id)`, `toggleMark(id, kind)`, `unmark(id)`, `clearMarks()`. |
| `src/app/features/clipboard-list/clipboard-selection.spec.ts` | Add tests for new mark API. |
| `src/app/features/clipboard-list/clipboard-command-resolver.ts` | Extend `ClipboardKeyContext` with `visibleMarkedCount` for normal/searching modes. Add `'merge-picker'` mode (returns null like transform-picker). New commands: `'toggle-mark'`, `'open-merge-picker'`, `'clear-marks'`. Reroute Space → `toggle-mark` in normal mode; route Enter → `open-merge-picker` when `visibleMarkedCount >= 2`; route Escape → `clear-marks` when `visibleMarkedCount > 0`. |
| `src/app/features/clipboard-list/clipboard-command-resolver.spec.ts` | Add tests for new commands and updated Enter/Escape/Space behavior. |
| `src/app/features/clipboard-list/clipboard-entry.component.ts` | Add `marked`, `showCheckbox` inputs, `toggleMark` output. Render a 20px checkbox column when `showCheckbox` is true; click on checkbox toggles mark without bubbling to row click. |
| `src/app/features/clipboard-list/clipboard-tab.component.ts` | Add `visibleMarkedCount` and `marksColumnVisible` computeds. Add merge-picker overlay (anchored below focused row). Render "N selected ×" badge in filter row. Wire new commands; update `resetState()` to clear marks and hide merge picker. Pass mark inputs to entries. Implement `onMergeApplied(separator)`: filter visible-and-marked text entries in list order → call `mergeEntries` → write via `setClipboardText` → clear marks → hide popup. Update `deleteEntry` to also unmark deleted entry. |
| `src/app/features/clipboard-list/clipboard-footer-hints.component.ts` | Add `mergeMode: boolean` input. Swap the `↵ paste` hint label to `↵ merge` when true. |
| `src/app/i18n/translation.interface.ts` | Extend `CLIPBOARD` block with `MARKED_COUNT`, `CLEAR_MARKS`, `HINT_MERGE`. Add new top-level `MERGE` block: `NEWLINE`, `BULLET_LIST`, `COMMA`. |
| `src/app/i18n/en.ts` | Add the new strings (English). |
| `src/app/i18n/de.ts` | Add the new strings (German). |

---

## Task 1: Merge utility (pure function)

**Files:**
- Create: `src/app/core/utils/merge-entries.ts`
- Test: `src/app/core/utils/merge-entries.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `src/app/core/utils/merge-entries.spec.ts`:

```ts
import { mergeEntries } from './merge-entries';

describe('mergeEntries', () => {
  describe('newline separator', () => {
    it('joins items with \\n', () => {
      expect(mergeEntries(['a', 'b', 'c'], 'newline')).toBe('a\nb\nc');
    });

    it('returns empty string for empty input', () => {
      expect(mergeEntries([], 'newline')).toBe('');
    });

    it('returns single item without separator when only one input', () => {
      expect(mergeEntries(['only'], 'newline')).toBe('only');
    });
  });

  describe('bullet separator', () => {
    it('prefixes each line with "- " and joins with \\n', () => {
      expect(mergeEntries(['a', 'b', 'c'], 'bullet')).toBe('- a\n- b\n- c');
    });

    it('returns single bulleted item when only one input', () => {
      expect(mergeEntries(['only'], 'bullet')).toBe('- only');
    });
  });

  describe('comma separator', () => {
    it('joins items with ", "', () => {
      expect(mergeEntries(['a', 'b', 'c'], 'comma')).toBe('a, b, c');
    });
  });

  describe('trimming and empty filtering', () => {
    it('trims leading/trailing whitespace on each item', () => {
      expect(mergeEntries(['  a  ', '\nb\n', '\tc'], 'comma')).toBe('a, b, c');
    });

    it('preserves internal whitespace', () => {
      expect(mergeEntries(['hello world', 'foo  bar'], 'newline')).toBe(
        'hello world\nfoo  bar',
      );
    });

    it('drops items that are empty after trim (newline)', () => {
      expect(mergeEntries(['a', '   ', 'b'], 'newline')).toBe('a\nb');
    });

    it('drops items that are empty after trim (bullet)', () => {
      expect(mergeEntries(['a', '\n\n', 'b'], 'bullet')).toBe('- a\n- b');
    });

    it('drops items that are empty after trim (comma)', () => {
      expect(mergeEntries(['', 'a', '   ', 'b', ''], 'comma')).toBe('a, b');
    });

    it('returns empty string when every item is whitespace-only', () => {
      expect(mergeEntries(['', '   ', '\n\t'], 'newline')).toBe('');
    });

    it('returns single trimmed item when others are empty', () => {
      expect(mergeEntries(['', 'only', '   '], 'comma')).toBe('only');
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/app/core/utils/merge-entries.spec.ts`
Expected: FAIL with "Cannot find module './merge-entries'" or similar resolution error.

- [ ] **Step 3: Write minimal implementation**

Create `src/app/core/utils/merge-entries.ts`:

```ts
export type MergeSeparator = 'newline' | 'bullet' | 'comma';

/**
 * Joins clipboard contents with the chosen separator.
 *
 * Each item is trimmed; items that become empty after trim are dropped.
 */
export function mergeEntries(contents: string[], separator: MergeSeparator): string {
  const trimmed = contents.map((s) => s.trim()).filter((s) => s.length > 0);
  switch (separator) {
    case 'newline':
      return trimmed.join('\n');
    case 'bullet':
      return trimmed.map((s) => `- ${s}`).join('\n');
    case 'comma':
      return trimmed.join(', ');
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/app/core/utils/merge-entries.spec.ts`
Expected: PASS — all 12 cases.

- [ ] **Step 5: Format**

Run: `pnpm prettier --write src/app/core/utils/merge-entries.ts src/app/core/utils/merge-entries.spec.ts`

- [ ] **Step 6: Commit**

```powershell
git add src/app/core/utils/merge-entries.ts src/app/core/utils/merge-entries.spec.ts
git commit -m @'
feat(merge): add mergeEntries utility for joining strings with separator

Pure function that trims each input, drops items empty after trim, and
joins the rest with newline / bullet-list / comma. Foundation for the
multi-paste merge feature.
'@
```

---

## Task 2: i18n keys

**Files:**
- Modify: `src/app/i18n/translation.interface.ts`
- Modify: `src/app/i18n/en.ts`
- Modify: `src/app/i18n/de.ts`

- [ ] **Step 1: Extend the type**

In `src/app/i18n/translation.interface.ts`, inside the `CLIPBOARD` block (after `SEARCH_REGEX_TOGGLE: string;`) add:

```ts
    MARKED_COUNT: string;
    CLEAR_MARKS: string;
    HINT_MERGE: string;
```

After the `OCR` block (before `SNIPPETS`), add a new top-level block:

```ts
  MERGE: {
    NEWLINE: string;
    BULLET_LIST: string;
    COMMA: string;
  };
```

(Mirror the same shape in the index-signature implicitly via the existing `[key: string]: string | { [key: string]: string };`.)

- [ ] **Step 2: Add English strings**

In `src/app/i18n/en.ts`, inside the `CLIPBOARD` block (after `SEARCH_REGEX_TOGGLE`):

```ts
    MARKED_COUNT: '{{count}} selected',
    CLEAR_MARKS: 'Clear selection',
    HINT_MERGE: 'merge',
```

After the `OCR` block (before `SNIPPETS`):

```ts
  MERGE: {
    NEWLINE: 'Newline',
    BULLET_LIST: 'Bullet list',
    COMMA: 'Comma',
  },
```

- [ ] **Step 3: Add German strings**

In `src/app/i18n/de.ts`, inside the `CLIPBOARD` block (after `SEARCH_REGEX_TOGGLE`):

```ts
    MARKED_COUNT: '{{count}} ausgewählt',
    CLEAR_MARKS: 'Auswahl aufheben',
    HINT_MERGE: 'zusammenfügen',
```

After the `OCR` block (before `SNIPPETS`):

```ts
  MERGE: {
    NEWLINE: 'Zeilenumbruch',
    BULLET_LIST: 'Aufzählung',
    COMMA: 'Komma',
  },
```

- [ ] **Step 4: Verify project compiles**

Run: `pnpm tsc -p tsconfig.app.json --noEmit`
Expected: no errors. (If errors mention missing keys, the interface and one of the locales are out of sync — re-check.)

- [ ] **Step 5: Format**

Run: `pnpm prettier --write src/app/i18n/translation.interface.ts src/app/i18n/en.ts src/app/i18n/de.ts`

- [ ] **Step 6: Commit**

```powershell
git add src/app/i18n/translation.interface.ts src/app/i18n/en.ts src/app/i18n/de.ts
git commit -m @'
i18n: add merge feature strings (en, de)

Adds CLIPBOARD.MARKED_COUNT / CLEAR_MARKS / HINT_MERGE plus a new MERGE
namespace with NEWLINE / BULLET_LIST / COMMA separator labels.
'@
```

---

## Task 3: Mark API on `ClipboardSelection`

**Files:**
- Modify: `src/app/features/clipboard-list/clipboard-selection.ts`
- Test: `src/app/features/clipboard-list/clipboard-selection.spec.ts`

- [ ] **Step 1: Write failing tests**

Append the following to `src/app/features/clipboard-list/clipboard-selection.spec.ts` after the existing `describe` blocks:

```ts
describe('ClipboardSelection — marks', () => {
  it('starts with no marks', () => {
    const entries = signal([makeEntry(1), makeEntry(2)]);
    const sel = new ClipboardSelection(entries);
    expect(sel.markedCount()).toBe(0);
    expect(sel.isMarked(1)).toBe(false);
  });

  it('toggleMark adds an id when not marked (text entry)', () => {
    const entries = signal([makeEntry(1, 'text')]);
    const sel = new ClipboardSelection(entries);
    sel.toggleMark(1, 'text');
    expect(sel.isMarked(1)).toBe(true);
    expect(sel.markedCount()).toBe(1);
  });

  it('toggleMark removes an id when already marked', () => {
    const entries = signal([makeEntry(1, 'text')]);
    const sel = new ClipboardSelection(entries);
    sel.toggleMark(1, 'text');
    sel.toggleMark(1, 'text');
    expect(sel.isMarked(1)).toBe(false);
    expect(sel.markedCount()).toBe(0);
  });

  it('toggleMark is a no-op for image entries', () => {
    const entries = signal([makeEntry(1, 'image')]);
    const sel = new ClipboardSelection(entries);
    sel.toggleMark(1, 'image');
    expect(sel.isMarked(1)).toBe(false);
    expect(sel.markedCount()).toBe(0);
  });

  it('unmark removes a specific id', () => {
    const entries = signal([makeEntry(1, 'text'), makeEntry(2, 'text')]);
    const sel = new ClipboardSelection(entries);
    sel.toggleMark(1, 'text');
    sel.toggleMark(2, 'text');
    sel.unmark(1);
    expect(sel.isMarked(1)).toBe(false);
    expect(sel.isMarked(2)).toBe(true);
    expect(sel.markedCount()).toBe(1);
  });

  it('unmark is a no-op for an unmarked id', () => {
    const entries = signal([makeEntry(1, 'text')]);
    const sel = new ClipboardSelection(entries);
    sel.unmark(99);
    expect(sel.markedCount()).toBe(0);
  });

  it('clearMarks empties the set', () => {
    const entries = signal([makeEntry(1, 'text'), makeEntry(2, 'text')]);
    const sel = new ClipboardSelection(entries);
    sel.toggleMark(1, 'text');
    sel.toggleMark(2, 'text');
    sel.clearMarks();
    expect(sel.markedCount()).toBe(0);
    expect(sel.isMarked(1)).toBe(false);
    expect(sel.isMarked(2)).toBe(false);
  });

  it('marks are preserved across entries-signal changes', () => {
    const entries = signal([makeEntry(1, 'text'), makeEntry(2, 'text')]);
    const sel = new ClipboardSelection(entries);
    sel.toggleMark(1, 'text');
    sel.toggleMark(2, 'text');
    // Simulate filter or tab change re-emitting the same IDs
    entries.set([makeEntry(1, 'text'), makeEntry(2, 'text')]);
    expect(sel.isMarked(1)).toBe(true);
    expect(sel.isMarked(2)).toBe(true);
  });

  it('markedCount is reactive', () => {
    const entries = signal([makeEntry(1, 'text'), makeEntry(2, 'text')]);
    const sel = new ClipboardSelection(entries);
    expect(sel.markedCount()).toBe(0);
    sel.toggleMark(1, 'text');
    expect(sel.markedCount()).toBe(1);
    sel.toggleMark(2, 'text');
    expect(sel.markedCount()).toBe(2);
    sel.toggleMark(1, 'text');
    expect(sel.markedCount()).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/app/features/clipboard-list/clipboard-selection.spec.ts`
Expected: FAIL with "sel.toggleMark is not a function" / "markedCount is not a function".

- [ ] **Step 3: Implement marks API**

Replace the contents of `src/app/features/clipboard-list/clipboard-selection.ts` with:

```ts
import { Signal, WritableSignal, computed, linkedSignal, signal } from '@angular/core';
import { ClipboardEntry, ClipboardKind } from '../../core/models/clipboard-entry.model';

export class ClipboardSelection {
  private readonly _entries: Signal<ClipboardEntry[]>;
  private readonly _rawIndex: WritableSignal<number>;
  private readonly _editingId: WritableSignal<number | null>;
  private readonly _markedIds: WritableSignal<Set<number>>;

  readonly selectedIndex: Signal<number>;
  readonly selectedEntry: Signal<ClipboardEntry | null>;
  readonly editingEntry: Signal<ClipboardEntry | null>;
  readonly markedIds: Signal<ReadonlySet<number>>;
  readonly markedCount: Signal<number>;

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

    // Marks are a plain signal — they intentionally survive entries-signal changes
    // (filter, search, tab switches) since they are tied to entry IDs.
    this._markedIds = signal(new Set<number>());

    this.selectedIndex = computed(() => {
      const len = this._entries().length;
      return len === 0 ? 0 : Math.max(0, Math.min(len - 1, this._rawIndex()));
    });

    this.selectedEntry = computed(() => this._entries()[this.selectedIndex()] ?? null);

    this.editingEntry = computed(() => {
      const id = this._editingId();
      if (id === null) return null;
      return this._entries().find((e) => e.id === id) ?? null;
    });

    this.markedIds = this._markedIds.asReadonly();
    this.markedCount = computed(() => this._markedIds().size);
  }

  moveUp(): void {
    if (this._entries().length === 0) return;
    this._rawIndex.update((i) => Math.max(0, i - 1));
  }

  moveDown(): void {
    const len = this._entries().length;
    if (len === 0) return;
    this._rawIndex.update((i) => Math.min(len - 1, i + 1));
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

  isMarked(id: number): boolean {
    return this._markedIds().has(id);
  }

  toggleMark(id: number, kind: ClipboardKind): void {
    if (kind !== 'text') return;
    this._markedIds.update((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  unmark(id: number): void {
    this._markedIds.update((s) => {
      if (!s.has(id)) return s;
      const next = new Set(s);
      next.delete(id);
      return next;
    });
  }

  clearMarks(): void {
    if (this._markedIds().size === 0) return;
    this._markedIds.set(new Set());
  }
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm vitest run src/app/features/clipboard-list/clipboard-selection.spec.ts`
Expected: PASS — both old and new test groups.

- [ ] **Step 5: Format**

Run: `pnpm prettier --write src/app/features/clipboard-list/clipboard-selection.ts src/app/features/clipboard-list/clipboard-selection.spec.ts`

- [ ] **Step 6: Commit**

```powershell
git add src/app/features/clipboard-list/clipboard-selection.ts src/app/features/clipboard-list/clipboard-selection.spec.ts
git commit -m @'
feat(selection): add mark API to ClipboardSelection

Adds markedIds / markedCount signals plus toggleMark / unmark / clearMarks
/ isMarked methods. Marks are by entry ID and survive entries-signal
changes (filter, search, tab switches) — unlike rawIndex which resets
via linkedSignal. toggleMark is a no-op for image kinds.
'@
```

---

## Task 4: Command resolver — Space, smart Enter, smart Esc

**Files:**
- Modify: `src/app/features/clipboard-list/clipboard-command-resolver.ts`
- Test: `src/app/features/clipboard-list/clipboard-command-resolver.spec.ts`

- [ ] **Step 1: Write failing tests**

Append the following inside `src/app/features/clipboard-list/clipboard-command-resolver.spec.ts` (the existing top-level `describe('resolveClipboardCommand', ...)` block remains; add new nested describes inside it):

```ts
  describe('marks — Space toggles mark in normal mode', () => {
    it('returns toggle-mark for Space in normal mode (no marks)', () => {
      expect(
        resolveClipboardCommand(key(' '), { mode: 'normal', visibleMarkedCount: 0 }),
      ).toEqual({ type: 'toggle-mark' });
    });

    it('returns toggle-mark for Space in normal mode (with marks)', () => {
      expect(
        resolveClipboardCommand(key(' '), { mode: 'normal', visibleMarkedCount: 2 }),
      ).toEqual({ type: 'toggle-mark' });
    });

    it('returns null for Space in searching mode (input handles it)', () => {
      expect(
        resolveClipboardCommand(key(' '), { mode: 'searching', visibleMarkedCount: 0 }),
      ).toBeNull();
    });

    it('returns null for Shift+Space (reserved / no-op)', () => {
      expect(
        resolveClipboardCommand(key(' ', { shiftKey: true }), {
          mode: 'normal',
          visibleMarkedCount: 0,
        }),
      ).toBeNull();
    });

    it('returns null for Ctrl+Space', () => {
      expect(
        resolveClipboardCommand(key(' ', { ctrlKey: true }), {
          mode: 'normal',
          visibleMarkedCount: 0,
        }),
      ).toBeNull();
    });
  });

  describe('marks — smart Enter', () => {
    it('returns open-merge-picker for Enter when visibleMarkedCount >= 2 (normal)', () => {
      expect(
        resolveClipboardCommand(key('Enter'), { mode: 'normal', visibleMarkedCount: 2 }),
      ).toEqual({ type: 'open-merge-picker' });
    });

    it('returns open-merge-picker for Enter when visibleMarkedCount >= 2 (searching)', () => {
      expect(
        resolveClipboardCommand(key('Enter'), { mode: 'searching', visibleMarkedCount: 3 }),
      ).toEqual({ type: 'open-merge-picker' });
    });

    it('returns copy-selected for Enter when visibleMarkedCount === 1', () => {
      expect(
        resolveClipboardCommand(key('Enter'), { mode: 'normal', visibleMarkedCount: 1 }),
      ).toEqual({ type: 'copy-selected' });
    });

    it('returns copy-selected for Enter when visibleMarkedCount === 0', () => {
      expect(
        resolveClipboardCommand(key('Enter'), { mode: 'normal', visibleMarkedCount: 0 }),
      ).toEqual({ type: 'copy-selected' });
    });

    it('Shift+Enter still opens transform picker even with marks present', () => {
      expect(
        resolveClipboardCommand(key('Enter', { shiftKey: true }), {
          mode: 'normal',
          visibleMarkedCount: 4,
        }),
      ).toEqual({ type: 'open-transform-picker' });
    });
  });

  describe('marks — smart Escape', () => {
    it('returns clear-marks for Escape when visibleMarkedCount > 0 (normal)', () => {
      expect(
        resolveClipboardCommand(key('Escape'), { mode: 'normal', visibleMarkedCount: 2 }),
      ).toEqual({ type: 'clear-marks' });
    });

    it('returns hide-popup for Escape when visibleMarkedCount === 0 (normal)', () => {
      expect(
        resolveClipboardCommand(key('Escape'), { mode: 'normal', visibleMarkedCount: 0 }),
      ).toEqual({ type: 'hide-popup' });
    });

    it('returns exit-search for Escape in searching mode regardless of marks', () => {
      // Searching-mode Esc exits the search bar; users can clear marks afterwards.
      expect(
        resolveClipboardCommand(key('Escape'), { mode: 'searching', visibleMarkedCount: 3 }),
      ).toEqual({ type: 'exit-search' });
    });
  });

  describe('marks — merge-picker mode', () => {
    it('returns null for any key in merge-picker mode (component handles its own keys)', () => {
      expect(resolveClipboardCommand(key('Enter'), { mode: 'merge-picker' })).toBeNull();
      expect(resolveClipboardCommand(key('ArrowDown'), { mode: 'merge-picker' })).toBeNull();
      expect(resolveClipboardCommand(key('Escape'), { mode: 'merge-picker' })).toBeNull();
    });
  });
```

You also need to update **every existing call site in this file** that constructs a `'normal'` or `'searching'` context, adding `visibleMarkedCount: 0` (so the existing tests keep passing). Do a search-and-replace inside the file:

- `{ mode: 'normal' }` → `{ mode: 'normal', visibleMarkedCount: 0 }`
- `{ mode: 'searching' }` → `{ mode: 'searching', visibleMarkedCount: 0 }`

(The `'editing'` and `'transform-picker'` contexts stay as-is.)

**Also patch the only other call site** so the project compiles at the end of this task: in `src/app/features/clipboard-list/clipboard-tab.component.ts`, locate `buildContext()` and update the two `'normal'` / `'searching'` returns. Existing version:

```ts
  private buildContext(): ClipboardKeyContext {
    if (this.selection.editingEntry())
      return { mode: 'editing', entryId: this.selection.editingEntry()!.id };
    if (this.showTransformPicker()) return { mode: 'transform-picker' };
    if (this.isSearching()) return { mode: 'searching' };
    return { mode: 'normal' };
  }
```

Change the last two lines to pass `visibleMarkedCount: 0` as a placeholder; Task 7 replaces this with the real signal:

```ts
    if (this.isSearching()) return { mode: 'searching', visibleMarkedCount: 0 };
    return { mode: 'normal', visibleMarkedCount: 0 };
```

(Don't add the `merge-picker` branch yet — Task 7 adds it together with `showMergePicker`.)

- [ ] **Step 2: Run tests to verify failure**

Run: `pnpm vitest run src/app/features/clipboard-list/clipboard-command-resolver.spec.ts`
Expected: FAIL — TypeScript error on `visibleMarkedCount` (not yet on the type), and FAIL on new tests for unknown commands / unhandled cases.

- [ ] **Step 3: Update resolver**

Replace the contents of `src/app/features/clipboard-list/clipboard-command-resolver.ts` with:

```ts
export type ClipboardKeyContext =
  | { mode: 'normal'; visibleMarkedCount: number }
  | { mode: 'searching'; visibleMarkedCount: number }
  | { mode: 'editing'; entryId: number }
  | { mode: 'transform-picker' }
  | { mode: 'merge-picker' };

export type ClipboardCommand =
  | { type: 'move-up' }
  | { type: 'move-down' }
  | { type: 'copy-selected' }
  | { type: 'open-transform-picker' }
  | { type: 'open-merge-picker' }
  | { type: 'delete-selected' }
  | { type: 'pin-selected' }
  | { type: 'enter-edit' }
  | { type: 'trigger-ocr' }
  | { type: 'quick-paste'; digit: number }
  | { type: 'start-search'; char: string }
  | { type: 'exit-search' }
  | { type: 'cancel-edit' }
  | { type: 'toggle-mark' }
  | { type: 'clear-marks' }
  | { type: 'hide-popup' };

export function resolveClipboardCommand(
  event: KeyboardEvent,
  context: ClipboardKeyContext,
): ClipboardCommand | null {
  if (event.ctrlKey && event.key === 'Tab') return null;

  if (context.mode === 'transform-picker' || context.mode === 'merge-picker') return null;

  if (context.mode === 'editing') {
    if (event.key === 'Escape' || event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      return { type: 'cancel-edit' };
    }
    return null;
  }

  const quickPasteDigit = resolveQuickPasteDigit(event);
  if (quickPasteDigit !== null) return { type: 'quick-paste', digit: quickPasteDigit };

  if (context.mode === 'searching') {
    switch (event.key) {
      case 'ArrowDown':
        return { type: 'move-down' };
      case 'ArrowUp':
        return { type: 'move-up' };
      case 'Enter':
        if (event.shiftKey) return { type: 'open-transform-picker' };
        return context.visibleMarkedCount >= 2
          ? { type: 'open-merge-picker' }
          : { type: 'copy-selected' };
      case 'Escape':
        return { type: 'exit-search' };
      default:
        return null;
    }
  }

  // normal mode
  switch (event.key) {
    case 'ArrowDown':
      return { type: 'move-down' };
    case 'ArrowUp':
      return { type: 'move-up' };
    case 'Enter':
      if (event.shiftKey) return { type: 'open-transform-picker' };
      return context.visibleMarkedCount >= 2
        ? { type: 'open-merge-picker' }
        : { type: 'copy-selected' };
    case 'Delete':
      return { type: 'delete-selected' };
    case 'Escape':
      return context.visibleMarkedCount > 0
        ? { type: 'clear-marks' }
        : { type: 'hide-popup' };
    case ' ':
      // Space toggles the mark on the focused row in normal mode.
      // Reject when modifiers are held; let those bubble or no-op.
      if (event.ctrlKey || event.shiftKey || event.altKey || event.metaKey) return null;
      return { type: 'toggle-mark' };
  }

  if (event.ctrlKey && !event.shiftKey && !event.altKey && !event.metaKey) {
    const k = event.key.toLowerCase();
    if (k === 'p') return { type: 'pin-selected' };
    if (k === 'e') return { type: 'enter-edit' };
    if (k === 'o') return { type: 'trigger-ocr' };
    return null;
  }

  if (event.key.length === 1 && !event.ctrlKey && !event.altKey && !event.metaKey) {
    return { type: 'start-search', char: event.key };
  }

  return null;
}

function resolveQuickPasteDigit(event: KeyboardEvent): number | null {
  if (!event.ctrlKey || event.shiftKey || event.altKey || event.metaKey) return null;
  const digit = parseInt(event.key, 10);
  return digit >= 1 && digit <= 9 ? digit : null;
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm vitest run src/app/features/clipboard-list/clipboard-command-resolver.spec.ts`
Expected: PASS — all old and new cases.

Also run: `pnpm tsc -p tsconfig.app.json --noEmit`
Expected: no errors. (Catches any consumer of `ClipboardKeyContext` that wasn't updated above.)

- [ ] **Step 5: Format**

Run: `pnpm prettier --write src/app/features/clipboard-list/clipboard-command-resolver.ts src/app/features/clipboard-list/clipboard-command-resolver.spec.ts src/app/features/clipboard-list/clipboard-tab.component.ts`

- [ ] **Step 6: Commit**

```powershell
git add src/app/features/clipboard-list/clipboard-command-resolver.ts src/app/features/clipboard-list/clipboard-command-resolver.spec.ts src/app/features/clipboard-list/clipboard-tab.component.ts
git commit -m @'
feat(resolver): add Space/Enter/Esc behavior for marked-set merge

Space in normal mode now emits toggle-mark. Enter is smart: if
visibleMarkedCount >= 2 it opens the merge picker, else copies the
focused row. Escape clears marks first; a second Escape closes the popup.
Shift+Enter and Ctrl+1-9 are unchanged. Adds merge-picker mode that
returns null (component handles its own keys), mirroring transform-picker.
Patches buildContext in ClipboardTabComponent to pass visibleMarkedCount: 0
as a placeholder so the project compiles; Task 7 wires the real value.
'@
```

---

## Task 5: Merge picker component

**Files:**
- Create: `src/app/features/clipboard-list/merge-picker.component.ts`
- Test: `src/app/features/clipboard-list/merge-picker.component.spec.ts`

- [ ] **Step 1: Write failing test**

Create `src/app/features/clipboard-list/merge-picker.component.spec.ts`:

```ts
import { MergePickerComponent, MERGE_OPTIONS } from './merge-picker.component';

describe('MergePickerComponent', () => {
  it('is defined', () => {
    expect(MergePickerComponent).toBeDefined();
  });

  it('exposes three options in fixed order: newline, bullet, comma', () => {
    expect(MERGE_OPTIONS.map((o) => o.id)).toEqual(['newline', 'bullet', 'comma']);
  });

  it('every option has an i18n labelKey under MERGE.*', () => {
    for (const opt of MERGE_OPTIONS) {
      expect(opt.labelKey.startsWith('MERGE.')).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/app/features/clipboard-list/merge-picker.component.spec.ts`
Expected: FAIL with "Cannot find module './merge-picker.component'".

- [ ] **Step 3: Create the component**

Create `src/app/features/clipboard-list/merge-picker.component.ts`:

```ts
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterNextRender,
  inject,
  output,
  signal,
} from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { MergeSeparator } from '../../core/utils/merge-entries';

interface MergeOption {
  id: MergeSeparator;
  labelKey: string;
}

export const MERGE_OPTIONS: readonly MergeOption[] = [
  { id: 'newline', labelKey: 'MERGE.NEWLINE' },
  { id: 'bullet', labelKey: 'MERGE.BULLET_LIST' },
  { id: 'comma', labelKey: 'MERGE.COMMA' },
];

@Component({
  selector: 'app-merge-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe],
  host: {
    class:
      'absolute left-0 right-0 z-50 mt-0.5 bg-popover border border-border rounded-lg shadow-xl outline-none',
    tabindex: '0',
    '(keydown)': 'onKeyDown($event)',
  },
  template: `
    <div class="p-1.5">
      @for (opt of options; track opt.id; let i = $index) {
        <button
          type="button"
          [class]="
            'w-full text-left text-[12px] px-2.5 py-1.5 rounded transition-colors ' +
            (cursor() === i ? 'bg-accent text-accent-foreground' : 'text-foreground hover:bg-muted')
          "
          (click)="confirm(i)"
        >
          {{ opt.labelKey | translate }}
        </button>
      }
    </div>
  `,
})
export class MergePickerComponent {
  applied = output<{ separator: MergeSeparator }>();
  cancelled = output<void>();

  protected readonly options = MERGE_OPTIONS;
  protected cursor = signal(0);

  private readonly el = inject(ElementRef);

  constructor() {
    afterNextRender(() => this.el.nativeElement.focus());
  }

  protected onKeyDown(event: KeyboardEvent): void {
    const lastIndex = this.options.length - 1;

    switch (event.key) {
      case 'ArrowDown':
        this.cursor.update((c) => Math.min(c + 1, lastIndex));
        event.preventDefault();
        event.stopPropagation();
        break;
      case 'ArrowUp':
        this.cursor.update((c) => Math.max(c - 1, 0));
        event.preventDefault();
        event.stopPropagation();
        break;
      case 'Enter':
        this.apply();
        event.preventDefault();
        event.stopPropagation();
        break;
      case 'Escape':
        this.cancelled.emit();
        event.preventDefault();
        event.stopPropagation();
        break;
    }
  }

  protected confirm(index: number): void {
    this.cursor.set(index);
    this.apply();
  }

  private apply(): void {
    const opt = this.options[this.cursor()];
    this.applied.emit({ separator: opt.id });
  }
}
```

- [ ] **Step 4: Run test**

Run: `pnpm vitest run src/app/features/clipboard-list/merge-picker.component.spec.ts`
Expected: PASS.

- [ ] **Step 5: Format**

Run: `pnpm prettier --write src/app/features/clipboard-list/merge-picker.component.ts src/app/features/clipboard-list/merge-picker.component.spec.ts`

- [ ] **Step 6: Commit**

```powershell
git add src/app/features/clipboard-list/merge-picker.component.ts src/app/features/clipboard-list/merge-picker.component.spec.ts
git commit -m @'
feat(merge-picker): add three-option separator picker component

Mirrors TransformPickerComponent: ArrowUp/Down/Enter/Escape, focused on
mount, anchored as an absolute overlay. Emits applied({ separator }) for
newline / bullet / comma.
'@
```

---

## Task 6: Checkbox column on `ClipboardEntryComponent`

**Files:**
- Modify: `src/app/features/clipboard-list/clipboard-entry.component.ts`

- [ ] **Step 1: Add inputs and output**

In `src/app/features/clipboard-list/clipboard-entry.component.ts`, locate the input/output declarations inside the `ClipboardEntryComponent` class. The existing block looks like:

```ts
  entry = input.required<ClipboardEntry>();
  selected = input(false);
  editMode = input(false);
  ocrLoading = input(false);
  shortcutIndex = input<number | null>(null);

  select = output<void>();
  delete = output<void>();
  pin = output<void>();
  editConfirm = output<string>();
  editCancel = output<void>();
```

Replace it with:

```ts
  entry = input.required<ClipboardEntry>();
  selected = input(false);
  editMode = input(false);
  ocrLoading = input(false);
  shortcutIndex = input<number | null>(null);
  marked = input(false);
  showCheckbox = input(false);

  select = output<void>();
  delete = output<void>();
  pin = output<void>();
  editConfirm = output<string>();
  editCancel = output<void>();
  toggleMark = output<void>();
```

- [ ] **Step 2: Render checkbox column in the template**

In the same file's template, locate the `<span>` that holds the shortcut digit:

```html
        <span
          class="w-4 shrink-0 text-[11px] text-muted-foreground font-mono tabular-nums text-right select-none"
        >
          @if (shortcutIndex() !== null) {
            {{ shortcutIndex() }}
          }
        </span>
```

Insert a new checkbox column **immediately before** that span (so the checkbox is to the left of the digit). The checkbox is only rendered when `showCheckbox()` is true, and only acts on text entries:

```html
        @if (showCheckbox()) {
          <span
            class="w-5 shrink-0 flex items-center justify-center"
            (click)="$event.stopPropagation(); onCheckboxClick()"
          >
            @if (entry().kind === 'text') {
              <span
                [class]="
                  'w-3.5 h-3.5 rounded border flex items-center justify-center transition-colors ' +
                  (marked()
                    ? 'bg-brand border-brand text-background'
                    : 'border-muted-foreground/40 hover:border-foreground')
                "
              >
                @if (marked()) {
                  <svg
                    viewBox="0 0 12 12"
                    class="w-3 h-3"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  >
                    <polyline points="2 6 5 9 10 3" />
                  </svg>
                }
              </span>
            }
          </span>
        }
```

- [ ] **Step 3: Add `onCheckboxClick` handler**

In the same class, after `protected onOuterClick()`, add:

```ts
  protected onCheckboxClick(): void {
    if (this.entry().kind !== 'text') return;
    this.toggleMark.emit();
  }
```

- [ ] **Step 4: Verify the project compiles**

Run: `pnpm tsc -p tsconfig.app.json --noEmit`
Expected: no errors. The new inputs default to `false`/no-op; existing call sites (clipboard-tab) still compile.

- [ ] **Step 5: Format**

Run: `pnpm prettier --write src/app/features/clipboard-list/clipboard-entry.component.ts`

- [ ] **Step 6: Commit**

```powershell
git add src/app/features/clipboard-list/clipboard-entry.component.ts
git commit -m @'
feat(entry): add checkbox column for marking entries in merge mode

The column renders only when showCheckbox is true (driven by parent: any
entry visible-and-marked). Checkbox is hidden on image rows even when
the column is visible, since images are not markable. Click on the
checkbox cell stops propagation so the row click (paste) is unchanged.
'@
```

---

## Task 7: Wire up `ClipboardTabComponent`

**Files:**
- Modify: `src/app/features/clipboard-list/clipboard-tab.component.ts`

This is the largest single edit. Walk through each step.

- [ ] **Step 1: Update imports and provideIcons**

At the top of the file, import the new pieces and types. Locate the existing import lines:

```ts
import { ClipboardEntryComponent } from './clipboard-entry.component';
import { TransformPickerComponent } from './transform-picker.component';
```

Add right after them:

```ts
import { MergePickerComponent } from './merge-picker.component';
import { mergeEntries, MergeSeparator } from '../../core/utils/merge-entries';
```

Locate the existing `provideIcons` line:

```ts
  providers: [provideIcons({ lucideSearch, lucideX })],
```

(No change here yet — `lucideX` is already in.)

In the `imports: [...]` array of `@Component`, add `MergePickerComponent`:

```ts
  imports: [
    ClipboardEntryComponent,
    TransformPickerComponent,
    MergePickerComponent,
    SkeletonListComponent,
    EmptyStateComponent,
    NgIcon,
    HlmIcon,
    HlmButton,
    TranslatePipe,
  ],
```

- [ ] **Step 2: Add merge state and computeds in the class body**

After the existing line:

```ts
  protected showTransformPicker = signal(false);
```

add:

```ts
  protected showMergePicker = signal(false);
```

After the `filteredEntries` computed (the one that ends with `return rx ? filterClipboardEntriesByRegex(base, rx) : base;`), add:

```ts
  protected visibleMarkedCount = computed(
    () => this.filteredEntries().filter((e) => this.selection.isMarked(e.id)).length,
  );

  protected showCheckboxColumn = computed(() => this.visibleMarkedCount() > 0);
```

- [ ] **Step 3: Update the filter row to host the "N selected ×" badge**

Locate the existing filter row in the template:

```html
    <div
      class="flex items-center justify-end px-3.5 h-[34px] shrink-0 bg-card/50 border-b border-border"
    >
      <div class="flex items-center gap-1">
        @for (f of filters; track f.value) {
          ...
        }
      </div>
    </div>
```

Replace with:

```html
    <div
      class="flex items-center justify-between gap-2 px-3.5 h-[34px] shrink-0 bg-card/50 border-b border-border"
    >
      @if (visibleMarkedCount() > 0) {
        <button
          type="button"
          class="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-brand/20 text-brand-300 border border-brand/30 hover:bg-brand/30 transition-colors"
          (click)="onClearMarks()"
          [attr.aria-label]="'CLIPBOARD.CLEAR_MARKS' | translate"
        >
          <span>{{
            'CLIPBOARD.MARKED_COUNT' | translate: { count: visibleMarkedCount() }
          }}</span>
          <ng-icon hlm size="sm" name="lucideX" class="w-3 h-3" />
        </button>
      } @else {
        <span></span>
      }
      <div class="flex items-center gap-1">
        @for (f of filters; track f.value) {
          <button
            class="text-[11px] px-2 py-0.5 rounded-full border transition-colors"
            [class]="
              activeFilter() === f.value
                ? 'bg-brand/20 text-brand-300 border-brand/30'
                : 'text-muted-foreground border-transparent hover:text-foreground'
            "
            (click)="setFilter(f.value)"
          >
            {{ f.labelKey | translate }}
          </button>
        }
      </div>
    </div>
```

- [ ] **Step 4: Pass mark inputs to entries and add merge picker overlay**

Locate the entry rendering block:

```html
          @for (entry of filteredEntries(); track entry.id; let i = $index) {
            <div class="entry-item relative">
              <app-clipboard-entry
                [entry]="entry"
                [selected]="selection.selectedIndex() === i"
                [editMode]="selection.editingEntry()?.id === entry.id"
                [ocrLoading]="ocrLoadingEntryId() === entry.id"
                [shortcutIndex]="i < 9 ? i + 1 : null"
                (select)="selectEntry(i)"
                (delete)="deleteEntry(i)"
                (pin)="pinEntry(i)"
                (editConfirm)="onEditConfirm($event)"
                (editCancel)="onEditCancel()"
              />
              @if (
                showTransformPicker() && selection.selectedIndex() === i && entry.kind === 'text'
              ) {
                <app-transform-picker
                  [content]="entry.content ?? ''"
                  (applied)="onTransformApplied($event)"
                  (cancelled)="onTransformCancelled()"
                  (click)="$event.stopPropagation()"
                />
              }
            </div>
          }
```

Replace with:

```html
          @for (entry of filteredEntries(); track entry.id; let i = $index) {
            <div class="entry-item relative">
              <app-clipboard-entry
                [entry]="entry"
                [selected]="selection.selectedIndex() === i"
                [editMode]="selection.editingEntry()?.id === entry.id"
                [ocrLoading]="ocrLoadingEntryId() === entry.id"
                [shortcutIndex]="i < 9 ? i + 1 : null"
                [marked]="selection.isMarked(entry.id)"
                [showCheckbox]="showCheckboxColumn()"
                (select)="selectEntry(i)"
                (delete)="deleteEntry(i)"
                (pin)="pinEntry(i)"
                (toggleMark)="onToggleMarkFromMouse(entry)"
                (editConfirm)="onEditConfirm($event)"
                (editCancel)="onEditCancel()"
              />
              @if (
                showTransformPicker() && selection.selectedIndex() === i && entry.kind === 'text'
              ) {
                <app-transform-picker
                  [content]="entry.content ?? ''"
                  (applied)="onTransformApplied($event)"
                  (cancelled)="onTransformCancelled()"
                  (click)="$event.stopPropagation()"
                />
              }
              @if (showMergePicker() && selection.selectedIndex() === i) {
                <app-merge-picker
                  (applied)="onMergeApplied($event)"
                  (cancelled)="onMergeCancelled()"
                  (click)="$event.stopPropagation()"
                />
              }
            </div>
          }
```

- [ ] **Step 5: Update `resetState`, `buildContext`, and `onHostClick`**

Locate `resetState`:

```ts
  private resetState(): void {
    this.selection.exitEditMode();
    this.selection.selectAt(0);
    this.activeFilter.set('all');
    this.clearSearch();
    this.showTransformPicker.set(false);
    this.ocrLoadingEntryId.set(null);
    this.emitSelectedEntry();
  }
```

Replace with:

```ts
  private resetState(): void {
    this.selection.exitEditMode();
    this.selection.selectAt(0);
    this.selection.clearMarks();
    this.activeFilter.set('all');
    this.clearSearch();
    this.showTransformPicker.set(false);
    this.showMergePicker.set(false);
    this.ocrLoadingEntryId.set(null);
    this.emitSelectedEntry();
  }
```

Locate `buildContext`:

```ts
  private buildContext(): ClipboardKeyContext {
    if (this.selection.editingEntry())
      return { mode: 'editing', entryId: this.selection.editingEntry()!.id };
    if (this.showTransformPicker()) return { mode: 'transform-picker' };
    if (this.isSearching()) return { mode: 'searching' };
    return { mode: 'normal' };
  }
```

Replace with:

```ts
  private buildContext(): ClipboardKeyContext {
    if (this.selection.editingEntry())
      return { mode: 'editing', entryId: this.selection.editingEntry()!.id };
    if (this.showTransformPicker()) return { mode: 'transform-picker' };
    if (this.showMergePicker()) return { mode: 'merge-picker' };
    if (this.isSearching())
      return { mode: 'searching', visibleMarkedCount: this.visibleMarkedCount() };
    return { mode: 'normal', visibleMarkedCount: this.visibleMarkedCount() };
  }
```

Locate `onHostClick`:

```ts
  protected onHostClick(): void {
    if (this.showTransformPicker()) {
      this.showTransformPicker.set(false);
    }
  }
```

Replace with:

```ts
  protected onHostClick(): void {
    if (this.showTransformPicker()) {
      this.showTransformPicker.set(false);
    }
    if (this.showMergePicker()) {
      this.showMergePicker.set(false);
    }
  }
```

- [ ] **Step 6: Add new dispatch branches and handler methods**

Locate the `dispatch(command)` switch and add three new cases inside it (insert them before the existing `case 'hide-popup':`):

```ts
      case 'toggle-mark': {
        const entry = this.filteredEntries()[this.selection.selectedIndex()];
        if (entry) this.selection.toggleMark(entry.id, entry.kind);
        break;
      }
      case 'open-merge-picker':
        this.openMergePicker();
        break;
      case 'clear-marks':
        this.selection.clearMarks();
        break;
```

Now add the handler methods at the bottom of the class (just before the closing `}`):

```ts
  protected onClearMarks(): void {
    this.selection.clearMarks();
  }

  protected onToggleMarkFromMouse(entry: ClipboardEntry): void {
    this.selection.toggleMark(entry.id, entry.kind);
  }

  private openMergePicker(): void {
    if (this.visibleMarkedCount() < 2) return;
    this.showMergePicker.set(true);
  }

  protected async onMergeApplied(event: { separator: MergeSeparator }): Promise<void> {
    const orderedContents = this.filteredEntries()
      .filter((e) => e.kind === 'text' && this.selection.isMarked(e.id))
      .map((e) => e.content ?? '');
    const merged = mergeEntries(orderedContents, event.separator);
    this.showMergePicker.set(false);
    this.selection.clearMarks();
    try {
      await this.bridge.setClipboardText(merged);
      this.bridge.hidePopup();
    } catch {
      toast.error(this.translate.instant('CLIPBOARD.EDIT_COPY_FAILED'));
    }
  }

  protected onMergeCancelled(): void {
    this.showMergePicker.set(false);
  }
```

- [ ] **Step 7: Unmark deleted entries**

Locate `deleteEntry(index)`:

```ts
  protected deleteEntry(index: number): void {
    const entry = this.filteredEntries()[index];
    if (!entry) return;
    const currentIndex = this.selection.selectedIndex();
    const newLen = this.filteredEntries().length - 1;
    this.clipboard.deleteEntry(entry.id);
    this.selection.selectAt(Math.min(currentIndex, Math.max(0, newLen - 1)));
    this.emitSelectedEntry();
  }
```

Replace with (one extra line — `this.selection.unmark(entry.id);`):

```ts
  protected deleteEntry(index: number): void {
    const entry = this.filteredEntries()[index];
    if (!entry) return;
    const currentIndex = this.selection.selectedIndex();
    const newLen = this.filteredEntries().length - 1;
    this.selection.unmark(entry.id);
    this.clipboard.deleteEntry(entry.id);
    this.selection.selectAt(Math.min(currentIndex, Math.max(0, newLen - 1)));
    this.emitSelectedEntry();
  }
```

- [ ] **Step 8: Compile + run all clipboard-list tests**

Run: `pnpm tsc -p tsconfig.app.json --noEmit`
Expected: no errors.

Run: `pnpm vitest run src/app/features/clipboard-list`
Expected: PASS.

- [ ] **Step 9: Format**

Run: `pnpm prettier --write src/app/features/clipboard-list/clipboard-tab.component.ts`

- [ ] **Step 10: Commit**

```powershell
git add src/app/features/clipboard-list/clipboard-tab.component.ts
git commit -m @'
feat(clipboard-tab): wire up multi-mark and merge picker

Adds visibleMarkedCount + showCheckboxColumn computeds; renders the
"N selected x" badge in the filter row; wires Space, Enter (smart),
and Escape commands to mark/merge/clear; renders MergePickerComponent
inline below the focused row when active. resetState now also clears
marks and hides the merge picker. deleteEntry unmarks the deleted ID.
onMergeApplied filters visible-and-marked text entries in list order,
joins them via mergeEntries, writes via setClipboardText, and hides
the popup.
'@
```

---

## Task 8: Footer hint swap

**Files:**
- Modify: `src/app/features/clipboard-list/clipboard-footer-hints.component.ts`
- Modify: `src/app/features/clipboard-list/clipboard-tab.component.ts` (re-emit)
- Modify: `src/app/features/clipboard-list/clipboard-list.component.ts` (pipe value through)

The footer is rendered by `ClipboardListComponent` (the parent), not by `ClipboardTabComponent`. We need to surface the marked-count state up from the tab to the list, then into the footer-hints component.

- [ ] **Step 1: Add `mergeMode` input to footer hints**

Replace `src/app/features/clipboard-list/clipboard-footer-hints.component.ts` with:

```ts
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { KeyboardHintComponent } from '../../shared/ui/keyboard-hint/keyboard-hint.component';

@Component({
  selector: 'app-clipboard-footer-hints',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [KeyboardHintComponent, TranslatePipe],
  template: `
    <div class="flex items-center gap-2">
      <app-keyboard-hint key="↑↓" [label]="'CLIPBOARD.HINT_NAV' | translate" />
      <app-keyboard-hint key="↵" [label]="primaryEnterLabel() | translate" />
      <app-keyboard-hint key="⇧↵" [label]="'TRANSFORM.HINT' | translate" />
      <app-keyboard-hint key="⌫" [label]="'CLIPBOARD.HINT_DELETE' | translate" />
      <span class="ml-auto text-[10px] text-muted-foreground whitespace-nowrap">
        {{ 'CLIPBOARD.HINT_SEARCH' | translate }}
      </span>
    </div>
    <div class="flex items-center gap-2">
      <app-keyboard-hint key="Ctrl+P" [label]="'CLIPBOARD.HINT_PIN' | translate" />
      <app-keyboard-hint key="Ctrl+E" [label]="'CLIPBOARD.HINT_EDIT' | translate" />
      @if (showOcrHint()) {
        <app-keyboard-hint key="Ctrl+O" [label]="'OCR.KEYBOARD_HINT' | translate" />
      }
      <app-keyboard-hint key="Ctrl+1–9" [label]="'CLIPBOARD.HINT_QUICK_PASTE' | translate" />
      <app-keyboard-hint key="Esc" [label]="'CLIPBOARD.HINT_CLOSE' | translate" class="ml-auto" />
    </div>
  `,
})
export class ClipboardFooterHintsComponent {
  showOcrHint = input(false);
  mergeMode = input(false);

  protected primaryEnterLabel = computed(() =>
    this.mergeMode() ? 'CLIPBOARD.HINT_MERGE' : 'CLIPBOARD.HINT_PASTE',
  );
}
```

- [ ] **Step 2: Re-emit visibleMarkedCount from tab → list**

In `src/app/features/clipboard-list/clipboard-tab.component.ts`, add an output near the existing `selectedEntry` output:

```ts
  selectedEntry = output<ClipboardEntry | null>();
  visibleMarkedCountChange = output<number>();
```

Then add an effect in the `constructor` to emit changes (place it after the existing `bus.popupShown$` subscription block):

```ts
    effect(() => {
      this.visibleMarkedCountChange.emit(this.visibleMarkedCount());
    });
```

You'll need to also import `effect` from `@angular/core` — at the top of the file, locate:

```ts
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
```

Replace with:

```ts
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
```

- [ ] **Step 3: Pipe through `ClipboardListComponent`**

In `src/app/features/clipboard-list/clipboard-list.component.ts`:

In the class body, after `protected captureIsPaused = signal(false);`, add:

```ts
  protected visibleMarkedCount = signal(0);
  protected mergeMode = computed(() => this.visibleMarkedCount() >= 2);
```

In the template, locate the existing `<app-clipboard-tab ...>` element. It currently looks like:

```html
        <app-clipboard-tab
          [tab]="activeClipboardTab()"
          class="flex-1 min-h-0"
          (selectedEntry)="onSelectedEntry($event)"
        />
```

Replace with:

```html
        <app-clipboard-tab
          [tab]="activeClipboardTab()"
          class="flex-1 min-h-0"
          (selectedEntry)="onSelectedEntry($event)"
          (visibleMarkedCountChange)="visibleMarkedCount.set($event)"
        />
```

Then locate the footer block:

```html
        @if (activeTab() === 'snippets') {
          <app-snippets-footer-hints />
        } @else {
          <app-clipboard-footer-hints [showOcrHint]="showOcrHint()" />
        }
```

Replace with:

```html
        @if (activeTab() === 'snippets') {
          <app-snippets-footer-hints />
        } @else {
          <app-clipboard-footer-hints [showOcrHint]="showOcrHint()" [mergeMode]="mergeMode()" />
        }
```

In the same file, the `bus.popupShown$` subscription should also reset our new state:

```ts
    this.bus.popupShown$.pipe(takeUntilDestroyed()).subscribe(() => {
      this.activeTab.set('recent');
      this.selectedEntrySignal.set(null);
      this.bridge.getCapturePaused().then((paused) => this.captureIsPaused.set(paused));
      this.suppressPositionSave = true;
      setTimeout(() => (this.suppressPositionSave = false), 600);
      setTimeout(() => this.focusActiveTab());
    });
```

Add one extra line — `this.visibleMarkedCount.set(0);` — inside the callback (the tab will re-emit through `visibleMarkedCountChange` once it resets, but resetting eagerly here avoids a stale-flicker if the tab takes a beat):

```ts
    this.bus.popupShown$.pipe(takeUntilDestroyed()).subscribe(() => {
      this.activeTab.set('recent');
      this.selectedEntrySignal.set(null);
      this.visibleMarkedCount.set(0);
      this.bridge.getCapturePaused().then((paused) => this.captureIsPaused.set(paused));
      this.suppressPositionSave = true;
      setTimeout(() => (this.suppressPositionSave = false), 600);
      setTimeout(() => this.focusActiveTab());
    });
```

Make sure `computed` is imported at the top of `clipboard-list.component.ts` (it's already imported per the existing file — verify before saving).

- [ ] **Step 4: Compile + run tests**

Run: `pnpm tsc -p tsconfig.app.json --noEmit`
Expected: no errors.

Run: `pnpm vitest run src/app/features/clipboard-list`
Expected: PASS.

- [ ] **Step 5: Format**

Run: `pnpm prettier --write src/app/features/clipboard-list/clipboard-footer-hints.component.ts src/app/features/clipboard-list/clipboard-tab.component.ts src/app/features/clipboard-list/clipboard-list.component.ts`

- [ ] **Step 6: Commit**

```powershell
git add src/app/features/clipboard-list/clipboard-footer-hints.component.ts src/app/features/clipboard-list/clipboard-tab.component.ts src/app/features/clipboard-list/clipboard-list.component.ts
git commit -m @'
feat(footer-hints): swap "paste" hint to "merge" when 2+ marked

ClipboardTabComponent re-emits visibleMarkedCount via a new output;
ClipboardListComponent stores it and derives mergeMode (>= 2). The
footer-hints component takes mergeMode and uses CLIPBOARD.HINT_MERGE
in place of CLIPBOARD.HINT_PASTE for the Enter key when on.
'@
```

---

## Task 9: Manual smoke test

**No file changes** — purely a verification pass with the running app.

- [ ] **Step 1: Start the app**

Run: `pnpm tauri dev`
Wait until the popup window can be triggered with Ctrl+; (or whatever shortcut your machine has bound).

- [ ] **Step 2: Walk the golden path**

1. Copy three text snippets into the clipboard, e.g. "Apple", "Banana", "Cherry".
2. Open the popup with Ctrl+; — verify Recent tab shows them in newest-first order (Cherry, Banana, Apple).
3. With cursor on first row, press **Space** — checkbox column appears, first row marked, badge "1 selected ×" shows in the filter row.
4. ArrowDown, Space — second row marked. Badge "2 selected ×". Footer shows "↵ merge" (not "paste").
5. ArrowDown, Space — third row marked. Badge "3 selected ×".
6. Press **Enter** — merge picker opens below the focused row, "Newline" highlighted, popup not yet closed.
7. ArrowDown to "Bullet list", Enter. Popup closes.
8. In any text app, press Ctrl+V — paste should be three lines, each prefixed with `- `.

- [ ] **Step 3: Walk error/edge paths**

1. Reopen popup. Mark two text entries, then ArrowDown to a fourth (unmarked) row. Press Ctrl+1 — Ctrl+1 still pastes the first row as a single item (marks ignored by Ctrl+digit).
2. Reopen. Mark three. Press Esc — marks clear, popup stays open. Press Esc again — popup closes.
3. Reopen. Mark a text row, then ArrowDown to an image row, press Space — nothing happens (no error, no toast). The image row's checkbox slot is empty even though the column is visible.
4. Reopen. Mark two, type 'b' to filter — search bar opens with "b" prefilled. Marks survive. If Banana is the only Banana visible, badge updates to "1 selected" (the other marked entry is filtered out). Press Esc — exits search, marks come back into view.
5. Reopen. Mark one, click the row body of another entry — the clicked row pastes immediately (today's behavior, not toggled).
6. Reopen. Mark three, click the × on the badge — marks clear, column disappears.

- [ ] **Step 4: i18n check**

Switch language to German in Settings. Repeat step 2 — verify the badge says "3 ausgewählt", picker options say "Zeilenumbruch / Aufzählung / Komma", and footer hint says "zusammenfügen".

- [ ] **Step 5: If any path fails, file an issue and stop**

Don't try to fix the manual test by editing tests or skipping cases. If a behavior diverges from the design, return to the relevant prior task and fix the implementation, then re-run the manual test.

- [ ] **Step 6: No commit needed for this task**

This task is verification only.

---

## Self-review checklist

Run through this once when all tasks are done:

1. **Spec coverage:**
   - [ ] Mechanism (merge w/ separator) — Task 1, 5, 7
   - [ ] Multi-select via Space — Task 4 (resolver), Task 7 (dispatch)
   - [ ] Trigger via smart Enter — Task 4
   - [ ] Merge order list-top-down — Task 7 (`filteredEntries().filter(...)`)
   - [ ] Three separators (newline / bullet / comma) — Task 1, 5, 2
   - [ ] Trim + skip-empty — Task 1
   - [ ] Images not markable — Task 3 (`toggleMark` no-op for image kind), Task 6 (template)
   - [ ] Snippets tab untouched — confirmed; no edits to `snippets-tab.component.ts`
   - [ ] Marks by entry ID, persist across filter/search/tab — Task 3 (plain signal, not linkedSignal)
   - [ ] Cleared on popup hide / merge / Esc-with-marks / entry delete — Tasks 7 (resetState, onMergeApplied, dispatch 'clear-marks', deleteEntry)
   - [ ] Shift+Enter and Ctrl+1-9 ignore marks — Task 4 (Shift+Enter routes before mark check; quick-paste is resolved before normal-mode switch)
   - [ ] Click row body still pastes — Task 6 (checkbox cell stops propagation)
   - [ ] "N selected ×" badge in filter row — Task 7
   - [ ] Footer hint swap "paste" → "merge" — Task 8

2. **Placeholder scan:** No "TBD", "implement later", or "see Task N" in code blocks. ✓

3. **Type / signature consistency:**
   - `MergeSeparator` defined in Task 1, used in Tasks 5 and 7. ✓
   - `ClipboardKeyContext` updated in Task 4 (adds `visibleMarkedCount`); consumers in Task 7's `buildContext` pass it correctly. ✓
   - `toggleMark(id, kind)` signature consistent across Tasks 3 (declaration), 7 (call sites). ✓
   - `MergePickerComponent.applied` emits `{ separator: MergeSeparator }` in Task 5; consumed in Task 7's `onMergeApplied(event)`. ✓
   - `ClipboardEntryComponent.toggleMark` output declared in Task 6 with type `output<void>`; consumed in Task 7's template `(toggleMark)="onToggleMarkFromMouse(entry)"` (the entry argument comes from the for-loop binding, not from the event). ✓

---

## Out of scope

- Multi-select / merge in the **Snippets tab**. (Mentioned in grill — explicit decision A.)
- **Range select** with Shift+Arrow.
- **Selection-order merging** (we always use list order top-down).
- **Transform-then-merge** or **merge-then-transform** combined operations.
- **OCR-on-merge** of image entries.
- **Sequential paste** (auto-advance on next popup open or on Ctrl+V interception). Different feature.
- **Persistence of marks across app restarts.** Marks are session-only, cleared every time the popup hides.
