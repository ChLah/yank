import { APP_INITIALIZER, ApplicationConfig, inject, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withHashLocation } from '@angular/router';
import { TranslateLoader, provideTranslateService } from '@ngx-translate/core';
import { routes } from './app.routes';
import { TypescriptTranslateLoader } from './i18n/translate-loader';
import { I18nService } from './core/services/i18n.service';
import { ThemeService } from './core/services/theme.service';
import { TauriBridgeService } from './core/services/tauri-bridge.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withHashLocation()),
    provideTranslateService({
      defaultLanguage: 'en',
      loader: { provide: TranslateLoader, useClass: TypescriptTranslateLoader },
    }),
    {
      provide: APP_INITIALIZER,
      useFactory: () => { const svc = inject(I18nService); return () => svc.init(); },
      multi: true,
    },
    {
      provide: APP_INITIALIZER,
      useFactory: () => {
        const bridge = inject(TauriBridgeService);
        const theme = inject(ThemeService);
        return async () => {
          const settings = await bridge.getSettings();
          theme.applyTheme(settings.theme);
        };
      },
      multi: true,
    },
  ],
};
