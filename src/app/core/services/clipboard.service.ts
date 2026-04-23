import { Injectable, OnDestroy, inject, resource } from '@angular/core';
import { TauriBridgeService } from './tauri-bridge.service';
import { UnlistenFn } from '@tauri-apps/api/event';

@Injectable({ providedIn: 'root' })
export class ClipboardService implements OnDestroy {
  private bridge = inject(TauriBridgeService);

  readonly entries = resource({
    loader: () => this.bridge.getEntries(),
  });

  private unlistenClipboardChanged?: UnlistenFn;
  private unlistenPopupShown?: UnlistenFn;

  constructor() {
    this.setupListeners();
  }

  private async setupListeners(): Promise<void> {
    this.unlistenClipboardChanged = await this.bridge.onClipboardChanged(() => {
      this.entries.reload();
    });

    this.unlistenPopupShown = await this.bridge.onPopupShown(() => {
      this.entries.reload();
    });
  }

  async setClipboard(id: number): Promise<void> {
    await this.bridge.setClipboard(id);
    await this.bridge.hidePopup();
  }

  async deleteEntry(id: number): Promise<void> {
    await this.bridge.deleteEntry(id);
    this.entries.reload();
  }

  async togglePin(id: number): Promise<void> {
    await this.bridge.togglePin(id);
    this.entries.reload();
  }

  ngOnDestroy(): void {
    this.unlistenClipboardChanged?.();
    this.unlistenPopupShown?.();
  }
}
