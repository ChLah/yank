import { ClipboardTabType } from './clipboard-tab.component';

describe('ClipboardTabType', () => {
  it('accepts recent and pinned as valid values', () => {
    const recent: ClipboardTabType = 'recent';
    const pinned: ClipboardTabType = 'pinned';
    expect(recent).toBe('recent');
    expect(pinned).toBe('pinned');
  });
});
