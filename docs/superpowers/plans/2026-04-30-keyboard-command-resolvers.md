# Keyboard Command Resolvers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract keyboard routing from `onKeyDown()` in both tab components into two pure, fully-tested resolver functions.

**Architecture:** Two new files (`clipboard-command-resolver.ts`, `snippet-command-resolver.ts`) define discriminated-union context/command types and a pure resolver function each. The three existing exported helpers (`getQuickPasteDigit`, `isOcrTrigger`, `shouldCancelEditOnSelect`) and `resolveEditModeAction` are removed as public exports; their logic is absorbed into the resolvers or inlined. Each tab component's `onKeyDown()` shrinks to: build context → resolve → if null return → preventDefault/stopPropagation → dispatch.

**Tech Stack:** Angular 21, TypeScript, Vitest (`pnpm test` / `vitest run`)

---

## File Map

| Action | File |
|--------|------|
| Create | `src/app/features/clipboard-list/clipboard-command-resolver.ts` |
| Create | `src/app/features/clipboard-list/clipboard-command-resolver.spec.ts` |
| Create | `src/app/features/clipboard-list/snippet-command-resolver.ts` |
| Create | `src/app/features/clipboard-list/snippet-command-resolver.spec.ts` |
| Modify | `src/app/features/clipboard-list/clipboard-tab.component.ts` |
| Modify | `src/app/features/clipboard-list/clipboard-tab.component.spec.ts` |
| Modify | `src/app/features/clipboard-list/snippets-tab.component.ts` |
| Delete | `src/app/features/clipboard-list/keyboard.utils.ts` |
| Delete | `src/app/features/clipboard-list/keyboard.utils.spec.ts` |

---

## Task 1: Clipboard command resolver — types, tests, implementation

**Files:**
- Create: `src/app/features/clipboard-list/clipboard-command-resolver.ts`
- Create: `src/app/features/clipboard-list/clipboard-command-resolver.spec.ts`

- [ ] **Step 1: Create the types file with a stub resolver**

Create `src/app/features/clipboard-list/clipboard-command-resolver.ts`:

```ts
export type ClipboardKeyContext =
  | { mode: 'normal' }
  | { mode: 'searching' }
  | { mode: 'editing'; entryId: number }
  | { mode: 'transform-picker' };

export type ClipboardCommand =
  | { type: 'move-up' }
  | { type: 'move-down' }
  | { type: 'copy-selected' }
  | { type: 'open-transform-picker' }
  | { type: 'delete-selected' }
  | { type: 'pin-selected' }
  | { type: 'enter-edit' }
  | { type: 'trigger-ocr' }
  | { type: 'quick-paste'; digit: number }
  | { type: 'start-search'; char: string }
  | { type: 'exit-search' }
  | { type: 'cancel-edit' }
  | { type: 'hide-popup' };

export function resolveClipboardCommand(
  _event: KeyboardEvent,
  _context: ClipboardKeyContext,
): ClipboardCommand | null {
  return null;
}
```

- [ ] **Step 2: Write the failing tests**

Create `src/app/features/clipboard-list/clipboard-command-resolver.spec.ts`:

