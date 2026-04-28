import { formatAbsoluteDate } from './clipboard-entry-tooltip.component';

describe('formatAbsoluteDate', () => {
  it('returns a non-empty string', () => {
    expect(formatAbsoluteDate(0)).toBeTruthy();
  });

  it('includes the correct year', () => {
    // 2026-04-28 00:00:00 UTC → Unix 1777334400
    expect(formatAbsoluteDate(1777334400)).toContain('2026');
  });

  it('handles the current timestamp without throwing', () => {
    const now = Math.floor(Date.now() / 1000);
    expect(() => formatAbsoluteDate(now)).not.toThrow();
  });
});
