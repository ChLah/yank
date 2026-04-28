# Quick-Paste Number Shortcuts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `Ctrl+1`–`Ctrl+9` shortcuts that paste the Nth visible entry directly from `ClipboardListComponent`.

**Architecture:** Export a pure helper `getQuickPasteDigit` (following the pattern of `resolveEditModeAction`/`shouldCancelEditOnSelect`) so the detection logic is unit-testable. Wire it into `onKeyDown` before the `isSearching` guard so it fires in both normal and search modes.

**Tech Stack:** Angular 21, TypeScript, Vitest

---

### Task 1: Write the failing tests for `getQuickPasteDigit`

**Files:**
- Modify: `src/app/features/clipboard-list/clipboard-list.component.spec.ts`

- [ ] **Step 1: Add import and test suite to the spec file**

Append to `clipboard-list.component.spec.ts` (after the last `});`):

```typescript
import { getQuickPasteDigit, resolveEditModeAction, shouldCancelEditOnSelect } from './clipboard-list.component';
```

Replace the existing import line (line 1) with:

```typescript
import { getQuickPasteDigit, resolveEditModeAction, shouldCancelEditOnSelect } from './clipboard-list.component';
```

Then append this describe block at the end of the file (after line 61 `});`):

```typescript

describe('getQuickPasteDigit', () => {
  function makeEvent(key: string, mods: Partial<KeyboardEventInit> = {}): KeyboardEvent {
    return new KeyboardEvent('keydown', { key, ctrlKey: false, shiftKey: false, altKey: false, metaKey: false, ...mods });
  }

  it('returns 1–9 for Ctrl+digit keys', () => {
    for (let d = 1; d <= 9; d++) {
      expect(getQuickPasteDigit(makeEvent(String(d), { ctrlKey: true }))).toBe(d);
    }
  });

  it('returns null for Ctrl+0', () => {
    expect(getQuickPasteDigit(makeEvent('0', { ctrlKey: true }))).toBeNull();
  });

  it('returns null when Ctrl is not held', () => {
    expect(getQuickPasteDigit(makeEvent('1'))).toBeNull();
  });

  it('returns null for Ctrl+Shift+digit', () => {
    expect(getQuickPasteDigit(makeEvent('1', { ctrlKey: true, shiftKey: true }))).toBeNull();
  });

  it('returns null for Ctrl+Alt+digit', () => {
    expect(getQuickPasteDigit(makeEvent('1', { ctrlKey: true, altKey: true }))).toBeNull();
  });

  it('returns null for Ctrl+Meta+digit', () => {
    expect(getQuickPasteDigit(makeEvent('1', { ctrlKey: true, metaKey: true }))).toBeNull();
  });

  it('returns null for Ctrl+non-digit', () => {
    expect(getQuickPasteDigit(makeEvent('a', { ctrlKey: true }))).toBeNull();
    expect(getQuickPasteDigit(makeEvent('Enter', { ctrlKey: true }))).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```
pnpm test
```

Expected: FAIL — `getQuickPasteDigit` is not exported from `./clipboard-list.component`.

---

### Task 2: Export `getQuickPasteDigit` helper

**Files:**
- Modify: `src/app/features/clipboard-list/clipboard-list.component.ts` (after line 561, the end of `shouldCancelEditOnSelect`)

- [ ] **Step 1: Append the export at the bottom of the component file**

After the closing `}` of `shouldCancelEditOnSelect` (currently the last line), append:

```typescript

/** Returns the 1-based digit (1–9) if the event is a Ctrl-only digit shortcut, otherwise null. Exported for unit testing. */
export function getQuickPasteDigit(event: KeyboardEvent): number | null {
  if (!event.ctrlKey || event.shiftKey || event.altKey || event.metaKey) return null;
  const digit = parseInt(event.key, 10);
  return digit >= 1 && digit <= 9 ? digit : null;
}
```

- [ ] **Step 2: Run tests to verify they now pass**

```
pnpm test
```

Expected: all `getQuickPasteDigit` tests PASS; all pre-existing tests still PASS.

- [ ] **Step 3: Commit**

```bash
git add src/app/features/clipboard-list/clipboard-list.component.ts src/app/features/clipboard-list/clipboard-list.component.spec.ts
git commit -m "test: add getQuickPasteDigit helper and passing unit tests"
```

---

### Task 3: Wire `getQuickPasteDigit` into `onKeyDown`

**Files:**
- Modify: `src/app/features/clipboard-list/clipboard-list.component.ts:370–372`

- [ ] **Step 1: Insert the Ctrl+digit handler**

In `onKeyDown`, between the end of the edit-mode block (line 370, `}`) and the `if (this.isSearching())` line (line 372), insert:

```typescript
    const quickPasteDigit = getQuickPasteDigit(event);
    if (quickPasteDigit !== null) {
      event.preventDefault();
      this.selectEntry(quickPasteDigit - 1);
      return;
    }

```

The surrounding context should look like this after the edit:

```typescript
    // While in edit mode, only allow arrow keys (cancel edit then navigate); block all others
    if (this.editingEntryId() !== null) {
      if (resolveEditModeAction(event.key) === 'cancel-navigate') {
        this.editingEntryId.set(null); // cancel edit, then fall through to navigation
      } else {
        return;
      }
    }

    const quickPasteDigit = getQuickPasteDigit(event);
    if (quickPasteDigit !== null) {
      event.preventDefault();
      this.selectEntry(quickPasteDigit - 1);
      return;
    }

    if (this.isSearching()) {
```

- [ ] **Step 2: Run tests to verify nothing broke**

```
pnpm test
```

Expected: all tests PASS.

- [ ] **Step 3: Commit**

```bash
git add src/app/features/clipboard-list/clipboard-list.component.ts
git commit -m "feat: add Ctrl+1–9 quick-paste shortcuts"
```

---

## Self-Review

**Spec coverage:**
- `Ctrl+1`–`Ctrl+9` paste the Nth visible entry → Task 3 wires `selectEntry(digit - 1)` ✓
- Works on Recent tab → `filteredEntries()` covers Recent ✓
- Works on Pinned tab → `filteredEntries()` covers Pinned ✓
- No Snippets tab in this codebase → N/A ✓
- If fewer than N entries visible, keypress is a no-op → `selectEntry` returns early when `entry` is undefined ✓
- Works when search is active (pastes first search result) → handler placed before `isSearching` guard, `filteredEntries()` already reflects the search filter ✓
- Does not conflict with search typing (Ctrl modifier checked first) → `getQuickPasteDigit` requires `ctrlKey` ✓
- `Ctrl+0` is unbound → `getQuickPasteDigit` returns `null` for `0` ✓
- Does not work in edit mode → edit-mode guard returns before our handler ✓
- Does not work when transform picker is open → transform picker guard at top of `onKeyDown` returns first ✓

**Placeholder scan:** No TBDs, no TODOs, all steps have code.

**Type consistency:** `getQuickPasteDigit` returns `number | null`; handler calls `this.selectEntry(quickPasteDigit - 1)` where `selectEntry` takes `number` ✓