```ts
import { resolveClipboardCommand, ClipboardKeyContext } from './clipboard-command-resolver';

function key(k: string, mods: Partial<KeyboardEventInit> = {}): KeyboardEvent {
  return new KeyboardEvent('keydown', { key: k, bubbles: true, ...mods });
}

describe('resolveClipboardCommand', () => {
  describe('Ctrl+Tab — always null (bubble to shell)', () => {
    it('returns null in normal mode', () => {
      expect(resolveClipboardCommand(key('Tab', { ctrlKey: true }), { mode: 'normal' })).toBeNull();
    });
  });

  describe('transform-picker mode — always null', () => {
    it('returns null for Enter', () => {
      expect(resolveClipboardCommand(key('Enter'), { mode: 'transform-picker' })).toBeNull();
    });
    it('returns null for ArrowDown', () => {
      expect(resolveClipboardCommand(key('ArrowDown'), { mode: 'transform-picker' })).toBeNull();
    });
  });

  describe('editing mode', () => {
    const ctx: ClipboardKeyContext = { mode: 'editing', entryId: 5 };

    it('returns cancel-edit for Escape', () => {
      expect(resolveClipboardCommand(key('Escape'), ctx)).toEqual({ type: 'cancel-edit' });
    });

    it('returns cancel-edit for ArrowDown', () => {
      expect(resolveClipboardCommand(key('ArrowDown'), ctx)).toEqual({ type: 'cancel-edit' });
    });

    it('returns cancel-edit for ArrowUp', () => {
      expect(resolveClipboardCommand(key('ArrowUp'), ctx)).toEqual({ type: 'cancel-edit' });
    });

    it('returns null for Enter (textarea handles it)', () => {
      expect(resolveClipboardCommand(key('Enter'), ctx)).toBeNull();
    });

    it('returns null for letter keys', () => {
      expect(resolveClipboardCommand(key('a'), ctx)).toBeNull();
    });

    it('returns null for Delete', () => {
      expect(resolveClipboardCommand(key('Delete'), ctx)).toBeNull();
    });
  });

  describe('quick paste — Ctrl+digit in normal mode', () => {
    it('returns quick-paste for Ctrl+1', () => {
      expect(resolveClipboardCommand(key('1', { ctrlKey: true }), { mode: 'normal' })).toEqual({ type: 'quick-paste', digit: 1 });
    });

    it('returns quick-paste for Ctrl+9', () => {
      expect(resolveClipboardCommand(key('9', { ctrlKey: true }), { mode: 'normal' })).toEqual({ type: 'quick-paste', digit: 9 });
    });

    it('returns quick-paste for Ctrl+3 in normal mode', () => {
      expect(resolveClipboardCommand(key('3', { ctrlKey: true }), { mode: 'normal' })).toEqual({ type: 'quick-paste', digit: 3 });
    });

    it('returns quick-paste for Ctrl+digit in searching mode', () => {
      expect(resolveClipboardCommand(key('3', { ctrlKey: true }), { mode: 'searching' })).toEqual({ type: 'quick-paste', digit: 3 });
    });

    it('returns null for Ctrl+0', () => {
      expect(resolveClipboardCommand(key('0', { ctrlKey: true }), { mode: 'normal' })).toBeNull();
    });

    it('returns null for digit without Ctrl', () => {
      expect(resolveClipboardCommand(key('3'), { mode: 'normal' })).toEqual({ type: 'start-search', char: '3' });
    });

    it('returns null for Ctrl+Shift+digit', () => {
      expect(resolveClipboardCommand(key('3', { ctrlKey: true, shiftKey: true }), { mode: 'normal' })).toBeNull();
    });
  });

  describe('searching mode', () => {
    const ctx: ClipboardKeyContext = { mode: 'searching' };

    it('returns move-down for ArrowDown', () => {
      expect(resolveClipboardCommand(key('ArrowDown'), ctx)).toEqual({ type: 'move-down' });
    });

    it('returns move-up for ArrowUp', () => {
      expect(resolveClipboardCommand(key('ArrowUp'), ctx)).toEqual({ type: 'move-up' });
    });

    it('returns copy-selected for Enter', () => {
      expect(resolveClipboardCommand(key('Enter'), ctx)).toEqual({ type: 'copy-selected' });
    });

    it('returns open-transform-picker for Shift+Enter', () => {
      expect(resolveClipboardCommand(key('Enter', { shiftKey: true }), ctx)).toEqual({ type: 'open-transform-picker' });
    });

    it('returns exit-search for Escape', () => {
      expect(resolveClipboardCommand(key('Escape'), ctx)).toEqual({ type: 'exit-search' });
    });

    it('returns null for letter keys (input handles them)', () => {
      expect(resolveClipboardCommand(key('a'), ctx)).toBeNull();
    });
  });

  describe('normal mode', () => {
    const ctx: ClipboardKeyContext = { mode: 'normal' };

    it('returns move-down for ArrowDown', () => {
      expect(resolveClipboardCommand(key('ArrowDown'), ctx)).toEqual({ type: 'move-down' });
    });

    it('returns move-up for ArrowUp', () => {
      expect(resolveClipboardCommand(key('ArrowUp'), ctx)).toEqual({ type: 'move-up' });
    });

    it('returns copy-selected for Enter', () => {
      expect(resolveClipboardCommand(key('Enter'), ctx)).toEqual({ type: 'copy-selected' });
    });

    it('returns open-transform-picker for Shift+Enter', () => {
      expect(resolveClipboardCommand(key('Enter', { shiftKey: true }), ctx)).toEqual({ type: 'open-transform-picker' });
    });

    it('returns delete-selected for Delete', () => {
      expect(resolveClipboardCommand(key('Delete'), ctx)).toEqual({ type: 'delete-selected' });
    });

    it('returns hide-popup for Escape', () => {
      expect(resolveClipboardCommand(key('Escape'), ctx)).toEqual({ type: 'hide-popup' });
    });

    it('returns pin-selected for Ctrl+P', () => {
      expect(resolveClipboardCommand(key('p', { ctrlKey: true }), ctx)).toEqual({ type: 'pin-selected' });
    });

    it('returns pin-selected for Ctrl+P uppercase', () => {
      expect(resolveClipboardCommand(key('P', { ctrlKey: true }), ctx)).toEqual({ type: 'pin-selected' });
    });

    it('returns enter-edit for Ctrl+E', () => {
      expect(resolveClipboardCommand(key('e', { ctrlKey: true }), ctx)).toEqual({ type: 'enter-edit' });
    });

    it('returns trigger-ocr for Ctrl+O', () => {
      expect(resolveClipboardCommand(key('o', { ctrlKey: true }), ctx)).toEqual({ type: 'trigger-ocr' });
    });

    it('returns trigger-ocr for Ctrl+O uppercase', () => {
      expect(resolveClipboardCommand(key('O', { ctrlKey: true }), ctx)).toEqual({ type: 'trigger-ocr' });
    });

    it('returns null for Ctrl+P with Shift', () => {
      expect(resolveClipboardCommand(key('p', { ctrlKey: true, shiftKey: true }), ctx)).toBeNull();
    });

    it('returns null for Ctrl+S (unhandled ctrl combo)', () => {
      expect(resolveClipboardCommand(key('s', { ctrlKey: true }), ctx)).toBeNull();
    });

    it('returns start-search for single printable char', () => {
      expect(resolveClipboardCommand(key('a'), ctx)).toEqual({ type: 'start-search', char: 'a' });
    });

    it('returns start-search for uppercase char (Shift held)', () => {
      expect(resolveClipboardCommand(key('A', { shiftKey: true }), ctx)).toEqual({ type: 'start-search', char: 'A' });
    });

    it('returns null for Alt+key', () => {
      expect(resolveClipboardCommand(key('a', { altKey: true }), ctx)).toBeNull();
    });
  });
});
```

