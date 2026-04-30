import { filterClipboardEntries } from './clipboard.service';
import { ClipboardEntry } from '../models/clipboard-entry.model';

function makeEntry(partial: Partial<ClipboardEntry>): ClipboardEntry {
  return {
    id: 1,
    kind: 'text',
    content: 'hello',
    thumbnail: null,
    width: null,
    height: null,
    hash: 'abc',
    createdAt: 0,
    lastUsedAt: 0,
    pinned: false,
    sourceApp: null,
    ...partial,
  };
}

describe('filterClipboardEntries', () => {
  it('returns all entries when no filters apply', () => {
    const entries = [makeEntry({ id: 1 }), makeEntry({ id: 2 })];
    expect(filterClipboardEntries(entries, false, 'all', '')).toEqual(entries);
  });

  it('filters to pinned entries when pinnedOnly is true', () => {
    const entries = [makeEntry({ id: 1, pinned: true }), makeEntry({ id: 2, pinned: false })];
    expect(filterClipboardEntries(entries, true, 'all', '')).toEqual([entries[0]]);
  });

  it('returns all entries regardless of pinned when pinnedOnly is false', () => {
    const entries = [makeEntry({ id: 1, pinned: true }), makeEntry({ id: 2, pinned: false })];
    expect(filterClipboardEntries(entries, false, 'all', '')).toEqual(entries);
  });

  it('filters by text kind', () => {
    const entries = [makeEntry({ id: 1, kind: 'text' }), makeEntry({ id: 2, kind: 'image' })];
    expect(filterClipboardEntries(entries, false, 'text', '')).toEqual([entries[0]]);
  });

  it('filters by image kind', () => {
    const entries = [makeEntry({ id: 1, kind: 'text' }), makeEntry({ id: 2, kind: 'image' })];
    expect(filterClipboardEntries(entries, false, 'image', '')).toEqual([entries[1]]);
  });

  it('filters by search query (case-insensitive)', () => {
    const entries = [
      makeEntry({ id: 1, content: 'Hello World' }),
      makeEntry({ id: 2, content: 'Foo Bar' }),
    ];
    expect(filterClipboardEntries(entries, false, 'all', 'hello')).toEqual([entries[0]]);
    expect(filterClipboardEntries(entries, false, 'all', 'HELLO')).toEqual([entries[0]]);
  });

  it('trims search query whitespace', () => {
    const entries = [makeEntry({ id: 1, content: 'hello' })];
    expect(filterClipboardEntries(entries, false, 'all', '  hello  ')).toEqual(entries);
  });

  it('excludes entries with null content from search', () => {
    const entries = [makeEntry({ id: 1, content: null }), makeEntry({ id: 2, content: 'hello' })];
    expect(filterClipboardEntries(entries, false, 'all', 'hello')).toEqual([entries[1]]);
  });

  it('combines pinnedOnly, kind, and search filters', () => {
    const entries = [
      makeEntry({ id: 1, pinned: true, kind: 'text', content: 'hello' }),
      makeEntry({ id: 2, pinned: true, kind: 'image', content: null }),
      makeEntry({ id: 3, pinned: false, kind: 'text', content: 'hello' }),
      makeEntry({ id: 4, pinned: true, kind: 'text', content: 'world' }),
    ];
    expect(filterClipboardEntries(entries, true, 'text', 'hello')).toEqual([entries[0]]);
  });

  it('returns empty array when no entries match', () => {
    const entries = [makeEntry({ id: 1, content: 'foo' })];
    expect(filterClipboardEntries(entries, false, 'all', 'zzz')).toEqual([]);
  });
});
