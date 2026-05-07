import { formatBytes } from './format-bytes';

describe('formatBytes', () => {
  it('formats bytes under 1 KB without conversion', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1023)).toBe('1023 B');
  });

  it('formats KB with two decimals when small', () => {
    expect(formatBytes(1024)).toBe('1.00 KB');
    expect(formatBytes(1536)).toBe('1.50 KB');
  });

  it('formats MB and GB', () => {
    expect(formatBytes(1024 * 1024)).toBe('1.00 MB');
    expect(formatBytes(34_500_000)).toMatch(/^32\.\d MB$/);
    expect(formatBytes(1.25 * 1024 * 1024 * 1024)).toBe('1.25 GB');
  });

  it('drops decimals once values pass 100', () => {
    expect(formatBytes(150 * 1024)).toBe('150 KB');
  });

  it('clamps invalid input to 0 B', () => {
    expect(formatBytes(-5)).toBe('0 B');
    expect(formatBytes(NaN)).toBe('0 B');
  });
});