- [ ] **Step 3: Run the tests and verify they fail**

Run: `pnpm test`
Expected: multiple FAIL lines — all `resolveClipboardCommand` tests fail because the stub returns `null`.

- [ ] **Step 4: Implement `resolveClipboardCommand`**

Replace the stub in `src/app/features/clipboard-list/clipboard-command-resolver.ts` with the full implementation:

```ts
export type ClipboardKeyContext =
  | { mode: 'normal' }
  | { mode: 'searching' }
  | { mode: 'editing'; entryId: number }
  | { mode: 'transform-picker' };

export type ClipboardCommand =
  | { type: 'move-up' }
  | { type: 'move-down' }
  | { type: 'copy-selected' }
  | { type: 'open-transform-picker' }
  | { type: 'delete-selected' }
  | { type: 'pin-selected' }
  | { type: 'enter-edit' }
  | { type: 'trigger-ocr' }
  | { type: 'quick-paste'; digit: number }
  | { type: 'start-search'; char: string }
  | { type: 'exit-search' }
  | { type: 'cancel-edit' }
  | { type: 'hide-popup' };

export function resolveClipboardCommand(
  event: KeyboardEvent,
  context: ClipboardKeyContext,
): ClipboardCommand | null {
  if (event.ctrlKey && event.key === 'Tab') return null;

  if (context.mode === 'transform-picker') return null;

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
      case 'ArrowDown': return { type: 'move-down' };
      case 'ArrowUp':   return { type: 'move-up' };
      case 'Enter':     return event.shiftKey ? { type: 'open-transform-picker' } : { type: 'copy-selected' };
      case 'Escape':    return { type: 'exit-search' };
      default:          return null;
    }
  }

  // normal mode
  switch (event.key) {
    case 'ArrowDown': return { type: 'move-down' };
    case 'ArrowUp':   return { type: 'move-up' };
    case 'Enter':     return event.shiftKey ? { type: 'open-transform-picker' } : { type: 'copy-selected' };
    case 'Delete':    return { type: 'delete-selected' };
    case 'Escape':    return { type: 'hide-popup' };
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

- [ ] **Step 5: Run tests and verify they pass**

Run: `pnpm test`
Expected: all `resolveClipboardCommand` tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/features/clipboard-list/clipboard-command-resolver.ts src/app/features/clipboard-list/clipboard-command-resolver.spec.ts
git commit -m "feat: add clipboard command resolver with full keyboard routing logic"
```

