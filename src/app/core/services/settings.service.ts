import { Injectable, inject, resource } from '@angular/core';
import { TauriBridgeService } from './tauri-bridge.service';
import { AppSettings } from '../models/settings.model';

@Injectable({ providedIn: 'root' })
export class SettingsService {
  private bridge = inject(TauriBridgeService);

  readonly settings = resource({
    loader: () => this.bridge.getSettings(),
  });

  async saveSettings(settings: AppSettings): Promise<void> {
    await this.bridge.saveSettings(settings);
    this.settings.reload();
  }
}
