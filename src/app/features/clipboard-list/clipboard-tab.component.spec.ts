import {
  ClipboardTabType,
  getQuickPasteDigit,
  isOcrTrigger,
  shouldCancelEditOnSelect,
} from './clipboard-tab.component';

describe('ClipboardTabType', () => {
  it('accepts recent and pinned as valid values', () => {
    const recent: ClipboardTabType = 'recent';
    const pinned: ClipboardTabType = 'pinned';
    expect(recent).toBe('recent');
    expect(pinned).toBe('pinned');
  });
});

describe('shouldCancelEditOnSelect', () => {
  it('returns false when clicking the entry currently in edit mode', () => {
    expect(shouldCancelEditOnSelect(42, 42)).toBe(false);
  });

  it('returns true when clicking a different entry', () => {
    expect(shouldCancelEditOnSelect(7, 42)).toBe(true);
  });

  it('returns true when clickedEntryId is undefined', () => {
    expect(shouldCancelEditOnSelect(undefined, 42)).toBe(true);
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

  it('returns null for Ctrl+non-digit', () => {
    expect(getQuickPasteDigit(makeEvent('a', { ctrlKey: true }))).toBeNull();
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

  it('returns false with extra modifiers', () => {
    expect(isOcrTrigger(makeEvent('o', { ctrlKey: true, shiftKey: true }))).toBe(false);
  });

  it('returns false for other keys', () => {
    expect(isOcrTrigger(makeEvent('p', { ctrlKey: true }))).toBe(false);
  });
});