---

## Task 2: Snippet command resolver — types, tests, implementation

**Files:**
- Create: `src/app/features/clipboard-list/snippet-command-resolver.ts`
- Create: `src/app/features/clipboard-list/snippet-command-resolver.spec.ts`

- [ ] **Step 1: Create the types file with a stub resolver**

Create `src/app/features/clipboard-list/snippet-command-resolver.ts`:

```ts
export type SnippetKeyContext =
  | { mode: 'normal' }
  | { mode: 'editing'; snippetId: number }
  | { mode: 'adding-snippet' }
  | { mode: 'placeholder-overlay' }
  | { mode: 'adding-folder' };

export type SnippetCommand =
  | { type: 'move-up' }
  | { type: 'move-down' }
  | { type: 'paste-selected' }
  | { type: 'delete-selected' }
  | { type: 'enter-edit' }
  | { type: 'cancel-edit' }
  | { type: 'new-snippet' }
  | { type: 'hide-popup' };

export function resolveSnippetCommand(
  _event: KeyboardEvent,
  _context: SnippetKeyContext,
): SnippetCommand | null {
  return null;
}
```

- [ ] **Step 2: Write the failing tests**

Create `src/app/features/clipboard-list/snippet-command-resolver.spec.ts`:

```ts
import { resolveSnippetCommand, SnippetKeyContext } from './snippet-command-resolver';

function key(k: string, mods: Partial<KeyboardEventInit> = {}): KeyboardEvent {
  return new KeyboardEvent('keydown', { key: k, bubbles: true, ...mods });
}

describe('resolveSnippetCommand', () => {
  describe('Ctrl+Tab — always null', () => {
    it('returns null in normal mode', () => {
      expect(resolveSnippetCommand(key('Tab', { ctrlKey: true }), { mode: 'normal' })).toBeNull();
    });
  });

  describe('modal/form modes — always null', () => {
    it('returns null for Enter in adding-snippet mode', () => {
      expect(resolveSnippetCommand(key('Enter'), { mode: 'adding-snippet' })).toBeNull();
    });

    it('returns null for ArrowDown in placeholder-overlay mode', () => {
      expect(resolveSnippetCommand(key('ArrowDown'), { mode: 'placeholder-overlay' })).toBeNull();
    });

    it('returns null for Enter in adding-folder mode', () => {
      expect(resolveSnippetCommand(key('Enter'), { mode: 'adding-folder' })).toBeNull();
    });

    it('returns null for Escape in adding-folder mode', () => {
      expect(resolveSnippetCommand(key('Escape'), { mode: 'adding-folder' })).toBeNull();
    });
  });

  describe('editing mode', () => {
    const ctx: SnippetKeyContext = { mode: 'editing', snippetId: 3 };

    it('returns cancel-edit for Escape', () => {
      expect(resolveSnippetCommand(key('Escape'), ctx)).toEqual({ type: 'cancel-edit' });
    });

    it('returns cancel-edit for ArrowDown', () => {
      expect(resolveSnippetCommand(key('ArrowDown'), ctx)).toEqual({ type: 'cancel-edit' });
    });

    it('returns cancel-edit for ArrowUp', () => {
      expect(resolveSnippetCommand(key('ArrowUp'), ctx)).toEqual({ type: 'cancel-edit' });
    });

    it('returns null for Enter (textarea handles it)', () => {
      expect(resolveSnippetCommand(key('Enter'), ctx)).toBeNull();
    });

    it('returns null for letter keys', () => {
      expect(resolveSnippetCommand(key('a'), ctx)).toBeNull();
    });

    it('returns null for Delete', () => {
      expect(resolveSnippetCommand(key('Delete'), ctx)).toBeNull();
    });
  });

  describe('normal mode', () => {
    const ctx: SnippetKeyContext = { mode: 'normal' };

    it('returns move-down for ArrowDown', () => {
      expect(resolveSnippetCommand(key('ArrowDown'), ctx)).toEqual({ type: 'move-down' });
    });

    it('returns move-up for ArrowUp', () => {
      expect(resolveSnippetCommand(key('ArrowUp'), ctx)).toEqual({ type: 'move-up' });
    });

    it('returns paste-selected for Enter', () => {
      expect(resolveSnippetCommand(key('Enter'), ctx)).toEqual({ type: 'paste-selected' });
    });

    it('returns delete-selected for Delete', () => {
      expect(resolveSnippetCommand(key('Delete'), ctx)).toEqual({ type: 'delete-selected' });
    });

    it('returns hide-popup for Escape', () => {
      expect(resolveSnippetCommand(key('Escape'), ctx)).toEqual({ type: 'hide-popup' });
    });

    it('returns enter-edit for e (no modifiers)', () => {
      expect(resolveSnippetCommand(key('e'), ctx)).toEqual({ type: 'enter-edit' });
    });

    it('returns enter-edit for E (shift held)', () => {
      expect(resolveSnippetCommand(key('E', { shiftKey: true }), ctx)).toEqual({ type: 'enter-edit' });
    });

    it('returns new-snippet for n (no modifiers)', () => {
      expect(resolveSnippetCommand(key('n'), ctx)).toEqual({ type: 'new-snippet' });
    });

    it('returns new-snippet for N (shift held)', () => {
      expect(resolveSnippetCommand(key('N', { shiftKey: true }), ctx)).toEqual({ type: 'new-snippet' });
    });

    it('returns null for Ctrl+n', () => {
      expect(resolveSnippetCommand(key('n', { ctrlKey: true }), ctx)).toBeNull();
    });

    it('returns null for Alt+e', () => {
      expect(resolveSnippetCommand(key('e', { altKey: true }), ctx)).toBeNull();
    });

    it('returns null for unhandled key', () => {
      expect(resolveSnippetCommand(key('F5'), ctx)).toBeNull();
    });
  });
});
```

