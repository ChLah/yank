import {
  ApplicationConfig,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideRouter, withHashLocation } from '@angular/router';
import { TranslateLoader, provideTranslateService } from '@ngx-translate/core';
import { routes } from './app.routes';
import { TypescriptTranslateLoader } from './i18n/translate-loader';
import { I18nService } from './core/services/i18n.service';
import { ThemeService } from './core/services/theme.service';
import { TauriBridgeService } from './core/services/tauri-bridge.service';
import { TauriEventBus } from './core/services/tauri-event-bus.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withHashLocation()),
    provideTranslateService({
      defaultLanguage: 'en',
      loader: { provide: TranslateLoader, useClass: TypescriptTranslateLoader },
    }),
    provideAppInitializer(() => inject(I18nService).init()),
    provideAppInitializer(async () => {
      const settings = await inject(TauriBridgeService).getSettings();
      inject(ThemeService).applyTheme(settings.theme);
    }),
    provideAppInitializer(() => {
      inject(TauriEventBus).init();
    }),
  ],
};
