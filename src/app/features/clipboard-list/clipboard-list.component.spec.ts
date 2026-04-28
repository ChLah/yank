import { getQuickPasteDigit, isOcrTrigger, resolveEditModeAction, shouldCancelEditOnSelect } from './clipboard-list.component';

describe('resolveEditModeAction', () => {
  it('returns cancel-navigate for ArrowDown', () => {
    expect(resolveEditModeAction('ArrowDown')).toBe('cancel-navigate');
  });

  it('returns cancel-navigate for ArrowUp', () => {
    expect(resolveEditModeAction('ArrowUp')).toBe('cancel-navigate');
  });

  it('returns block for Enter', () => {
    expect(resolveEditModeAction('Enter')).toBe('block');
  });

  it('returns block for Escape', () => {
    expect(resolveEditModeAction('Escape')).toBe('block');
  });

  it('returns block for letter keys', () => {
    expect(resolveEditModeAction('a')).toBe('block');
    expect(resolveEditModeAction('e')).toBe('block');
  });

  it('returns block for Tab', () => {
    expect(resolveEditModeAction('Tab')).toBe('block');
  });

  it('returns block for Delete', () => {
    expect(resolveEditModeAction('Delete')).toBe('block');
  });

  it('returns block for horizontal arrows (only vertical cancel-navigate)', () => {
    expect(resolveEditModeAction('ArrowLeft')).toBe('block');
    expect(resolveEditModeAction('ArrowRight')).toBe('block');
  });
});

describe('shouldCancelEditOnSelect', () => {
  it('returns false when clicking the entry currently in edit mode', () => {
    expect(shouldCancelEditOnSelect(42, 42)).toBe(false);
  });

  it('returns true when clicking a different entry', () => {
    expect(shouldCancelEditOnSelect(7, 42)).toBe(true);
  });

  it('returns true when clickedEntryId is undefined (entry not found)', () => {
    expect(shouldCancelEditOnSelect(undefined, 42)).toBe(true);
  });

  it('returns true for two distinct non-zero IDs', () => {
    expect(shouldCancelEditOnSelect(1, 2)).toBe(true);
    expect(shouldCancelEditOnSelect(100, 99)).toBe(true);
  });

  it('returns false for same ID regardless of value', () => {
    expect(shouldCancelEditOnSelect(1, 1)).toBe(false);
    expect(shouldCancelEditOnSelect(0, 0)).toBe(false);
  });
});

describe('getQuickPasteDigit', () => {
  function makeEvent(key: string, mods: Partial<KeyboardEvent> = {}): KeyboardEvent {
    return {
      key,
      ctrlKey: false,
      shiftKey: false,
      altKey: false,
      metaKey: false,
      ...mods,
    } as KeyboardEvent;
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

describe('isOcrTrigger', () => {
  function makeEvent(key: string, mods: Partial<KeyboardEvent> = {}): KeyboardEvent {
    return {
      key,
      ctrlKey: false,
      shiftKey: false,
      altKey: false,
      metaKey: false,
      ...mods,
    } as KeyboardEvent;
  }

  it('returns true for Ctrl+o', () => {
    expect(isOcrTrigger(makeEvent('o', { ctrlKey: true }))).toBe(true);
  });

  it('returns true for Ctrl+O (uppercase)', () => {
    expect(isOcrTrigger(makeEvent('O', { ctrlKey: true }))).toBe(true);
  });

  it('returns false without Ctrl', () => {
    expect(isOcrTrigger(makeEvent('o'))).toBe(false);
  });

  it('returns false with Ctrl+Shift', () => {
    expect(isOcrTrigger(makeEvent('o', { ctrlKey: true, shiftKey: true }))).toBe(false);
  });

  it('returns false with Alt modifier', () => {
    expect(isOcrTrigger(makeEvent('o', { ctrlKey: true, altKey: true }))).toBe(false);
  });

  it('returns false for other keys', () => {
    expect(isOcrTrigger(makeEvent('p', { ctrlKey: true }))).toBe(false);
    expect(isOcrTrigger(makeEvent('e', { ctrlKey: true }))).toBe(false);
  });
});
