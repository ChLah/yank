import { Signal, WritableSignal, computed, linkedSignal, signal } from '@angular/core';
import { ClipboardEntry, ClipboardKind } from '../../core/models/clipboard-entry.model';

export class ClipboardSelection {
  private readonly _entries: Signal<ClipboardEntry[]>;
  private readonly _rawIndex: WritableSignal<number>;
  private readonly _editingId: WritableSignal<number | null>;
  private readonly _markedIds: WritableSignal<Set<number>>;

  readonly selectedIndex: Signal<number>;
  readonly selectedEntry: Signal<ClipboardEntry | null>;
  readonly editingEntry: Signal<ClipboardEntry | null>;
  readonly markedIds: Signal<ReadonlySet<number>>;
  readonly markedCount: Signal<number>;

  constructor(entries: Signal<ClipboardEntry[]>) {
    this._entries = entries;

    this._rawIndex = linkedSignal({
      source: () => entries(),
      computation: () => 0,
    });

    this._editingId = linkedSignal<ClipboardEntry[], number | null>({
      source: () => entries(),
      computation: () => null,
    });

    // Marks are a plain signal — they intentionally survive entries-signal changes
    // (filter, search, tab switches) since they are tied to entry IDs.
    this._markedIds = signal(new Set<number>());

    this.selectedIndex = computed(() => {
      const len = this._entries().length;
      return len === 0 ? 0 : Math.max(0, Math.min(len - 1, this._rawIndex()));
    });

    this.selectedEntry = computed(() => this._entries()[this.selectedIndex()] ?? null);

    this.editingEntry = computed(() => {
      const id = this._editingId();
      if (id === null) return null;
      return this._entries().find((e) => e.id === id) ?? null;
    });

    this.markedIds = this._markedIds.asReadonly();
    this.markedCount = computed(() => this._markedIds().size);
  }

  moveUp(): void {
    if (this._entries().length === 0) return;
    this._rawIndex.update((i) => Math.max(0, i - 1));
  }

  moveDown(): void {
    const len = this._entries().length;
    if (len === 0) return;
    this._rawIndex.update((i) => Math.min(len - 1, i + 1));
  }

  selectAt(index: number): void {
    const len = this._entries().length;
    this._rawIndex.set(len === 0 ? 0 : Math.max(0, Math.min(len - 1, index)));
  }

  enterEditMode(): void {
    const entry = this.selectedEntry();
    if (!entry || entry.kind !== 'text') return;
    this._editingId.set(entry.id);
  }

  exitEditMode(): void {
    this._editingId.set(null);
  }

  isMarked(id: number): boolean {
    return this._markedIds().has(id);
  }

  toggleMark(id: number, kind: ClipboardKind): void {
    if (kind !== 'text') return;
    this._markedIds.update((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  unmark(id: number): void {
    this._markedIds.update((s) => {
      if (!s.has(id)) return s;
      const next = new Set(s);
      next.delete(id);
      return next;
    });
  }

  clearMarks(): void {
    if (this._markedIds().size === 0) return;
    this._markedIds.set(new Set());
  }
}
