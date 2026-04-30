import { Signal, WritableSignal, computed, linkedSignal } from '@angular/core';
import { ClipboardEntry } from '../../core/models/clipboard-entry.model';

export class ClipboardSelection {
  private readonly _entries: Signal<ClipboardEntry[]>;
  private readonly _rawIndex: WritableSignal<number>;
  private readonly _editingId: WritableSignal<number | null>;

  readonly selectedIndex: Signal<number>;
  readonly selectedEntry: Signal<ClipboardEntry | null>;
  readonly editingEntry: Signal<ClipboardEntry | null>;

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
}
