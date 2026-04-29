import { Injectable, inject } from '@angular/core';
import { resource } from '@angular/core';
import { TauriBridgeService } from './tauri-bridge.service';
import { ExcludedApp } from '../models/excluded-app.model';

@Injectable({ providedIn: 'root' })
export class ExcludedAppsService {
  private bridge = inject(TauriBridgeService);

  readonly excludedApps = resource<ExcludedApp[], unknown>({
    loader: () => this.bridge.getExcludedApps(),
  });

  async addExcludedApp(processName: string): Promise<void> {
    const app = await this.bridge.addExcludedApp(processName);
    this.excludedApps.update(apps => [...(apps ?? []), app]);
  }

  async removeExcludedApp(id: number): Promise<void> {
    await this.bridge.removeExcludedApp(id);
    this.excludedApps.update(apps => (apps ?? []).filter(a => a.id !== id));
  }
}
