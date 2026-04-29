import { resolveEditModeAction } from './keyboard.utils';

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

  it('returns block for horizontal arrows', () => {
    expect(resolveEditModeAction('ArrowLeft')).toBe('block');
    expect(resolveEditModeAction('ArrowRight')).toBe('block');
  });
});
