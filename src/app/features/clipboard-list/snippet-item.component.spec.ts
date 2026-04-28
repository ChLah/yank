import { describe, it, expect } from 'vitest';
import { resolveSnippetTitleKey } from './snippet-item.component';

describe('resolveSnippetTitleKey', () => {
  it('returns cancel for Escape', () => {
    expect(resolveSnippetTitleKey('Escape', false)).toBe('cancel');
  });
  it('returns submit for Ctrl+Enter', () => {
    expect(resolveSnippetTitleKey('Enter', true)).toBe('submit');
  });
  it('returns move-to-content for plain Enter', () => {
    expect(resolveSnippetTitleKey('Enter', false)).toBe('move-to-content');
  });
  it('returns move-to-content for Tab', () => {
    expect(resolveSnippetTitleKey('Tab', false)).toBe('move-to-content');
  });
  it('returns null for regular typing keys', () => {
    expect(resolveSnippetTitleKey('a', false)).toBeNull();
    expect(resolveSnippetTitleKey('ArrowDown', false)).toBeNull();
  });
  it('returns null for Ctrl+Tab', () => {
    expect(resolveSnippetTitleKey('Tab', true)).toBeNull();
  });
});
