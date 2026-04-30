import { resolveSnippetCommand, SnippetKeyContext } from './snippet-command-resolver';

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

    it('returns cancel-edit for Ctrl+Escape in editing mode', () => {
      expect(resolveSnippetCommand(key('Escape', { ctrlKey: true }), ctx)).toEqual({
        type: 'cancel-edit',
      });
    });

    it('returns null for Ctrl+digit in editing mode', () => {
      expect(resolveSnippetCommand(key('3', { ctrlKey: true }), ctx)).toBeNull();
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
      expect(resolveSnippetCommand(key('E', { shiftKey: true }), ctx)).toEqual({
        type: 'enter-edit',
      });
    });

    it('returns enter-edit for Ctrl+E uppercase', () => {
      expect(resolveSnippetCommand(key('E', { ctrlKey: true }), ctx)).toBeNull();
    });

    it('returns new-snippet for n (no modifiers)', () => {
      expect(resolveSnippetCommand(key('n'), ctx)).toEqual({ type: 'new-snippet' });
    });

    it('returns new-snippet for N (shift held)', () => {
      expect(resolveSnippetCommand(key('N', { shiftKey: true }), ctx)).toEqual({
        type: 'new-snippet',
      });
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
