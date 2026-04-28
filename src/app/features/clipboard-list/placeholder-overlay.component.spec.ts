import { describe, it, expect } from 'vitest';
import { extractPlaceholders, fillPlaceholders } from './placeholder-overlay.component';

describe('extractPlaceholders', () => {
  it('returns empty array for content with no placeholders', () => {
    expect(extractPlaceholders('Hello world')).toEqual([]);
  });
  it('extracts a single placeholder', () => {
    expect(extractPlaceholders('Hello {{name}}')).toEqual(['name']);
  });
  it('extracts multiple unique placeholders in order of first appearance', () => {
    expect(extractPlaceholders('Dear {{recipient}},\n\nAttached: {{document}}')).toEqual([
      'recipient',
      'document',
    ]);
  });
  it('deduplicates repeated placeholder names', () => {
    expect(extractPlaceholders('{{x}} and {{x}}')).toEqual(['x']);
  });
  it('preserves case sensitivity', () => {
    expect(extractPlaceholders('{{Name}} {{name}}')).toEqual(['Name', 'name']);
  });
  it('rejects placeholder names containing spaces (not matched)', () => {
    expect(extractPlaceholders('{{first name}}')).toEqual([]);
  });
  it('accepts hyphens and underscores in placeholder names', () => {
    expect(extractPlaceholders('{{my-var}} {{my_var}}')).toEqual(['my-var', 'my_var']);
  });
});

describe('fillPlaceholders', () => {
  it('replaces a single placeholder', () => {
    expect(fillPlaceholders('Hello {{name}}', { name: 'World' })).toBe('Hello World');
  });
  it('replaces multiple occurrences of the same placeholder', () => {
    expect(fillPlaceholders('{{x}} and {{x}}', { x: 'foo' })).toBe('foo and foo');
  });
  it('replaces distinct placeholders independently', () => {
    expect(
      fillPlaceholders('Dear {{recipient}}, see {{doc}}', { recipient: 'Alice', doc: 'report.pdf' }),
    ).toBe('Dear Alice, see report.pdf');
  });
  it('replaces unknown placeholder names with empty string', () => {
    expect(fillPlaceholders('{{missing}}', {})).toBe('');
  });
  it('leaves non-placeholder double-braces untouched', () => {
    expect(fillPlaceholders('cost: {{amount}}€', { amount: '5' })).toBe('cost: 5€');
  });
});
