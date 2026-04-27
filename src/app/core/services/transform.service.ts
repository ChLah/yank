import { Injectable } from '@angular/core';

export type TransformId =
  | 'strip-whitespace'
  | 'uppercase'
  | 'lowercase'
  | 'title-case'
  | 'url-encode'
  | 'url-decode'
  | 'json-format'
  | 'strip-html';

export interface TransformOption {
  id: TransformId;
  labelKey: string;
}

export type TransformResult =
  | { ok: true; value: string }
  | { ok: false; error: string };

@Injectable({ providedIn: 'root' })
export class TransformService {
  readonly options: TransformOption[] = [
    { id: 'strip-whitespace', labelKey: 'TRANSFORM.STRIP_WHITESPACE' },
    { id: 'uppercase', labelKey: 'TRANSFORM.UPPERCASE' },
    { id: 'lowercase', labelKey: 'TRANSFORM.LOWERCASE' },
    { id: 'title-case', labelKey: 'TRANSFORM.TITLE_CASE' },
    { id: 'url-encode', labelKey: 'TRANSFORM.URL_ENCODE' },
    { id: 'url-decode', labelKey: 'TRANSFORM.URL_DECODE' },
    { id: 'json-format', labelKey: 'TRANSFORM.JSON_FORMAT' },
    { id: 'strip-html', labelKey: 'TRANSFORM.STRIP_HTML' },
  ];

  apply(id: TransformId, content: string): TransformResult {
    switch (id) {
      case 'strip-whitespace':
        return { ok: true, value: content.trim().replace(/\s+/g, ' ') };
      case 'uppercase':
        return { ok: true, value: content.toUpperCase() };
      case 'lowercase':
        return { ok: true, value: content.toLowerCase() };
      case 'title-case':
        return { ok: true, value: content.replace(/\b\w/g, c => c.toUpperCase()) };
      case 'url-encode':
        return { ok: true, value: encodeURIComponent(content) };
      case 'url-decode':
        try {
          return { ok: true, value: decodeURIComponent(content) };
        } catch (e) {
          if (e instanceof URIError) {
            return { ok: false, error: 'TRANSFORM.ERROR_URL_DECODE' };
          }
          throw e;
        }
      case 'json-format':
        try {
          return { ok: true, value: JSON.stringify(JSON.parse(content), null, 2) };
        } catch (e) {
          if (e instanceof SyntaxError) {
            return { ok: false, error: 'TRANSFORM.ERROR_JSON' };
          }
          throw e;
        }
      case 'strip-html':
        return { ok: true, value: content.replace(/<[^>]+>/g, '') };
    }
  }
}
