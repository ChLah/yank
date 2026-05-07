import {
  ApplicationConfig,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideRouter, withHashLocation } from '@angular/router';
import { TranslateLoader, provideTranslateService } from '@ngx-translate/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { routes } from './app.routes';
import { I18nService } from './core/services/i18n.service';
import { TauriBridgeService } from './core/services/tauri-bridge.service';
import { TauriEventBus } from './core/services/tauri-event-bus.service';
import { ThemeService } from './core/services/theme.service';
import { UpdaterService } from './core/services/updater.service';
import { TypescriptTranslateLoader } from './i18n/translate-loader';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withHashLocation()),
    provideTranslateService({
      defaultLanguage: 'en',
      loader: { provide: TranslateLoader, useClass: TypescriptTranslateLoader },
    }),
    provideAppInitializer(() => inject(I18nService).init()),
    provideAppInitializer(() => {
      const bridge = inject(TauriBridgeService);
      const theme = inject(ThemeService);
      return bridge.getSettings().then((settings) => theme.applyTheme(settings.theme));
    }),
    provideAppInitializer(() => inject(TauriEventBus).init()),
    provideAppInitializer(() => {
      const updater = inject(UpdaterService);
      const bridge = inject(TauriBridgeService);
      void updater.loadCurrentVersion();
      // Only the main window drives the startup auto-check, so spawning the
      // settings or image-preview windows doesn't kick off duplicate checks.
      if (getCurrentWindow().label !== 'main') return;
      return bridge.getSettings().then((settings) => {
        if (settings.autoCheckUpdates) {
          void updater.autoCheck();
        }
      });
    }),
  ],
};
