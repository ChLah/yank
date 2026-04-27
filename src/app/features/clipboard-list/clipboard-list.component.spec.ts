import { resolveEditModeAction, shouldCancelEditOnSelect } from './clipboard-list.component';

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
