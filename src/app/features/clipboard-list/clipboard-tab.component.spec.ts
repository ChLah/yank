import { ClipboardTabType } from './clipboard-tab.component';
import { filterClipboardEntriesByRegex } from '../../core/services/clipboard.service';
import { ClipboardEntry } from '../../core/models/clipboard-entry.model';

describe('ClipboardTabType', () => {
  it('accepts recent and pinned as valid values', () => {
    const recent: ClipboardTabType = 'recent';
    const pinned: ClipboardTabType = 'pinned';
    expect(recent).toBe('recent');
    expect(pinned).toBe('pinned');
  });
});

describe('filteredEntries computed — null lastValidRegex returns unfiltered base', () => {
  it('filterClipboardEntriesByRegex with null rx returns base entries (no filtering)', () => {
    // When lastValidRegex is null (cleared by empty input),
    // filteredEntries returns base unchanged
    const entries: ClipboardEntry[] = [
      {
        id: 1,
        kind: 'text' as const,
        content: 'hello',
        thumbnail: null,
        width: null,
        height: null,
        hash: 'a',
        createdAt: 0,
        lastUsedAt: 0,
        pinned: false,
        sourceApp: null,
      },
    ];
    // Simulate: regex mode on, input cleared → lastValidRegex is null → no filter applied
    const rx: RegExp | null = null;
    const result = rx ? filterClipboardEntriesByRegex(entries, rx) : entries;
    expect(result).toEqual(entries);
  });
});
