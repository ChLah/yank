// src/app/core/services/i18n.service.ts
import { Injectable, inject, signal } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { TauriBridgeService } from './tauri-bridge.service';
import { Language } from '../models/settings.model';

@Injectable({ providedIn: 'root' })
export class I18nService {
  private translate = inject(TranslateService);
  private bridge = inject(TauriBridgeService);

  readonly currentLanguage = signal<Language | null>(null);

  async init(): Promise<void> {
    const settings = await this.bridge.getSettings();
    this.setLanguage(settings.language ?? null);
  }

  setLanguage(lang: Language | null): void {
    this.currentLanguage.set(lang);
    const resolved = lang ?? this.detectOsLanguage();
    this.translate.use(resolved);
  }

  private detectOsLanguage(): Language {
    return navigator.language.startsWith('de') ? 'de' : 'en';
  }
}
