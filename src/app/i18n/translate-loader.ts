import { TranslateLoader } from '@ngx-translate/core';
import { Observable, of } from 'rxjs';
import { en } from './en';
import { de } from './de';

const translations: Record<string, any> = { en, de };

export class TypescriptTranslateLoader implements TranslateLoader {
  getTranslation(lang: string): Observable<any> {
    return of(translations[lang] ?? translations['en']);
  }
}