- [ ] **Step 3: Run the tests and verify they fail**

Run: `pnpm test`
Expected: multiple FAIL lines — all `resolveSnippetCommand` tests fail because the stub returns `null`.

- [ ] **Step 4: Implement `resolveSnippetCommand`**

Replace the stub in `src/app/features/clipboard-list/snippet-command-resolver.ts`:

```ts
export type SnippetKeyContext =
  | { mode: 'normal' }
  | { mode: 'editing'; snippetId: number }
  | { mode: 'adding-snippet' }
  | { mode: 'placeholder-overlay' }
  | { mode: 'adding-folder' };

export type SnippetCommand =
  | { type: 'move-up' }
  | { type: 'move-down' }
  | { type: 'paste-selected' }
  | { type: 'delete-selected' }
  | { type: 'enter-edit' }
  | { type: 'cancel-edit' }
  | { type: 'new-snippet' }
  | { type: 'hide-popup' };

export function resolveSnippetCommand(
  event: KeyboardEvent,
  context: SnippetKeyContext,
): SnippetCommand | null {
  if (event.ctrlKey && event.key === 'Tab') return null;

  if (
    context.mode === 'adding-snippet' ||
    context.mode === 'placeholder-overlay' ||
    context.mode === 'adding-folder'
  ) {
    return null;
  }

  if (context.mode === 'editing') {
    if (event.key === 'Escape' || event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      return { type: 'cancel-edit' };
    }
    return null;
  }

  // normal mode
  switch (event.key) {
    case 'ArrowDown': return { type: 'move-down' };
    case 'ArrowUp':   return { type: 'move-up' };
    case 'Enter':     return { type: 'paste-selected' };
    case 'Delete':    return { type: 'delete-selected' };
    case 'Escape':    return { type: 'hide-popup' };
  }

  if (event.key.length === 1 && !event.ctrlKey && !event.altKey && !event.metaKey) {
    const k = event.key.toLowerCase();
    if (k === 'e') return { type: 'enter-edit' };
    if (k === 'n') return { type: 'new-snippet' };
  }

  return null;
}
```

- [ ] **Step 5: Run tests and verify they pass**

