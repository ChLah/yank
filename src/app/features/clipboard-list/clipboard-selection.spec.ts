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
