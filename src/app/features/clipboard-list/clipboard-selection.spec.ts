import { signal } from '@angular/core';
import { ClipboardEntry } from '../../core/models/clipboard-entry.model';
import { ClipboardSelection } from './clipboard-selection';

function makeEntry(id: number, kind: 'text' | 'image' = 'text'): ClipboardEntry {
  return {
    id,
    kind,
    content: kind === 'text' ? `entry ${id}` : null,
    thumbnail: null,
    width: null,
    height: null,
    hash: `hash${id}`,
    createdAt: id,
    lastUsedAt: id,
    pinned: false,
    sourceApp: null,
  };
}

describe('ClipboardSelection — navigation', () => {
  it('starts at index 0', () => {
    const entries = signal([makeEntry(1), makeEntry(2), makeEntry(3)]);
    const sel = new ClipboardSelection(entries);
    expect(sel.selectedIndex()).toBe(0);
  });

  it('moveDown increments selectedIndex', () => {
    const entries = signal([makeEntry(1), makeEntry(2), makeEntry(3)]);
    const sel = new ClipboardSelection(entries);
    sel.moveDown();
    expect(sel.selectedIndex()).toBe(1);
  });

  it('moveDown clamps at last item', () => {
    const entries = signal([makeEntry(1), makeEntry(2)]);
    const sel = new ClipboardSelection(entries);
    sel.moveDown();
    sel.moveDown(); // attempt past end
    expect(sel.selectedIndex()).toBe(1);
  });

  it('moveUp decrements selectedIndex', () => {
    const entries = signal([makeEntry(1), makeEntry(2), makeEntry(3)]);
    const sel = new ClipboardSelection(entries);
    sel.moveDown();
    sel.moveUp();
    expect(sel.selectedIndex()).toBe(0);
  });

  it('moveUp clamps at 0', () => {
    const entries = signal([makeEntry(1), makeEntry(2)]);
    const sel = new ClipboardSelection(entries);
    sel.moveUp(); // already at 0
    expect(sel.selectedIndex()).toBe(0);
  });

  it('selectAt sets index within bounds', () => {
    const entries = signal([makeEntry(1), makeEntry(2), makeEntry(3)]);
    const sel = new ClipboardSelection(entries);
    sel.selectAt(2);
    expect(sel.selectedIndex()).toBe(2);
  });

  it('selectAt clamps negative index to 0', () => {
    const entries = signal([makeEntry(1), makeEntry(2)]);
    const sel = new ClipboardSelection(entries);
    sel.selectAt(-5);
    expect(sel.selectedIndex()).toBe(0);
  });

  it('selectAt clamps index past end to last', () => {
    const entries = signal([makeEntry(1), makeEntry(2)]);
    const sel = new ClipboardSelection(entries);
    sel.selectAt(99);
    expect(sel.selectedIndex()).toBe(1);
  });

  it('selectAt on empty entries keeps index at 0', () => {
    const entries = signal<ClipboardEntry[]>([]);
    const sel = new ClipboardSelection(entries);
    sel.selectAt(3);
    expect(sel.selectedIndex()).toBe(0);
  });
});

describe('ClipboardSelection — selectedEntry', () => {
  it('returns the entry at the current index', () => {
    const a = makeEntry(1);
    const b = makeEntry(2);
    const entries = signal([a, b]);
    const sel = new ClipboardSelection(entries);
    expect(sel.selectedEntry()).toBe(a);
    sel.moveDown();
    expect(sel.selectedEntry()).toBe(b);
  });

  it('returns null when entries is empty', () => {
    const entries = signal<ClipboardEntry[]>([]);
    const sel = new ClipboardSelection(entries);
    expect(sel.selectedEntry()).toBeNull();
  });
});

describe('ClipboardSelection — entries change resets state', () => {
  it('resets selectedIndex to 0 when entries signal changes', () => {
    const entries = signal([makeEntry(1), makeEntry(2), makeEntry(3)]);
    const sel = new ClipboardSelection(entries);
    sel.moveDown();
    sel.moveDown();
    expect(sel.selectedIndex()).toBe(2);

    entries.set([makeEntry(10), makeEntry(11), makeEntry(12)]);
    expect(sel.selectedIndex()).toBe(0);
  });

  it('clears editingEntry when entries signal changes', () => {
    const entries = signal([makeEntry(1), makeEntry(2)]);
    const sel = new ClipboardSelection(entries);
    sel.enterEditMode();
    expect(sel.editingEntry()).not.toBeNull();

    entries.set([makeEntry(10), makeEntry(11)]);
    expect(sel.editingEntry()).toBeNull();
  });

  it('returns selectedIndex 0 when entries becomes empty', () => {
    const entries = signal([makeEntry(1), makeEntry(2)]);
    const sel = new ClipboardSelection(entries);
    sel.moveDown();

    entries.set([]);
    expect(sel.selectedIndex()).toBe(0);
    expect(sel.selectedEntry()).toBeNull();
    expect(sel.editingEntry()).toBeNull();
  });
});

