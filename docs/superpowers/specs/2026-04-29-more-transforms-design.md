# More Text Transforms — Design Spec

**Date:** 2026-04-29

---

## Overview

Extend the existing `TransformService` with eight new developer-focused transforms. All additions follow the same pattern as the current eight transforms: a `TransformId` string literal, a label i18n key, and a case branch in `TransformService.apply()`.

---

## New Transforms

| ID | Label | Description |
|---|---|---|
| `base64-encode` | Base64 Encode | Encode text to Base64 |
| `base64-decode` | Base64 Decode | Decode Base64 back to text |
| `hash-md5` | Hash MD5 | Output MD5 hex digest of input |
| `hash-sha1` | Hash SHA-1 | Output SHA-1 hex digest of input |
| `hash-sha256` | Hash SHA-256 | Output SHA-256 hex digest of input |
| `remove-duplicate-lines` | Remove Duplicate Lines | Remove repeated lines, preserve order of first occurrence |
| `sort-lines-asc` | Sort Lines (A→Z) | Sort lines alphabetically ascending |
| `slugify` | Slugify | Convert text to URL-friendly slug (e.g. "Hello World" → "hello-world") |

Total transforms after: **16**.

---

## Implementation Details

### Base64 encode / decode
Use `btoa` / `atob` with a `TextEncoder`/`TextDecoder` wrapper to handle non-ASCII characters correctly. On decode error, return `{ ok: false, error: 'TRANSFORM.ERROR_BASE64_DECODE' }`.

### Hash (MD5, SHA-1, SHA-256)
- **SHA-1 and SHA-256**: use `crypto.subtle.digest()` (available in Tauri's WebView). Because `subtle.digest` is async, `TransformService.apply()` needs to become async for hash cases — or hash transforms are handled via a separate `applyAsync()` method.
- **MD5**: `crypto.subtle` does not support MD5. Add a small pure-TypeScript MD5 implementation (no external dependency — a ~50-line pure function is sufficient and avoids a package just for one algorithm).
- Hash transforms are **one-way**: they always succeed and return the hex digest.

### Remove duplicate lines
```ts
content.split('\n').filter((line, i, arr) => arr.indexOf(line) === i).join('\n')
```

### Sort lines ascending
```ts
content.split('\n').sort((a, b) => a.localeCompare(b)).join('\n')
```

### Slugify
Lowercase → replace diacritics (normalize NFD, strip combining chars) → replace non-alphanumeric runs with `-` → trim leading/trailing `-`.
```ts
content
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
```

---

## Async Handling

`crypto.subtle.digest` is async. Two options:

**Option A (recommended):** Keep `apply()` synchronous for all existing and new synchronous transforms. Add `applyAsync(id, content): Promise<TransformResult>` only for the three hash transforms. The `TransformPickerComponent` already handles the paste action; it calls `applyAsync` for hash IDs and `apply` for all others.

**Option B:** Make the entire `apply()` return `Promise<TransformResult>`. Simple but forces all call sites to `await` even for trivially synchronous transforms.

→ **Option A** is preferred: no impact on existing transforms, no change to call sites except the transform picker.

---

## Components Affected

| Layer | Change |
|---|---|
| `TransformService` | Add 8 new `TransformId` literals; add sync cases for base64, lines, slugify; add `applyAsync()` for hash-md5/sha1/sha256 |
| `TransformPickerComponent` | Call `applyAsync()` for hash transforms, `apply()` for all others |
| `i18n` (`en.ts`, `de.ts`) | Add `TRANSFORM.*` keys for each new transform and `TRANSFORM.ERROR_BASE64_DECODE` |

---

## Out of Scope

- Sort lines descending (can be added later as `sort-lines-desc`)
- SHA-512 or other hash algorithms
- Regex find/replace (separate backlog item)
- Custom user-defined transforms
