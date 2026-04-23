import { TranslateLoader } from '@ngx-translate/core';
import { Observable, of } from 'rxjs';
import { en } from './en';
import { de } from './de';
import { Translation } from './translation.interface';

const translations: Record<string, Translation> = { en, de };

export class TypescriptTranslateLoader implements TranslateLoader {
  getTranslation(lang: string): Observable<Translation> {
    return of(translations[lang] ?? translations['en']);
  }
}