Run: `pnpm test`
Expected: all `resolveSnippetCommand` tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/features/clipboard-list/snippet-command-resolver.ts src/app/features/clipboard-list/snippet-command-resolver.spec.ts
git commit -m "feat: add snippet command resolver with full keyboard routing logic"
```

---

## Task 3: Refactor ClipboardTabComponent

**Files:**
- Modify: `src/app/features/clipboard-list/clipboard-tab.component.ts`
- Modify: `src/app/features/clipboard-list/clipboard-tab.component.spec.ts`

- [ ] **Step 1: Replace `clipboard-tab.component.ts`**

The full new file — replacing `onKeyDown()`, adding `buildContext()` and `dispatch()`, removing the three exported helpers, inlining `shouldCancelEditOnSelect`, removing the import of `resolveEditModeAction`:

At the top of the file, replace:
```ts
import { resolveEditModeAction } from './keyboard.utils';
```
with:
```ts
import { ClipboardCommand, ClipboardKeyContext, resolveClipboardCommand } from './clipboard-command-resolver';
```

Remove the three exported functions at the bottom of the file (lines 470–491):
```ts
export function shouldCancelEditOnSelect(...)  { ... }
export function getQuickPasteDigit(...) { ... }
export function isOcrTrigger(...) { ... }
```

In `selectEntry()`, replace the call to `shouldCancelEditOnSelect(...)`:

Before:
```ts
if (!shouldCancelEditOnSelect(clickedEntry?.id, this.selection.editingEntry()!.id)) return;
```
After:
```ts
if (clickedEntry?.id === this.selection.editingEntry()!.id) return;
```

Replace the entire `onKeyDown()` method (lines 303–409) with:
```ts
protected onKeyDown(event: KeyboardEvent): void {
  const context = this.buildContext();
  const command = resolveClipboardCommand(event, context);
  if (!command) return;
  event.preventDefault();
  event.stopPropagation();
  this.dispatch(command);
}

private buildContext(): ClipboardKeyContext {
  if (this.selection.editingEntry()) return { mode: 'editing', entryId: this.selection.editingEntry()!.id };
  if (this.showTransformPicker()) return { mode: 'transform-picker' };
  if (this.isSearching()) return { mode: 'searching' };
  return { mode: 'normal' };
}

private dispatch(command: ClipboardCommand): void {
  switch (command.type) {
    case 'move-up':               this.moveSelection(-1); break;
    case 'move-down':             this.moveSelection(1); break;
    case 'copy-selected':         this.copySelected(); break;
    case 'open-transform-picker': this.openTransformPicker(); break;
    case 'delete-selected':       this.deleteEntry(this.selection.selectedIndex()); break;
    case 'pin-selected':          this.pinSelected(); break;
    case 'enter-edit':            this.enterEditMode(); break;
    case 'trigger-ocr':           this.triggerOcr(); break;
    case 'quick-paste': {
      const idx = command.digit - 1;
      if (idx < this.filteredEntries().length) this.selectEntry(idx);
      break;
    }
    case 'start-search': {
      this.isSearching.set(true);
      this.searchQuery.set(command.char);
      this.emitSelectedEntry();
      setTimeout(() => {
        const input = this.searchInput()?.nativeElement;
        if (input) {
          input.value = this.searchQuery();
          input.focus();
          input.setSelectionRange(input.value.length, input.value.length);
        }
      }, 0);
      break;
    }
    case 'exit-search':  this.clearSearch(); break;
    case 'cancel-edit':  this.selection.exitEditMode(); break;
    case 'hide-popup':   this.bridge.hidePopup(); break;
  }
}
```

- [ ] **Step 2: Update `clipboard-tab.component.spec.ts`**

Remove the three describe blocks for the deleted helper exports. The file currently imports `getQuickPasteDigit`, `isOcrTrigger`, and `shouldCancelEditOnSelect` from the component; those exports no longer exist. Replace the entire file with just the `ClipboardTabType` test (the only thing still exported from the component that's worth testing as a type guard):

```ts
import { ClipboardTabType } from './clipboard-tab.component';

describe('ClipboardTabType', () => {
  it('accepts recent and pinned as valid values', () => {
    const recent: ClipboardTabType = 'recent';
    const pinned: ClipboardTabType = 'pinned';
    expect(recent).toBe('recent');
    expect(pinned).toBe('pinned');
  });
});
```

- [ ] **Step 3: Run tests and verify they pass**

Run: `pnpm test`
Expected: all tests PASS. No compile errors about missing exports.

- [ ] **Step 4: Commit**

```bash
git add src/app/features/clipboard-list/clipboard-tab.component.ts src/app/features/clipboard-list/clipboard-tab.component.spec.ts
git commit -m "refactor: replace ClipboardTabComponent.onKeyDown with resolver-based dispatch"
```

---

## Task 4: Refactor SnippetsTabComponent

**Files:**
- Modify: `src/app/features/clipboard-list/snippets-tab.component.ts`

- [ ] **Step 1: Update imports**

In `snippets-tab.component.ts`, replace:
```ts
import { resolveEditModeAction } from './keyboard.utils';
```
with:
```ts
import { SnippetCommand, SnippetKeyContext, resolveSnippetCommand } from './snippet-command-resolver';
```

- [ ] **Step 2: Replace `onKeyDown()` with resolver-based version**

Replace the entire `onKeyDown()` method (lines 440–494) with:

```ts
protected onKeyDown(event: KeyboardEvent): void {
  const context = this.buildContext();
  const command = resolveSnippetCommand(event, context);
  if (!command) return;
  event.preventDefault();
  event.stopPropagation();
  this.dispatch(command);
}

