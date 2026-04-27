---
# Configurable Merge Separator — Design Spec

**Date:** 2026-04-27
**Status:** Approved

## Overview

The multi-select merge paste (see `2026-04-27-multi-select-merge-paste-design.md`) currently hard-codes `\n` as the separator between merged text entries. This spec extends it to allow users to choose the separator in Settings.

## Separator Options

| Display label | Value stored |
|---|---|
| Newline (default) | `\n` |
| Space | ` ` |
| Comma + space | `, ` |
| Tab | `\t` |
| Custom | any user-entered string |

"Custom" reveals a short text input. The stored value is always the raw string (e.g. `" | "` for pipe-separated). Empty custom string is allowed and treated as "no separator" (concatenate directly).

## Settings Model

Add one field to `AppSettings`:

```ts
mergeSeparator: string   // default: '\n'
```

Rust `AppSettings`:

```rust
pub merge_separator: String   // default: "\n"
```

## Settings UI

In the **Clipboard** settings group, below the history-limit controls:

```
Merge separator   [Newline ▾]
                  [ custom text input — shown only when "Custom" selected ]
```

The select uses the existing `HlmSelectComponent` pattern. The custom text input uses `HlmInputComponent`, max 20 characters.

## Merge Logic Change

In `ClipboardListComponent` (or wherever merge paste is implemented), replace:

```ts
const merged = selectedTexts.join('\n');
```

with:

```ts
const sep = this.settingsService.settings().mergeSeparator ?? '\n';
const merged = selectedTexts.join(sep);
```

## Migration

Existing installs have no `mergeSeparator` key in SQLite. The settings loader already falls back to `Default::default()` for missing keys, so `"\n"` is used automatically — no migration SQL needed.

## What is NOT in scope

- Per-merge override (hold a modifier key to pick a separator on the fly).
- Separator preview in the status bar.
