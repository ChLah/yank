import { resolveTextareaKey } from './clipboard-entry.component';

describe('resolveTextareaKey', () => {
  it('returns confirm on Enter without Shift', () => {
    expect(resolveTextareaKey('Enter', false)).toBe('confirm');
  });

  it('returns null on Shift+Enter (newline)', () => {
    expect(resolveTextareaKey('Enter', true)).toBeNull();
  });

  it('returns cancel on Escape', () => {
    expect(resolveTextareaKey('Escape', false)).toBe('cancel');
  });

  it('returns cancel on Escape even with Shift', () => {
    expect(resolveTextareaKey('Escape', true)).toBe('cancel');
  });

  it('returns cancel on Tab', () => {
    expect(resolveTextareaKey('Tab', false)).toBe('cancel');
  });

  it('returns cancel on Tab even with Shift', () => {
    expect(resolveTextareaKey('Tab', true)).toBe('cancel');
  });

  it('returns null for regular letter keys', () => {
    expect(resolveTextareaKey('a', false)).toBeNull();
    expect(resolveTextareaKey('z', false)).toBeNull();
  });

  it('returns null for arrow keys', () => {
    expect(resolveTextareaKey('ArrowDown', false)).toBeNull();
    expect(resolveTextareaKey('ArrowUp', false)).toBeNull();
    expect(resolveTextareaKey('ArrowLeft', false)).toBeNull();
    expect(resolveTextareaKey('ArrowRight', false)).toBeNull();
  });

  it('returns null for backspace and delete', () => {
    expect(resolveTextareaKey('Backspace', false)).toBeNull();
    expect(resolveTextareaKey('Delete', false)).toBeNull();
  });

  it('returns null for space key', () => {
    expect(resolveTextareaKey(' ', false)).toBeNull();
  });
});