private buildContext(): SnippetKeyContext {
  if (this.showPlaceholderOverlay()) return { mode: 'placeholder-overlay' };
  if (this.showNewSnippetForm()) return { mode: 'adding-snippet' };
  if (this.addingFolder()) return { mode: 'adding-folder' };
  if (this.editingSnippetId() !== null) return { mode: 'editing', snippetId: this.editingSnippetId()! };
  return { mode: 'normal' };
}

private dispatch(command: SnippetCommand): void {
  switch (command.type) {
    case 'move-up':        this.moveSnippetSelection(-1); break;
    case 'move-down':      this.moveSnippetSelection(1); break;
    case 'paste-selected': this.pasteOrOverlaySnippet(); break;
    case 'delete-selected': this.deleteSnippetByIndex(this.snippetSelectedIndex()); break;
    case 'enter-edit':     this.enterSnippetEditMode(); break;
    case 'cancel-edit':    this.editingSnippetId.set(null); break;
    case 'new-snippet':    this.showNewSnippetForm.set(true); break;
    case 'hide-popup':     this.bridge.hidePopup(); break;
  }
}
```

- [ ] **Step 3: Run tests and verify they pass**

Run: `pnpm test`
Expected: all tests PASS. No compile errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/features/clipboard-list/snippets-tab.component.ts
git commit -m "refactor: replace SnippetsTabComponent.onKeyDown with resolver-based dispatch"
```

---

## Task 5: Delete keyboard.utils.ts and keyboard.utils.spec.ts

**Files:**
- Delete: `src/app/features/clipboard-list/keyboard.utils.ts`
- Delete: `src/app/features/clipboard-list/keyboard.utils.spec.ts`

- [ ] **Step 1: Verify no remaining imports**

Search for any remaining imports of `keyboard.utils`:

```bash
grep -r "keyboard.utils" src/
```

Expected output: no matches (after Tasks 3 and 4 removed both imports).

- [ ] **Step 2: Delete the files**

```bash
rm src/app/features/clipboard-list/keyboard.utils.ts
rm src/app/features/clipboard-list/keyboard.utils.spec.ts
```

- [ ] **Step 3: Run tests to confirm nothing breaks**

Run: `pnpm test`
Expected: all tests PASS. No missing-module errors.

- [ ] **Step 4: Commit**

```bash
git add -u src/app/features/clipboard-list/keyboard.utils.ts src/app/features/clipboard-list/keyboard.utils.spec.ts
git commit -m "refactor: delete keyboard.utils — logic absorbed into command resolvers"
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Covered by |
|---|---|
| `resolveClipboardCommand` pure function with `ClipboardKeyContext` / `ClipboardCommand` types | Task 1 |
| `resolveSnippetCommand` pure function with `SnippetKeyContext` / `SnippetCommand` types | Task 2 |
| `ClipboardTabComponent.onKeyDown` shrinks to build→resolve→dispatch | Task 3 |
| `SnippetsTabComponent.onKeyDown` shrinks to build→resolve→dispatch | Task 4 |
| `getQuickPasteDigit`, `isOcrTrigger`, `shouldCancelEditOnSelect`, `resolveEditModeAction` deleted as exports | Tasks 3, 4, 5 |
| Tests with no component/DOM/Angular | Tasks 1, 2 |
| File locations match spec | All tasks |

**Placeholder scan:** No TBDs or incomplete steps — all steps include exact code.

**Type consistency:** `ClipboardCommand`, `ClipboardKeyContext`, `SnippetCommand`, `SnippetKeyContext` defined in Task 1/2 and used consistently in Tasks 3/4. `dispatch()` switch cases cover every union member defined in Task 1/2.
