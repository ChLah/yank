import { FormatBytesPipe } from './format-bytes.pipe';

describe('FormatBytesPipe', () => {
  const pipe = new FormatBytesPipe();

  it('formats common values', () => {
    expect(pipe.transform(0)).toBe('0 B');
    expect(pipe.transform(1024)).toBe('1.00 KB');
    expect(pipe.transform(1.25 * 1024 * 1024 * 1024)).toBe('1.25 GB');
  });

  it('returns empty string for null / undefined', () => {
    expect(pipe.transform(null)).toBe('');
    expect(pipe.transform(undefined)).toBe('');
  });
});
