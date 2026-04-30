import { Injectable, computed, inject, resource } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TauriBridgeService } from './tauri-bridge.service';
import { TauriEventBus } from './tauri-event-bus.service';
import { ClipboardEntry, ClipboardKind } from '../models/clipboard-entry.model';

export type ClipboardKindFilter = 'all' | ClipboardKind;

@Injectable({ providedIn: 'root' })
export class ClipboardService {
  private bridge = inject(TauriBridgeService);
  private bus = inject(TauriEventBus);

  private readonly _entries = resource({
    loader: () => this.bridge.getEntries(),
  });

  readonly isLoading = computed(() => this._entries.isLoading());
  readonly error = computed(() => this._entries.error());
  readonly count = computed(() => this._entries.value()?.length ?? 0);

  constructor() {
    this.bus.clipboardChanged$.pipe(takeUntilDestroyed()).subscribe(() => this._entries.reload());
    this.bus.popupShown$.pipe(takeUntilDestroyed()).subscribe(() => this._entries.reload());
  }

  reload(): void {
    this._entries.reload();
  }

  async setClipboard(id: number): Promise<void> {
    await this.bridge.setClipboard(id);
    await this.bridge.hidePopup();
  }

  async deleteEntry(id: number): Promise<void> {
    await this.bridge.deleteEntry(id);
    this._entries.reload();
  }

  async togglePin(id: number): Promise<void> {
    await this.bridge.togglePin(id);
    this._entries.reload();
  }

  filterEntries(pinnedOnly: boolean, kind: ClipboardKindFilter, search: string): ClipboardEntry[] {
    return filterClipboardEntries(this._entries.value() ?? [], pinnedOnly, kind, search);
  }
}

export function filterClipboardEntries(
  entries: ClipboardEntry[],
  pinnedOnly: boolean,
  kind: ClipboardKindFilter,
  search: string,
): ClipboardEntry[] {
  let list = entries;
  if (pinnedOnly) list = list.filter((e) => e.pinned);
  if (kind !== 'all') list = list.filter((e) => e.kind === kind);
  const q = search.toLowerCase().trim();
  if (q) list = list.filter((e) => e.content?.toLowerCase().includes(q));
  return list;
}

export function filterClipboardEntriesByRegex(
  entries: ClipboardEntry[],
  rx: RegExp,
): ClipboardEntry[] {
  return entries.filter((e) => e.content != null && rx.test(e.content));
}
