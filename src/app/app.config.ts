import { APP_INITIALIZER, ApplicationConfig, importProvidersFrom, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withHashLocation } from '@angular/router';
import { TranslateLoader, TranslateModule } from '@ngx-translate/core';
import { routes } from './app.routes';
import { TypescriptTranslateLoader } from './i18n/translate-loader';
import { I18nService } from './core/services/i18n.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withHashLocation()),
    importProvidersFrom(
      TranslateModule.forRoot({
        defaultLanguage: 'en',
        loader: {
          provide: TranslateLoader,
          useClass: TypescriptTranslateLoader,
        },
      }),
    ),
    {
      provide: APP_INITIALIZER,
      useFactory: (i18nService: I18nService) => () => i18nService.init(),
      deps: [I18nService],
      multi: true,
    },
  ],
};
