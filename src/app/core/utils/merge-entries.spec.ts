import { mergeEntries } from './merge-entries';

describe('mergeEntries', () => {
  describe('newline separator', () => {
    it('joins items with \\n', () => {
      expect(mergeEntries(['a', 'b', 'c'], 'newline')).toBe('a\nb\nc');
    });

    it('returns empty string for empty input', () => {
      expect(mergeEntries([], 'newline')).toBe('');
    });

    it('returns single item without separator when only one input', () => {
      expect(mergeEntries(['only'], 'newline')).toBe('only');
    });
  });

  describe('bullet separator', () => {
    it('prefixes each line with "- " and joins with \\n', () => {
      expect(mergeEntries(['a', 'b', 'c'], 'bullet')).toBe('- a\n- b\n- c');
    });

    it('returns single bulleted item when only one input', () => {
      expect(mergeEntries(['only'], 'bullet')).toBe('- only');
    });
  });

  describe('comma separator', () => {
    it('joins items with ", "', () => {
      expect(mergeEntries(['a', 'b', 'c'], 'comma')).toBe('a, b, c');
    });
  });

  describe('trimming and empty filtering', () => {
    it('trims leading/trailing whitespace on each item', () => {
      expect(mergeEntries(['  a  ', '\nb\n', '\tc'], 'comma')).toBe('a, b, c');
    });

    it('preserves internal whitespace', () => {
      expect(mergeEntries(['hello world', 'foo  bar'], 'newline')).toBe('hello world\nfoo  bar');
    });

    it('drops items that are empty after trim (newline)', () => {
      expect(mergeEntries(['a', '   ', 'b'], 'newline')).toBe('a\nb');
    });

    it('drops items that are empty after trim (bullet)', () => {
      expect(mergeEntries(['a', '\n\n', 'b'], 'bullet')).toBe('- a\n- b');
    });

    it('drops items that are empty after trim (comma)', () => {
      expect(mergeEntries(['', 'a', '   ', 'b', ''], 'comma')).toBe('a, b');
    });

    it('returns empty string when every item is whitespace-only', () => {
      expect(mergeEntries(['', '   ', '\n\t'], 'newline')).toBe('');
    });

    it('returns single trimmed item when others are empty', () => {
      expect(mergeEntries(['', 'only', '   '], 'comma')).toBe('only');
    });
  });
});
