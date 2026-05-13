# More Text Transforms Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend `TransformService` with eight new developer-focused transforms — Base64 encode/decode, MD5/SHA-1/SHA-256 hashes, remove duplicate lines, sort lines ascending, and slugify — bringing the total from 8 to 16.

**Architecture:** Sync transforms slot into the existing `apply()` switch. Hash transforms require async (SHA-* via `crypto.subtle.digest`, MD5 via a small pure-TS implementation); they live in a new `applyAsync()` method. The `TransformId` union splits into `SyncTransformId` + `HashTransformId` so each method's signature is type-safe. `TransformPickerComponent` gains an `isAsync()` type-predicate dispatch: hash IDs go to `applyAsync`, all others stay sync. No new dependencies.

**Tech Stack:** Angular 21 (signals, standalone components, `afterNextRender`), Vitest, ngx-translate, Web Crypto API (`crypto.subtle`), `TextEncoder`/`TextDecoder`.

---

## File Structure

**New frontend files:**
- `src/app/core/utils/hex.ts` — `bytesToHex(buffer: ArrayBuffer): string` helper used by all three hash transforms.
- `src/app/core/utils/hex.spec.ts` — unit tests for the hex helper.
- `src/app/core/utils/md5.ts` — pure-TypeScript MD5 implementation (~60 lines, no dependencies).
- `src/app/core/utils/md5.spec.ts` — MD5 test vectors (empty string, "abc", standard "fox" string, non-ASCII).

**Modified frontend files:**
- `src/app/core/services/transform.service.ts` — split `TransformId` into `SyncTransformId` + `HashTransformId`; expand `options` list from 8 → 16; add 5 sync cases; add `applyAsync()`; add `isAsync()` predicate.
- `src/app/core/services/transform.service.spec.ts` — add tests for all 8 new transforms (sync via `apply`, async via `applyAsync`); update options-list assertion.
- `src/app/features/clipboard-list/transform-picker.component.ts` — make the private `apply()` method async and dispatch via `isAsync()`.
- `src/app/features/clipboard-list/transform-picker.component.spec.ts` — update the integration test to handle the new transforms; the `noErrorTransforms` filter expands to also exclude `'base64-decode'`.
- `src/app/i18n/translation.interface.ts` — add 9 new keys under `TRANSFORM` (8 labels + 1 new error key).
- `src/app/i18n/en.ts` — English translations for the 9 new keys.
- `src/app/i18n/de.ts` — German translations for the 9 new keys.

**No backend/Tauri changes required.**

---

## Ordering of options in the picker

New transforms are appended to existing groups for natural discovery. The final 16-entry order is:

```
strip-whitespace, uppercase, lowercase, title-case,
url-encode, url-decode, base64-encode, base64-decode,
json-format, strip-html,
remove-duplicate-lines, sort-lines-asc, slugify,
hash-md5, hash-sha1, hash-sha256
```

Each task below inserts its options entries at the right place; the final assertion in Task 9 locks this exact order.

---

## Task 1: Add `base64-encode` + `base64-decode` transforms

**Files:**
- Modify: `src/app/core/services/transform.service.ts`
- Modify: `src/app/core/services/transform.service.spec.ts`
- Modify: `src/app/i18n/translation.interface.ts`
- Modify: `src/app/i18n/en.ts`
- Modify: `src/app/i18n/de.ts`

- [ ] **Step 1: Write the failing tests**

In `src/app/core/services/transform.service.spec.ts`, replace the existing `'options list contains all 8 transforms'` test with the assertions below, and add four new tests for base64. The full block to add/replace (place after the existing `'strip-html removes all HTML tags'` test, and remove the old length-8 test):

```typescript
it('base64-encode encodes ASCII text', () => {
  expect(service.apply('base64-encode', 'foo')).toEqual({ ok: true, value: 'Zm9v' });
});
it('base64-encode handles non-ASCII (UTF-8)', () => {
  // 'héllo' as UTF-8 bytes: 68 c3 a9 6c 6c 6f → base64 "aMOpbGxv"
  expect(service.apply('base64-encode', 'héllo')).toEqual({ ok: true, value: 'aMOpbGxv' });
});
it('base64-decode decodes back to original UTF-8 string', () => {
  expect(service.apply('base64-decode', 'aMOpbGxv')).toEqual({ ok: true, value: 'héllo' });
});
it('base64-decode returns error on invalid base64', () => {
  const r = service.apply('base64-decode', '!!!not-base64!!!');
  expect(r.ok).toBe(false);
  if (!r.ok) expect(r.error).toBe('TRANSFORM.ERROR_BASE64_DECODE');
});
it('options list contains all expected IDs (current state)', () => {
  expect(service.options.map(o => o.id)).toEqual([
    'strip-whitespace', 'uppercase', 'lowercase', 'title-case',
    'url-encode', 'url-decode', 'base64-encode', 'base64-decode',
    'json-format', 'strip-html',
  ]);
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `pnpm test src/app/core/services/transform.service.spec.ts`
Expected: TypeScript error / FAIL — `'base64-encode'` not assignable to `TransformId`.

- [ ] **Step 3: Add the i18n interface keys**

In `src/app/i18n/translation.interface.ts`, inside the `TRANSFORM:` block (currently ends with `DUPLICATE_ERROR: string;`), add the two label keys plus the new error key. Insert before `HINT: string;`:

```typescript
    BASE64_ENCODE: string;
    BASE64_DECODE: string;
    ERROR_BASE64_DECODE: string;
