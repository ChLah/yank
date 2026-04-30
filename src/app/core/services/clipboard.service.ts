import { Injectable, OnDestroy, computed, inject, resource } from '@angular/core';
import { TauriBridgeService } from './tauri-bridge.service';
import { ClipboardEntry, ClipboardKind } from '../models/clipboard-entry.model';
import { UnlistenFn } from '@tauri-apps/api/event';

export type ClipboardKindFilter = 'all' | ClipboardKind;

@Injectable({ providedIn: 'root' })
export class ClipboardService implements OnDestroy {
  private bridge = inject(TauriBridgeService);

  private readonly _entries = resource({
    loader: () => this.bridge.getEntries(),
  });

  readonly isLoading = computed(() => this._entries.isLoading());
  readonly error = computed(() => this._entries.error());
  readonly count = computed(() => this._entries.value()?.length ?? 0);

  private unlistenClipboardChanged?: UnlistenFn;
  private unlistenPopupShown?: UnlistenFn;

  constructor() {
    this.setupListeners();
  }

  private async setupListeners(): Promise<void> {
    this.unlistenClipboardChanged = await this.bridge.onClipboardChanged(() => {
      this._entries.reload();
    });

    this.unlistenPopupShown = await this.bridge.onPopupShown(() => {
      this._entries.reload();
    });
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

  ngOnDestroy(): void {
    this.unlistenClipboardChanged?.();
    this.unlistenPopupShown?.();
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
