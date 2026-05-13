import { Injectable } from '@angular/core';

export type TransformId =
  | 'strip-whitespace'
  | 'uppercase'
  | 'lowercase'
  | 'title-case'
  | 'url-encode'
  | 'url-decode'
  | 'base64-encode'
  | 'base64-decode'
  | 'json-format'
  | 'strip-html'
  | 'remove-duplicate-lines'
  | 'sort-lines-asc';

export interface TransformOption {
  id: TransformId;
  labelKey: string;
}

export type TransformResult = { ok: true; value: string } | { ok: false; error: string };

@Injectable({ providedIn: 'root' })
export class TransformService {
  readonly options: TransformOption[] = [
    { id: 'strip-whitespace', labelKey: 'TRANSFORM.STRIP_WHITESPACE' },
    { id: 'uppercase', labelKey: 'TRANSFORM.UPPERCASE' },
    { id: 'lowercase', labelKey: 'TRANSFORM.LOWERCASE' },
    { id: 'title-case', labelKey: 'TRANSFORM.TITLE_CASE' },
    { id: 'url-encode', labelKey: 'TRANSFORM.URL_ENCODE' },
    { id: 'url-decode', labelKey: 'TRANSFORM.URL_DECODE' },
    { id: 'base64-encode', labelKey: 'TRANSFORM.BASE64_ENCODE' },
    { id: 'base64-decode', labelKey: 'TRANSFORM.BASE64_DECODE' },
    { id: 'json-format', labelKey: 'TRANSFORM.JSON_FORMAT' },
    { id: 'strip-html', labelKey: 'TRANSFORM.STRIP_HTML' },
    { id: 'remove-duplicate-lines', labelKey: 'TRANSFORM.REMOVE_DUPLICATE_LINES' },
    { id: 'sort-lines-asc', labelKey: 'TRANSFORM.SORT_LINES_ASC' },
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
        return { ok: true, value: content.replace(/\b\w/g, (c) => c.toUpperCase()) };
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
      case 'base64-encode': {
        const bytes = new TextEncoder().encode(content);
        let binary = '';
        for (const b of bytes) binary += String.fromCharCode(b);
        return { ok: true, value: btoa(binary) };
      }
      case 'base64-decode':
        try {
          const binary = atob(content);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
          return { ok: true, value: new TextDecoder('utf-8', { fatal: true }).decode(bytes) };
        } catch {
          return { ok: false, error: 'TRANSFORM.ERROR_BASE64_DECODE' };
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
      case 'remove-duplicate-lines':
        return {
          ok: true,
          value: content
            .split('\n')
            .filter((line, i, arr) => arr.indexOf(line) === i)
            .join('\n'),
        };
      case 'sort-lines-asc':
        return {
          ok: true,
          value: content
            .split('\n')
            .sort((a, b) => a.localeCompare(b))
            .join('\n'),
        };
    }
  }
}