describe('ClipboardSelection — edit mode', () => {
  it('enterEditMode sets editingEntry for a text entry', () => {
    const entry = makeEntry(1, 'text');
    const entries = signal([entry]);
    const sel = new ClipboardSelection(entries);
    sel.enterEditMode();
    expect(sel.editingEntry()).toBe(entry);
  });

  it('enterEditMode is a no-op for an image entry', () => {
    const entries = signal([makeEntry(1, 'image')]);
    const sel = new ClipboardSelection(entries);
    sel.enterEditMode();
    expect(sel.editingEntry()).toBeNull();
  });

  it('enterEditMode is a no-op when entries is empty', () => {
    const entries = signal<ClipboardEntry[]>([]);
    const sel = new ClipboardSelection(entries);
    sel.enterEditMode();
    expect(sel.editingEntry()).toBeNull();
  });

  it('exitEditMode clears editing state', () => {
    const entries = signal([makeEntry(1, 'text')]);
    const sel = new ClipboardSelection(entries);
    sel.enterEditMode();
    expect(sel.editingEntry()).not.toBeNull();
    sel.exitEditMode();
    expect(sel.editingEntry()).toBeNull();
  });

  it('navigation works normally after exitEditMode', () => {
    const entries = signal([makeEntry(1, 'text'), makeEntry(2, 'text')]);
    const sel = new ClipboardSelection(entries);
    sel.enterEditMode();
    sel.exitEditMode();
    sel.moveDown();
    expect(sel.selectedIndex()).toBe(1);
    expect(sel.editingEntry()).toBeNull();
  });
});

describe('ClipboardSelection — marks', () => {
  it('starts with no marks', () => {
    const entries = signal([makeEntry(1), makeEntry(2)]);
    const sel = new ClipboardSelection(entries);
    expect(sel.markedCount()).toBe(0);
    expect(sel.isMarked(1)).toBe(false);
  });

  it('toggleMark adds an id when not marked (text entry)', () => {
    const entries = signal([makeEntry(1, 'text')]);
    const sel = new ClipboardSelection(entries);
    sel.toggleMark(1, 'text');
    expect(sel.isMarked(1)).toBe(true);
    expect(sel.markedCount()).toBe(1);
  });

  it('toggleMark removes an id when already marked', () => {
    const entries = signal([makeEntry(1, 'text')]);
    const sel = new ClipboardSelection(entries);
    sel.toggleMark(1, 'text');
    sel.toggleMark(1, 'text');
    expect(sel.isMarked(1)).toBe(false);
    expect(sel.markedCount()).toBe(0);
  });

  it('toggleMark is a no-op for image entries', () => {
    const entries = signal([makeEntry(1, 'image')]);
    const sel = new ClipboardSelection(entries);
    sel.toggleMark(1, 'image');
    expect(sel.isMarked(1)).toBe(false);
    expect(sel.markedCount()).toBe(0);
  });

  it('unmark removes a specific id', () => {
    const entries = signal([makeEntry(1, 'text'), makeEntry(2, 'text')]);
    const sel = new ClipboardSelection(entries);
    sel.toggleMark(1, 'text');
    sel.toggleMark(2, 'text');
    sel.unmark(1);
    expect(sel.isMarked(1)).toBe(false);
    expect(sel.isMarked(2)).toBe(true);
    expect(sel.markedCount()).toBe(1);
  });

  it('unmark is a no-op for an unmarked id', () => {
    const entries = signal([makeEntry(1, 'text')]);
    const sel = new ClipboardSelection(entries);
    sel.unmark(99);
    expect(sel.markedCount()).toBe(0);
  });

  it('clearMarks empties the set', () => {
    const entries = signal([makeEntry(1, 'text'), makeEntry(2, 'text')]);
    const sel = new ClipboardSelection(entries);
    sel.toggleMark(1, 'text');
    sel.toggleMark(2, 'text');
    sel.clearMarks();
    expect(sel.markedCount()).toBe(0);
    expect(sel.isMarked(1)).toBe(false);
    expect(sel.isMarked(2)).toBe(false);
  });

  it('marks are preserved across entries-signal changes', () => {
    const entries = signal([makeEntry(1, 'text'), makeEntry(2, 'text')]);
    const sel = new ClipboardSelection(entries);
    sel.toggleMark(1, 'text');
    sel.toggleMark(2, 'text');
    // Simulate filter or tab change re-emitting the same IDs
    entries.set([makeEntry(1, 'text'), makeEntry(2, 'text')]);
    expect(sel.isMarked(1)).toBe(true);
    expect(sel.isMarked(2)).toBe(true);
  });

  it('markedCount is reactive', () => {
    const entries = signal([makeEntry(1, 'text'), makeEntry(2, 'text')]);
    const sel = new ClipboardSelection(entries);
    expect(sel.markedCount()).toBe(0);
    sel.toggleMark(1, 'text');
    expect(sel.markedCount()).toBe(1);
    sel.toggleMark(2, 'text');
    expect(sel.markedCount()).toBe(2);
    sel.toggleMark(1, 'text');
    expect(sel.markedCount()).toBe(1);
  });
});
