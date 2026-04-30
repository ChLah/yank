# Keyboard Command Resolvers Design

**Date:** 2026-04-30
**Status:** Approved

## Problem

`ClipboardTabComponent` and `SnippetsTabComponent` each contain a 100+-line `onKeyDown()` method that interleaves mode checks, state mutations, and action dispatch. Understanding what a key does requires reading through nested conditions and following signal mutations inline. Adding or changing a shortcut means editing the middle of a complex method and understanding all surrounding state.

Several narrow utility functions were previously extracted (`getQuickPasteDigit`, `resolveEditModeAction`, `isOcrTrigger`) for testability, but these only cover individual checks — not the full routing decision. The real behaviour ("does this event in this mode produce this command?") has no test surface.

## Goal

Extract keyboard routing into two pure resolver functions — one per tab — with a stable interface:

```ts
resolveClipboardCommand(event: KeyboardEvent, context: ClipboardKeyContext): ClipboardCommand | null
resolveSnippetCommand(event: KeyboardEvent, context: SnippetKeyContext): SnippetCommand | null
```

Each `onKeyDown()` handler shrinks to: build context → resolve command → dispatch. The resolver becomes the test surface.

## Decisions

| Question | Decision |
|---|---|
| Shared vs separate resolvers | Two separate resolvers. The tabs have non-overlapping key maps; sharing would require a tab discriminator in the context and produce a union of unrelated commands. |
| Context shape | Discriminated union per tab. Each mode carries only the data it needs. |
| Command shape | Separate discriminated unions: `ClipboardCommand` and `SnippetCommand`. |
| Existing helpers | Absorbed into the resolvers as unexported implementation details. `getQuickPasteDigit`, `resolveEditModeAction`, `isOcrTrigger`, `shouldCancelEditOnSelect` are deleted as exports. The resolver is the test surface. |

---

## Clipboard tab

### Context

```ts
export type ClipboardKeyContext =
  | { mode: 'normal' }
  | { mode: 'searching' }
  | { mode: 'editing'; entryId: number }
  | { mode: 'transform-picker' };
```

### Command

```ts
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
```

### Resolver signature

```ts
export function resolveClipboardCommand(
  event: KeyboardEvent,
  context: ClipboardKeyContext,
): ClipboardCommand | null;
```

Returns `null` for events that should not be handled (e.g. `Ctrl+Tab`, which bubbles to the shell).

---

## Snippets tab

### Context

```ts
export type SnippetKeyContext =
  | { mode: 'normal' }
  | { mode: 'editing'; snippetId: number }
  | { mode: 'adding-snippet' }
  | { mode: 'placeholder-overlay' }
  | { mode: 'adding-folder' };
```

### Command

```ts
export type SnippetCommand =
  | { type: 'move-up' }
  | { type: 'move-down' }
  | { type: 'paste-selected' }
  | { type: 'delete-selected' }
  | { type: 'enter-edit' }
  | { type: 'cancel-edit' }
  | { type: 'new-snippet' }
  | { type: 'hide-popup' };
```

### Resolver signature

```ts
export function resolveSnippetCommand(
  event: KeyboardEvent,
  context: SnippetKeyContext,
): SnippetCommand | null;
```

---

## How onKeyDown() simplifies

**Before (ClipboardTabComponent excerpt):**
```ts
protected onKeyDown(event: KeyboardEvent): void {
  if (event.ctrlKey && event.key === 'Tab') return;
  if (this.showTransformPicker()) return;
  if (this.editingEntryId() !== null) {
    if (resolveEditModeAction(event.key) === 'cancel-navigate') {
      this.editingEntryId.set(null);
    } else {
      event.stopPropagation();
      return;
    }
  }
  const quickPasteDigit = getQuickPasteDigit(event);
  if (quickPasteDigit !== null) { ... }
  if (this.isSearching()) { switch (event.key) { ... } return; }
  switch (event.key) { ... }
}
```

**After:**
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
    case 'move-up': this.selection.moveUp(); break;
    case 'move-down': this.selection.moveDown(); break;
    // ...
  }
}
```

---

## Test surface

```ts
it('returns quick-paste command for Ctrl+3 in normal mode', () => {
  const event = new KeyboardEvent('keydown', { key: '3', ctrlKey: true });
  const cmd = resolveClipboardCommand(event, { mode: 'normal' });
  expect(cmd).toEqual({ type: 'quick-paste', digit: 3 });
});

it('returns null for Ctrl+Tab (bubbles to shell)', () => {
  const event = new KeyboardEvent('keydown', { key: 'Tab', ctrlKey: true });
  expect(resolveClipboardCommand(event, { mode: 'normal' })).toBeNull();
});

it('returns cancel-edit in editing mode for Escape', () => {
  const event = new KeyboardEvent('keydown', { key: 'Escape' });
  const cmd = resolveClipboardCommand(event, { mode: 'editing', entryId: 5 });
  expect(cmd).toEqual({ type: 'cancel-edit' });
});
```

No component, no DOM, no Angular. All routing logic is covered through the resolver's public API.

---

## Deleted exports

The following functions are removed as public exports and absorbed into the resolvers:
- `getQuickPasteDigit` (from `clipboard-tab.component.ts`)
- `isOcrTrigger` (from `clipboard-tab.component.ts`)
- `shouldCancelEditOnSelect` (from `clipboard-tab.component.ts`)
- `resolveEditModeAction` (from `keyboard.utils.ts`)

Their spec cases migrate to `clipboard-command-resolver.spec.ts` and `snippet-command-resolver.spec.ts`.

---

## File location

```
src/app/features/clipboard-list/clipboard-command-resolver.ts
src/app/features/clipboard-list/clipboard-command-resolver.spec.ts
src/app/features/clipboard-list/snippet-command-resolver.ts
src/app/features/clipboard-list/snippet-command-resolver.spec.ts
```