```

- [ ] **Step 4: Add English strings**

In `src/app/i18n/en.ts`, inside the `TRANSFORM:` block, insert before the `HINT:` line:

```typescript
    BASE64_ENCODE: 'Base64 Encode',
    BASE64_DECODE: 'Base64 Decode',
    ERROR_BASE64_DECODE: 'Invalid Base64',
```

- [ ] **Step 5: Add German strings**

In `src/app/i18n/de.ts`, inside the `TRANSFORM:` block, insert before the `HINT:` line:

```typescript
    BASE64_ENCODE: 'Base64 kodieren',
    BASE64_DECODE: 'Base64 dekodieren',
    ERROR_BASE64_DECODE: 'Ungültiges Base64',
```

- [ ] **Step 6: Implement the transforms**

In `src/app/core/services/transform.service.ts`:

(a) Extend the `TransformId` union — add `'base64-encode'` and `'base64-decode'` after `'url-decode'`:

```typescript
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
  | 'strip-html';
```

(b) Insert two entries into `options` after the `url-decode` entry:

```typescript
    { id: 'base64-encode', labelKey: 'TRANSFORM.BASE64_ENCODE' },
    { id: 'base64-decode', labelKey: 'TRANSFORM.BASE64_DECODE' },
```

(c) Add two cases in the `apply()` switch (place them after `case 'url-decode':` and before `case 'json-format':`):

```typescript
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
```

Note: `atob` throws `DOMException` on invalid base64 characters, and `TextDecoder({ fatal: true })` throws on invalid UTF-8. Both are caught and surfaced as `ERROR_BASE64_DECODE`.

- [ ] **Step 7: Run tests to verify they pass**

Run: `pnpm test src/app/core/services/transform.service.spec.ts`
Expected: all tests PASS.

- [ ] **Step 8: Format**

Run: `pnpm exec prettier --write src/app/core/services/transform.service.ts src/app/core/services/transform.service.spec.ts src/app/i18n/translation.interface.ts src/app/i18n/en.ts src/app/i18n/de.ts`

- [ ] **Step 9: Commit**

```bash
git add src/app/core/services/transform.service.ts src/app/core/services/transform.service.spec.ts src/app/i18n/
git commit -m "feat(transforms): add base64 encode/decode transforms"
```

---

## Task 2: Add `remove-duplicate-lines` transform

**Files:**
- Modify: `src/app/core/services/transform.service.ts`
- Modify: `src/app/core/services/transform.service.spec.ts`
- Modify: `src/app/i18n/translation.interface.ts`
- Modify: `src/app/i18n/en.ts`
- Modify: `src/app/i18n/de.ts`

- [ ] **Step 1: Write the failing tests**

In `src/app/core/services/transform.service.spec.ts`, add these tests after the base64 tests, and update the options-IDs assertion:

```typescript
it('remove-duplicate-lines removes repeated lines and preserves first occurrence order', () => {
  expect(service.apply('remove-duplicate-lines', 'a\nb\na\nc\nb')).toEqual({
    ok: true,
    value: 'a\nb\nc',
  });
});
it('remove-duplicate-lines on input without duplicates is a no-op', () => {
  expect(service.apply('remove-duplicate-lines', 'a\nb\nc')).toEqual({
    ok: true,
    value: 'a\nb\nc',
  });
});
```

And update the options-IDs assertion test to:

```typescript
it('options list contains all expected IDs (current state)', () => {
  expect(service.options.map(o => o.id)).toEqual([
    'strip-whitespace', 'uppercase', 'lowercase', 'title-case',
    'url-encode', 'url-decode', 'base64-encode', 'base64-decode',
    'json-format', 'strip-html',
    'remove-duplicate-lines',
  ]);
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `pnpm test src/app/core/services/transform.service.spec.ts`
Expected: TypeScript / FAIL — unknown id `'remove-duplicate-lines'`.

- [ ] **Step 3: Add i18n keys**

`src/app/i18n/translation.interface.ts` — inside `TRANSFORM`, before `HINT`:
```typescript
    REMOVE_DUPLICATE_LINES: string;
```

`src/app/i18n/en.ts`:
```typescript
    REMOVE_DUPLICATE_LINES: 'Remove Duplicate Lines',
```

`src/app/i18n/de.ts`:
```typescript
    REMOVE_DUPLICATE_LINES: 'Duplikate entfernen',
```

- [ ] **Step 4: Implement the transform**

In `src/app/core/services/transform.service.ts`:

(a) Append to the union:
```typescript
  | 'remove-duplicate-lines'
```
Place it after `'strip-html'`.

(b) Append to `options` (after the `strip-html` entry):
```typescript
    { id: 'remove-duplicate-lines', labelKey: 'TRANSFORM.REMOVE_DUPLICATE_LINES' },
```

(c) Add the case at the end of the switch (after `case 'strip-html':`):
```typescript
      case 'remove-duplicate-lines':
        return {
          ok: true,
          value: content.split('\n').filter((line, i, arr) => arr.indexOf(line) === i).join('\n'),
        };
```

- [ ] **Step 5: Run tests to verify pass**

Run: `pnpm test src/app/core/services/transform.service.spec.ts`
Expected: PASS.

- [ ] **Step 6: Format**

Run: `pnpm exec prettier --write src/app/core/services/transform.service.ts src/app/core/services/transform.service.spec.ts src/app/i18n/translation.interface.ts src/app/i18n/en.ts src/app/i18n/de.ts`

- [ ] **Step 7: Commit**

```bash
git add src/app/core/services/transform.service.ts src/app/core/services/transform.service.spec.ts src/app/i18n/
git commit -m "feat(transforms): add remove-duplicate-lines transform"
```

---

## Task 3: Add `sort-lines-asc` transform

**Files:**
- Modify: `src/app/core/services/transform.service.ts`
- Modify: `src/app/core/services/transform.service.spec.ts`
- Modify: `src/app/i18n/translation.interface.ts`
- Modify: `src/app/i18n/en.ts`
- Modify: `src/app/i18n/de.ts`

- [ ] **Step 1: Write the failing tests**

In `src/app/core/services/transform.service.spec.ts`, add after the dedup tests:

```typescript
it('sort-lines-asc sorts lines alphabetically (case-insensitive via localeCompare)', () => {
  expect(service.apply('sort-lines-asc', 'banana\napple\ncherry')).toEqual({
    ok: true,
    value: 'apple\nbanana\ncherry',
  });
});
it('sort-lines-asc handles single-line input as a no-op', () => {
  expect(service.apply('sort-lines-asc', 'only')).toEqual({ ok: true, value: 'only' });
});
```

Update the options-IDs assertion to add `'sort-lines-asc'` at the end of the array.

- [ ] **Step 2: Run tests to verify failure**

Run: `pnpm test src/app/core/services/transform.service.spec.ts`
Expected: FAIL — unknown id.

- [ ] **Step 3: Add i18n keys**

Interface: `SORT_LINES_ASC: string;`
en.ts: `SORT_LINES_ASC: 'Sort Lines (A→Z)',`
de.ts: `SORT_LINES_ASC: 'Zeilen sortieren (A→Z)',`

Place each in the same logical position (after `REMOVE_DUPLICATE_LINES`, before `HINT`).

- [ ] **Step 4: Implement the transform**

(a) Add `| 'sort-lines-asc'` to the `TransformId` union (after `'remove-duplicate-lines'`).
(b) Add `{ id: 'sort-lines-asc', labelKey: 'TRANSFORM.SORT_LINES_ASC' },` to options (after the dedup entry).
(c) Add the case:
```typescript
      case 'sort-lines-asc':
        return {
          ok: true,
          value: content.split('\n').sort((a, b) => a.localeCompare(b)).join('\n'),
        };
```

- [ ] **Step 5: Run tests**

Run: `pnpm test src/app/core/services/transform.service.spec.ts`
Expected: PASS.

- [ ] **Step 6: Format**

Run: `pnpm exec prettier --write src/app/core/services/transform.service.ts src/app/core/services/transform.service.spec.ts src/app/i18n/translation.interface.ts src/app/i18n/en.ts src/app/i18n/de.ts`

- [ ] **Step 7: Commit**

```bash
git add src/app/core/services/transform.service.ts src/app/core/services/transform.service.spec.ts src/app/i18n/
git commit -m "feat(transforms): add sort-lines-asc transform"
```

---

## Task 4: Add `slugify` transform

**Files:**
- Modify: `src/app/core/services/transform.service.ts`
- Modify: `src/app/core/services/transform.service.spec.ts`
- Modify: `src/app/i18n/translation.interface.ts`
- Modify: `src/app/i18n/en.ts`
- Modify: `src/app/i18n/de.ts`

- [ ] **Step 1: Write the failing tests**

In `src/app/core/services/transform.service.spec.ts`, add:

```typescript
it('slugify lowercases and joins words with hyphens', () => {
  expect(service.apply('slugify', 'Hello World')).toEqual({ ok: true, value: 'hello-world' });
});
it('slugify strips diacritics', () => {
  expect(service.apply('slugify', 'Café Déjà Vu')).toEqual({ ok: true, value: 'cafe-deja-vu' });
});
it('slugify collapses non-alphanumeric runs into a single hyphen and trims edges', () => {
  expect(service.apply('slugify', '  Foo!! @#  Bar  ')).toEqual({ ok: true, value: 'foo-bar' });
});
it('slugify produces empty string when no alphanumerics remain', () => {
  expect(service.apply('slugify', '!!! ???')).toEqual({ ok: true, value: '' });
});
```

Update the options-IDs assertion to add `'slugify'` at the end.

- [ ] **Step 2: Run tests to verify failure**

Run: `pnpm test src/app/core/services/transform.service.spec.ts`
Expected: FAIL — unknown id.

- [ ] **Step 3: Add i18n keys**

Interface: `SLUGIFY: string;`
en.ts: `SLUGIFY: 'Slugify',`
de.ts: `SLUGIFY: 'Slug erzeugen',`

Place after `SORT_LINES_ASC`.

- [ ] **Step 4: Implement the transform**

(a) Add `| 'slugify'` to the `TransformId` union.
(b) Add `{ id: 'slugify', labelKey: 'TRANSFORM.SLUGIFY' },` to options.
(c) Add the case:
```typescript
      case 'slugify':
        return {
          ok: true,
          value: content
            .normalize('NFD')
            .replace(/[̀-ͯ]/g, '')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, ''),
        };
```

- [ ] **Step 5: Run tests**

Run: `pnpm test src/app/core/services/transform.service.spec.ts`
Expected: PASS.

- [ ] **Step 6: Format**

Run: `pnpm exec prettier --write src/app/core/services/transform.service.ts src/app/core/services/transform.service.spec.ts src/app/i18n/translation.interface.ts src/app/i18n/en.ts src/app/i18n/de.ts`

- [ ] **Step 7: Commit**

```bash
git add src/app/core/services/transform.service.ts src/app/core/services/transform.service.spec.ts src/app/i18n/
git commit -m "feat(transforms): add slugify transform"
```

---

## Task 5: Add `bytesToHex` utility

**Files:**
- Create: `src/app/core/utils/hex.ts`
- Create: `src/app/core/utils/hex.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `src/app/core/utils/hex.spec.ts`:

```typescript
import { bytesToHex } from './hex';

describe('bytesToHex', () => {
  it('encodes an empty buffer as empty string', () => {
    expect(bytesToHex(new ArrayBuffer(0))).toBe('');
  });
  it('encodes single-byte values with leading zeros', () => {
    const buf = new Uint8Array([0x00, 0x0f, 0xff]).buffer;
    expect(bytesToHex(buf)).toBe('000fff');
  });
  it('encodes multi-byte sequences in order', () => {
    const buf = new Uint8Array([0xde, 0xad, 0xbe, 0xef]).buffer;
    expect(bytesToHex(buf)).toBe('deadbeef');
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `pnpm test src/app/core/utils/hex.spec.ts`
Expected: FAIL — cannot find module `./hex`.

- [ ] **Step 3: Implement**

Create `src/app/core/utils/hex.ts`:

```typescript
export function bytesToHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let hex = '';
  for (const b of bytes) hex += b.toString(16).padStart(2, '0');
  return hex;
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm test src/app/core/utils/hex.spec.ts`
Expected: PASS.

- [ ] **Step 5: Format**

Run: `pnpm exec prettier --write src/app/core/utils/hex.ts src/app/core/utils/hex.spec.ts`

- [ ] **Step 6: Commit**

```bash
git add src/app/core/utils/hex.ts src/app/core/utils/hex.spec.ts
git commit -m "feat(utils): add bytesToHex helper for hex encoding"
```

---

## Task 6: Add pure-TS MD5 implementation

**Files:**
- Create: `src/app/core/utils/md5.ts`
- Create: `src/app/core/utils/md5.spec.ts`

`crypto.subtle` does not support MD5. This task adds a self-contained implementation of RFC 1321 MD5.

- [ ] **Step 1: Write the failing tests**

Create `src/app/core/utils/md5.spec.ts`:

```typescript
import { md5 } from './md5';

describe('md5', () => {
  // Standard RFC 1321 test vectors.
  it('hashes the empty string', () => {
    expect(md5('')).toBe('d41d8cd98f00b204e9800998ecf8427e');
  });
  it('hashes "a"', () => {
    expect(md5('a')).toBe('0cc175b9c0f1b6a831c399e269772661');
  });
  it('hashes "abc"', () => {
    expect(md5('abc')).toBe('900150983cd24fb0d6963f7d28e17f72');
  });
  it('hashes "message digest"', () => {
    expect(md5('message digest')).toBe('f96b697d7cb7938d525a2f31aaf161d0');
  });
  it('hashes the standard pangram', () => {
    expect(md5('The quick brown fox jumps over the lazy dog')).toBe('9e107d9d372bb6826bd81d3542a419d6');
  });
  it('hashes non-ASCII (UTF-8 bytes)', () => {
    // 'héllo' is bytes 68 c3 a9 6c 6c 6f
    expect(md5('héllo')).toBe('0c45b16dc54e0cb7d50dbb88fd180cd9');
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `pnpm test src/app/core/utils/md5.spec.ts`
Expected: FAIL — cannot find module `./md5`.

- [ ] **Step 3: Implement**

Create `src/app/core/utils/md5.ts`:

```typescript
// RFC 1321 MD5. Encodes UTF-8 and returns lowercase hex digest.
// Constants K = floor(2^32 * |sin(i + 1)|) for i = 0..63 (standard).
const K = new Uint32Array([
  0xd76aa478, 0xe8c7b756, 0x242070db, 0xc1bdceee, 0xf57c0faf, 0x4787c62a, 0xa8304613, 0xfd469501,
  0x698098d8, 0x8b44f7af, 0xffff5bb1, 0x895cd7be, 0x6b901122, 0xfd987193, 0xa679438e, 0x49b40821,
  0xf61e2562, 0xc040b340, 0x265e5a51, 0xe9b6c7aa, 0xd62f105d, 0x02441453, 0xd8a1e681, 0xe7d3fbc8,
  0x21e1cde6, 0xc33707d6, 0xf4d50d87, 0x455a14ed, 0xa9e3e905, 0xfcefa3f8, 0x676f02d9, 0x8d2a4c8a,
  0xfffa3942, 0x8771f681, 0x6d9d6122, 0xfde5380c, 0xa4beea44, 0x4bdecfa9, 0xf6bb4b60, 0xbebfbc70,
  0x289b7ec6, 0xeaa127fa, 0xd4ef3085, 0x04881d05, 0xd9d4d039, 0xe6db99e5, 0x1fa27cf8, 0xc4ac5665,
  0xf4292244, 0x432aff97, 0xab9423a7, 0xfc93a039, 0x655b59c3, 0x8f0ccc92, 0xffeff47d, 0x85845dd1,
  0x6fa87e4f, 0xfe2ce6e0, 0xa3014314, 0x4e0811a1, 0xf7537e82, 0xbd3af235, 0x2ad7d2bb, 0xeb86d391,
]);

const S = [
  7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
  5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
  4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
  6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
];

function rotl(x: number, n: number): number {
  return ((x << n) | (x >>> (32 - n))) >>> 0;
}

export function md5(input: string): string {
  const bytes = new TextEncoder().encode(input);
  const length = bytes.length;

  // Pad: append 0x80, then zeros to length ≡ 56 (mod 64), then 64-bit little-endian bit length.
  const paddedLength = (((length + 8) >>> 6) + 1) * 64;
  const padded = new Uint8Array(paddedLength);
  padded.set(bytes);
  padded[length] = 0x80;
  const view = new DataView(padded.buffer);
  const bitLength = length * 8;
  view.setUint32(paddedLength - 8, bitLength >>> 0, true);
  view.setUint32(paddedLength - 4, Math.floor(bitLength / 0x100000000) >>> 0, true);

  let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;

  for (let chunk = 0; chunk < paddedLength; chunk += 64) {
    const M = new Uint32Array(16);
    for (let i = 0; i < 16; i++) M[i] = view.getUint32(chunk + i * 4, true);

    let A = a0, B = b0, C = c0, D = d0;
    for (let i = 0; i < 64; i++) {
      let F: number, g: number;
      if (i < 16) {
        F = (B & C) | (~B & D);
        g = i;
      } else if (i < 32) {
        F = (D & B) | (~D & C);
        g = (5 * i + 1) % 16;
      } else if (i < 48) {
        F = B ^ C ^ D;
        g = (3 * i + 5) % 16;
      } else {
        F = C ^ (B | ~D);
        g = (7 * i) % 16;
      }
      F = (F + A + K[i] + M[g]) >>> 0;
      A = D;
      D = C;
      C = B;
      B = (B + rotl(F, S[i])) >>> 0;
    }
    a0 = (a0 + A) >>> 0;
    b0 = (b0 + B) >>> 0;
    c0 = (c0 + C) >>> 0;
    d0 = (d0 + D) >>> 0;
  }

  const out = new Uint8Array(16);
  const outView = new DataView(out.buffer);
  outView.setUint32(0, a0, true);
  outView.setUint32(4, b0, true);
  outView.setUint32(8, c0, true);
  outView.setUint32(12, d0, true);
  let hex = '';
  for (const b of out) hex += b.toString(16).padStart(2, '0');
  return hex;
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm test src/app/core/utils/md5.spec.ts`
Expected: PASS (all six test vectors match).

If any vector fails, the algorithm is broken — do not "fix" the test vectors. They are standard. Compare against RFC 1321 Appendix A.5 and debug the implementation.

- [ ] **Step 5: Format**

Run: `pnpm exec prettier --write src/app/core/utils/md5.ts src/app/core/utils/md5.spec.ts`

- [ ] **Step 6: Commit**

```bash
git add src/app/core/utils/md5.ts src/app/core/utils/md5.spec.ts
git commit -m "feat(utils): add pure-TS MD5 implementation"
```

---

## Task 7: Split union into Sync/Hash, add `applyAsync` + `isAsync` + `hash-md5`

**Files:**
- Modify: `src/app/core/services/transform.service.ts`
- Modify: `src/app/core/services/transform.service.spec.ts`
- Modify: `src/app/i18n/translation.interface.ts`
- Modify: `src/app/i18n/en.ts`
- Modify: `src/app/i18n/de.ts`

This task introduces the async surface area: the `TransformId` union splits, a new `applyAsync()` method handles hash IDs, and `isAsync()` lets callers dispatch.

- [ ] **Step 1: Write the failing tests**

In `src/app/core/services/transform.service.spec.ts`, add:

```typescript
it('isAsync returns true for hash IDs and false for sync IDs', () => {
  expect(service.isAsync('hash-md5')).toBe(true);
  expect(service.isAsync('hash-sha1')).toBe(true);
  expect(service.isAsync('hash-sha256')).toBe(true);
  expect(service.isAsync('uppercase')).toBe(false);
  expect(service.isAsync('base64-encode')).toBe(false);
});
it('applyAsync("hash-md5", "abc") returns the MD5 hex digest', async () => {
  await expect(service.applyAsync('hash-md5', 'abc')).resolves.toEqual({
    ok: true,
    value: '900150983cd24fb0d6963f7d28e17f72',
  });
});
it('applyAsync("hash-md5", "") returns the empty-string MD5', async () => {
  await expect(service.applyAsync('hash-md5', '')).resolves.toEqual({
    ok: true,
    value: 'd41d8cd98f00b204e9800998ecf8427e',
  });
});
```

Update the options-IDs assertion to add `'hash-md5'` at the end.

- [ ] **Step 2: Run tests to verify failure**

Run: `pnpm test src/app/core/services/transform.service.spec.ts`
Expected: FAIL — `applyAsync` / `isAsync` not defined; `'hash-md5'` not in union.

- [ ] **Step 3: Add i18n keys**

Interface: `HASH_MD5: string;`
en.ts: `HASH_MD5: 'Hash MD5',`
de.ts: `HASH_MD5: 'MD5-Hash',`

Place after `SLUGIFY`.

- [ ] **Step 4: Restructure types and add `applyAsync` + `isAsync` + MD5 case**

Edit `src/app/core/services/transform.service.ts`:

(a) Replace the existing `TransformId` type with the split:

```typescript
export type SyncTransformId =
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
  | 'sort-lines-asc'
  | 'slugify';

export type HashTransformId = 'hash-md5' | 'hash-sha1' | 'hash-sha256';

export type TransformId = SyncTransformId | HashTransformId;
```

(b) Tighten the `apply()` signature so the switch's exhaustiveness check covers only sync IDs:

```typescript
  apply(id: SyncTransformId, content: string): TransformResult {
```

(c) Add the import for `md5` near the top of the file:

```typescript
import { md5 } from '../utils/md5';
```

(d) Append the `hash-md5` option to `options`:

```typescript
    { id: 'hash-md5', labelKey: 'TRANSFORM.HASH_MD5' },
```

(e) Add the `isAsync` type-predicate and `applyAsync` method to the class (place after `apply()`):

```typescript
  private readonly asyncIds: ReadonlySet<HashTransformId> = new Set([
    'hash-md5',
    'hash-sha1',
    'hash-sha256',
  ]);

  isAsync(id: TransformId): id is HashTransformId {
    return this.asyncIds.has(id as HashTransformId);
  }

  async applyAsync(id: HashTransformId, content: string): Promise<TransformResult> {
    switch (id) {
      case 'hash-md5':
        return { ok: true, value: md5(content) };
      case 'hash-sha1':
      case 'hash-sha256':
        // Implemented in subsequent tasks.
        throw new Error(`applyAsync: ${id} not yet implemented`);
    }
  }
```

The `throw` for `hash-sha1`/`hash-sha256` is removed in Tasks 8 and 9 — keeping it explicit means TypeScript's exhaustive switch is satisfied right now without lying about the result.

- [ ] **Step 5: Run tests**

Run: `pnpm test src/app/core/services/transform.service.spec.ts`
Expected: PASS for new tests; existing tests unaffected.

- [ ] **Step 6: Format**

Run: `pnpm exec prettier --write src/app/core/services/transform.service.ts src/app/core/services/transform.service.spec.ts src/app/i18n/translation.interface.ts src/app/i18n/en.ts src/app/i18n/de.ts`

- [ ] **Step 7: Commit**

```bash
git add src/app/core/services/transform.service.ts src/app/core/services/transform.service.spec.ts src/app/i18n/
git commit -m "feat(transforms): add applyAsync + hash-md5 transform"
```

---

## Task 8: Add `hash-sha1` transform

**Files:**
- Modify: `src/app/core/services/transform.service.ts`
- Modify: `src/app/core/services/transform.service.spec.ts`
- Modify: `src/app/i18n/translation.interface.ts`
- Modify: `src/app/i18n/en.ts`
- Modify: `src/app/i18n/de.ts`

- [ ] **Step 1: Write the failing tests**

In `src/app/core/services/transform.service.spec.ts`, add:

```typescript
it('applyAsync("hash-sha1", "abc") returns the SHA-1 hex digest', async () => {
  await expect(service.applyAsync('hash-sha1', 'abc')).resolves.toEqual({
    ok: true,
    value: 'a9993e364706816aba3e25717850c26c9cd0d89d',
  });
});
it('applyAsync("hash-sha1", "") returns the empty-string SHA-1', async () => {
  await expect(service.applyAsync('hash-sha1', '')).resolves.toEqual({
    ok: true,
    value: 'da39a3ee5e6b4b0d3255bfef95601890afd80709',
  });
});
```

Update the options-IDs assertion to add `'hash-sha1'` at the end.

- [ ] **Step 2: Run tests to verify failure**

Run: `pnpm test src/app/core/services/transform.service.spec.ts`
Expected: FAIL — `applyAsync('hash-sha1', ...)` throws "not yet implemented".

- [ ] **Step 3: Add i18n keys**

Interface: `HASH_SHA1: string;`
en.ts: `HASH_SHA1: 'Hash SHA-1',`
de.ts: `HASH_SHA1: 'SHA-1-Hash',`

Place after `HASH_MD5`.

- [ ] **Step 4: Implement using `crypto.subtle`**

In `src/app/core/services/transform.service.ts`:

(a) Import `bytesToHex`:
```typescript
import { bytesToHex } from '../utils/hex';
```

(b) Add `{ id: 'hash-sha1', labelKey: 'TRANSFORM.HASH_SHA1' },` to options (after `hash-md5`).

(c) Replace the SHA placeholder in `applyAsync` — change the body of the `case 'hash-sha1':` branch to actually compute the digest:

```typescript
      case 'hash-sha1': {
        const buf = new TextEncoder().encode(content);
        const digest = await crypto.subtle.digest('SHA-1', buf);
        return { ok: true, value: bytesToHex(digest) };
      }
```

(Leave the `hash-sha256` branch's `throw` in place; it lands in Task 9.)

- [ ] **Step 5: Run tests**

Run: `pnpm test src/app/core/services/transform.service.spec.ts`
Expected: PASS.

- [ ] **Step 6: Format**

Run: `pnpm exec prettier --write src/app/core/services/transform.service.ts src/app/core/services/transform.service.spec.ts src/app/i18n/translation.interface.ts src/app/i18n/en.ts src/app/i18n/de.ts`

- [ ] **Step 7: Commit**

```bash
git add src/app/core/services/transform.service.ts src/app/core/services/transform.service.spec.ts src/app/i18n/
git commit -m "feat(transforms): add hash-sha1 transform"
```

---

## Task 9: Add `hash-sha256` transform

**Files:**
- Modify: `src/app/core/services/transform.service.ts`
- Modify: `src/app/core/services/transform.service.spec.ts`
- Modify: `src/app/i18n/translation.interface.ts`
- Modify: `src/app/i18n/en.ts`
- Modify: `src/app/i18n/de.ts`

- [ ] **Step 1: Write the failing tests**

In `src/app/core/services/transform.service.spec.ts`, add:

```typescript
it('applyAsync("hash-sha256", "abc") returns the SHA-256 hex digest', async () => {
  await expect(service.applyAsync('hash-sha256', 'abc')).resolves.toEqual({
    ok: true,
    value: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
  });
});
it('applyAsync("hash-sha256", "") returns the empty-string SHA-256', async () => {
  await expect(service.applyAsync('hash-sha256', '')).resolves.toEqual({
    ok: true,
    value: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
  });
});
```

Replace the options-IDs assertion with the final 16-entry list:

```typescript
it('options list contains all 16 transform IDs in expected order', () => {
  expect(service.options.map(o => o.id)).toEqual([
    'strip-whitespace', 'uppercase', 'lowercase', 'title-case',
    'url-encode', 'url-decode', 'base64-encode', 'base64-decode',
    'json-format', 'strip-html',
    'remove-duplicate-lines', 'sort-lines-asc', 'slugify',
    'hash-md5', 'hash-sha1', 'hash-sha256',
  ]);
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `pnpm test src/app/core/services/transform.service.spec.ts`
Expected: FAIL — `applyAsync('hash-sha256', ...)` throws "not yet implemented".

- [ ] **Step 3: Add i18n keys**

Interface: `HASH_SHA256: string;`
en.ts: `HASH_SHA256: 'Hash SHA-256',`
de.ts: `HASH_SHA256: 'SHA-256-Hash',`

Place after `HASH_SHA1`.

- [ ] **Step 4: Implement**

(a) Add `{ id: 'hash-sha256', labelKey: 'TRANSFORM.HASH_SHA256' },` to options (last entry).

(b) Replace the `case 'hash-sha256':` branch in `applyAsync`:

```typescript
      case 'hash-sha256': {
        const buf = new TextEncoder().encode(content);
        const digest = await crypto.subtle.digest('SHA-256', buf);
        return { ok: true, value: bytesToHex(digest) };
      }
```

After this change, `applyAsync` has no `throw` left — the switch is fully implemented.

- [ ] **Step 5: Run tests**

Run: `pnpm test src/app/core/services/transform.service.spec.ts`
Expected: PASS.

- [ ] **Step 6: Format**

Run: `pnpm exec prettier --write src/app/core/services/transform.service.ts src/app/core/services/transform.service.spec.ts src/app/i18n/translation.interface.ts src/app/i18n/en.ts src/app/i18n/de.ts`

- [ ] **Step 7: Commit**

```bash
git add src/app/core/services/transform.service.ts src/app/core/services/transform.service.spec.ts src/app/i18n/
git commit -m "feat(transforms): add hash-sha256 transform"
```

---

## Task 10: Wire `TransformPickerComponent` async dispatch

**Files:**
- Modify: `src/app/features/clipboard-list/transform-picker.component.ts`
- Modify: `src/app/features/clipboard-list/transform-picker.component.spec.ts`

The picker's private `apply()` currently calls only the sync `TransformService.apply()`. It now needs to dispatch via `isAsync()`.

- [ ] **Step 1: Update the existing integration test**

In `src/app/features/clipboard-list/transform-picker.component.spec.ts`, the current test filters options by `id !== 'url-decode' && id !== 'json-format'` and asserts they all succeed synchronously. The list of "safe sync" transforms has grown, and three IDs are now async. Replace the existing `'apply returns ok for all 8 transform types on a sample string'` test with:

```typescript
it('apply returns ok for all safe synchronous transforms on a sample string', () => {
  const sample = 'hello world';
  const safeSync = service.options.filter(
    o =>
      o.id !== 'url-decode' &&
      o.id !== 'json-format' &&
      o.id !== 'base64-decode' &&
      !service.isAsync(o.id),
  );
  for (const opt of safeSync) {
    const result = service.apply(opt.id as Exclude<typeof opt.id, 'hash-md5' | 'hash-sha1' | 'hash-sha256'>, sample);
    expect(result.ok).toBe(true);
  }
});

it('applyAsync returns ok for all hash transforms on a sample string', async () => {
  const sample = 'hello world';
  const hashes = service.options.filter(o => service.isAsync(o.id));
  for (const opt of hashes) {
    if (!service.isAsync(opt.id)) continue;
    const result = await service.applyAsync(opt.id, sample);
    expect(result.ok).toBe(true);
  }
});

it('base64-decode returns error on garbage input', () => {
  const result = service.apply('base64-decode', '!!!not-base64!!!');
  expect(result).toMatchObject({ ok: false, error: 'TRANSFORM.ERROR_BASE64_DECODE' });
});
```

Also adjust the import at the top of the spec to bring in the `SyncTransformId` type if needed for type-narrowing — but the simpler form above sidesteps it via an inline `Exclude`.

- [ ] **Step 2: Run tests to verify failure**

Run: `pnpm test src/app/features/clipboard-list/transform-picker.component.spec.ts`
Expected: FAIL — `service.isAsync` is referenced before being callable on the component (it exists on the service since Task 7, so this should actually PASS at the service level). The test that should fail is the new `base64-decode` error test only if Task 1 wasn't done, but it was — so this step is really verifying the *picker dispatch* works once we change it. If everything passes here, that's fine — proceed.

- [ ] **Step 3: Update the picker to dispatch async vs sync**

Edit `src/app/features/clipboard-list/transform-picker.component.ts`:

(a) Change the private `apply()` method to `async`. Replace the current method body:

```typescript
  private async apply(): Promise<void> {
    const opt = this.transformService.options[this.cursor()];
    const result = this.transformService.isAsync(opt.id)
      ? await this.transformService.applyAsync(opt.id, this.content())
      : this.transformService.apply(opt.id, this.content());
    if (!result.ok) {
      this.errorKey.set(result.error);
      return;
    }
    this.errorKey.set(null);
    this.applied.emit({ transformedContent: result.value });
  }
```

The existing `onKeyDown` handler calls `this.apply();` and `confirm()` calls `this.apply();` — both are fine as fire-and-forget invocations of an async function. No `await` needed there.

- [ ] **Step 4: Run all tests**

Run: `pnpm test`
Expected: every existing and new test passes.

- [ ] **Step 5: Format**

Run: `pnpm exec prettier --write src/app/features/clipboard-list/transform-picker.component.ts src/app/features/clipboard-list/transform-picker.component.spec.ts`

- [ ] **Step 6: Commit**

```bash
git add src/app/features/clipboard-list/transform-picker.component.ts src/app/features/clipboard-list/transform-picker.component.spec.ts
git commit -m "feat(transform-picker): dispatch hash transforms via applyAsync"
```

---

## Task 11: Build & manual smoke test

**Files:** none

- [ ] **Step 1: Run the full test suite**

Run: `pnpm test`
Expected: all tests pass; no skipped tests.

- [ ] **Step 2: Type-check via build**

Run: `pnpm build`
Expected: build succeeds with no TypeScript errors.

- [ ] **Step 3: Manual smoke test**

Start the dev environment as the user normally does (Tauri dev). Copy a piece of text into the clipboard, open the app, select the entry, press Shift+Enter to open the transform picker. Verify:
  - Picker now shows 16 options in the order locked by Task 9's assertion.
  - `Base64 Encode` round-trips with `Base64 Decode` for ASCII and non-ASCII (e.g. "héllo").
  - `Hash MD5`, `Hash SHA-1`, `Hash SHA-256` each output a hex digest of the expected length (32, 40, 64 chars).
  - `Remove Duplicate Lines` on `a\nb\na` yields `a\nb`.
  - `Sort Lines (A→Z)` on `banana\napple\ncherry` yields `apple\nbanana\ncherry`.
  - `Slugify` on `Café Déjà Vu` yields `cafe-deja-vu`.
  - Invalid base64 input shows the `Invalid Base64` error inline.
  - German UI shows the German labels (switch via in-app language toggle if available).

If any check fails, fix it in a follow-up commit before declaring the feature done.

- [ ] **Step 4: Final commit (only if any formatting/lint follow-up was needed)**

If everything is green and clean, no extra commit is required.

---

## Out of Scope (per spec)

- Sort lines descending (`sort-lines-desc`) — deferred.
- SHA-512 or other hash algorithms — deferred.
- Regex find/replace — separate backlog item.
- Custom user-defined transforms — out of scope.

---

## Self-Review Notes

- **Spec coverage:** Each of the 8 transforms in the spec table maps to a dedicated task (Tasks 1–4 sync, Tasks 7–9 hash). Async handling chooses Option A per the spec (`apply` sync, `applyAsync` for hashes, dispatch in picker — Task 10). i18n changes are integrated into every task as required (`TRANSFORM.*` keys + `TRANSFORM.ERROR_BASE64_DECODE`).
- **Type consistency:** `SyncTransformId`, `HashTransformId`, `TransformId`, `isAsync()`, `applyAsync()`, `apply()` are introduced in Task 7 and used consistently in Tasks 8–10.
- **No placeholders:** Every code step shows actual code. The intentional `throw new Error('not yet implemented')` in Task 7's `applyAsync` exists only to satisfy TypeScript's exhaustiveness check between Task 7 and Task 9; it is replaced in Tasks 8 and 9 before any user-facing release.
- **Frequent commits:** One commit per transform / per logical unit (10 commits across the 11 tasks).
