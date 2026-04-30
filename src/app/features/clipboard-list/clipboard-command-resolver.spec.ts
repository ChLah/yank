import { resolveClipboardCommand, ClipboardKeyContext } from './clipboard-command-resolver';

function key(k: string, mods: Partial<KeyboardEvent> = {}): KeyboardEvent {
  return {
    key: k,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    metaKey: false,
    ...mods,
  } as KeyboardEvent;
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
      expect(resolveClipboardCommand(key('1', { ctrlKey: true }), { mode: 'normal' })).toEqual({
        type: 'quick-paste',
        digit: 1,
      });
    });

    it('returns quick-paste for Ctrl+9', () => {
      expect(resolveClipboardCommand(key('9', { ctrlKey: true }), { mode: 'normal' })).toEqual({
        type: 'quick-paste',
        digit: 9,
      });
    });

    it('returns quick-paste for Ctrl+3 in normal mode', () => {
      expect(resolveClipboardCommand(key('3', { ctrlKey: true }), { mode: 'normal' })).toEqual({
        type: 'quick-paste',
        digit: 3,
      });
    });

    it('returns quick-paste for Ctrl+digit in searching mode', () => {
      expect(resolveClipboardCommand(key('3', { ctrlKey: true }), { mode: 'searching' })).toEqual({
        type: 'quick-paste',
        digit: 3,
      });
    });

    it('returns null for Ctrl+0', () => {
      expect(resolveClipboardCommand(key('0', { ctrlKey: true }), { mode: 'normal' })).toBeNull();
    });

    it('returns null for digit without Ctrl', () => {
      expect(resolveClipboardCommand(key('3'), { mode: 'normal' })).toEqual({
        type: 'start-search',
        char: '3',
      });
    });

    it('returns null for Ctrl+Shift+digit', () => {
      expect(
        resolveClipboardCommand(key('3', { ctrlKey: true, shiftKey: true }), { mode: 'normal' }),
      ).toBeNull();
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
      expect(resolveClipboardCommand(key('Enter', { shiftKey: true }), ctx)).toEqual({
        type: 'open-transform-picker',
      });
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
      expect(resolveClipboardCommand(key('Enter', { shiftKey: true }), ctx)).toEqual({
        type: 'open-transform-picker',
      });
    });

    it('returns delete-selected for Delete', () => {
      expect(resolveClipboardCommand(key('Delete'), ctx)).toEqual({ type: 'delete-selected' });
    });

    it('returns hide-popup for Escape', () => {
      expect(resolveClipboardCommand(key('Escape'), ctx)).toEqual({ type: 'hide-popup' });
    });

    it('returns pin-selected for Ctrl+P', () => {
      expect(resolveClipboardCommand(key('p', { ctrlKey: true }), ctx)).toEqual({
        type: 'pin-selected',
      });
    });

    it('returns pin-selected for Ctrl+P uppercase', () => {
      expect(resolveClipboardCommand(key('P', { ctrlKey: true }), ctx)).toEqual({
        type: 'pin-selected',
      });
    });

    it('returns enter-edit for Ctrl+E', () => {
      expect(resolveClipboardCommand(key('e', { ctrlKey: true }), ctx)).toEqual({
        type: 'enter-edit',
      });
    });

    it('returns trigger-ocr for Ctrl+O', () => {
      expect(resolveClipboardCommand(key('o', { ctrlKey: true }), ctx)).toEqual({
        type: 'trigger-ocr',
      });
    });

    it('returns trigger-ocr for Ctrl+O uppercase', () => {
      expect(resolveClipboardCommand(key('O', { ctrlKey: true }), ctx)).toEqual({
        type: 'trigger-ocr',
      });
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
      expect(resolveClipboardCommand(key('A', { shiftKey: true }), ctx)).toEqual({
        type: 'start-search',
        char: 'A',
      });
    });

    it('returns null for Alt+key', () => {
      expect(resolveClipboardCommand(key('a', { altKey: true }), ctx)).toBeNull();
    });
  });
});
