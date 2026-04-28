import { buildRelativeTimeTranslation, resolveTextareaKey } from './clipboard-entry.component';

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

describe('buildRelativeTimeTranslation', () => {
  it('returns TIME_JUST_NOW for timestamps within the last minute', () => {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const result = buildRelativeTimeTranslation(nowSeconds - 30);
    expect(result.key).toBe('ENTRY.TIME_JUST_NOW');
  });

  it('returns TIME_MINUTES for timestamps 1-59 minutes ago', () => {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const result = buildRelativeTimeTranslation(nowSeconds - 5 * 60);
    expect(result.key).toBe('ENTRY.TIME_MINUTES');
    expect(result.params).toEqual({ n: 5 });
  });

  it('returns TIME_HOURS for timestamps 1-23 hours ago', () => {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const result = buildRelativeTimeTranslation(nowSeconds - 3 * 3600);
    expect(result.key).toBe('ENTRY.TIME_HOURS');
    expect(result.params).toEqual({ n: 3 });
  });

  it('returns TIME_DAYS for timestamps 24+ hours ago', () => {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const result = buildRelativeTimeTranslation(nowSeconds - 2 * 86400);
    expect(result.key).toBe('ENTRY.TIME_DAYS');
    expect(result.params).toEqual({ n: 2 });
  });
});
