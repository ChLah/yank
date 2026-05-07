import { Injectable, inject, resource } from '@angular/core';
import { TauriBridgeService } from './tauri-bridge.service';

@Injectable({ providedIn: 'root' })
export class StatsService {
  private bridge = inject(TauriBridgeService);

  readonly stats = resource({
    loader: () => this.bridge.getStats(),
  });

  async resetSession(): Promise<void> {
    await this.bridge.resetSessionStats();
    this.stats.reload();
  }

  async resetDatabase(confirm: string): Promise<void> {
    await this.bridge.resetDatabase(confirm);
    this.stats.reload();
  }
}
