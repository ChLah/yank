---
# Source App Tracking — Design Spec

**Date:** 2026-04-27
**Status:** Approved

## Overview

YANK records which application was in focus when a clipboard entry was copied. The process name is displayed as a small, always-visible secondary label on each entry card, giving users context for why they copied something.

## Data

### SQLite

Add a nullable column to `entries`:

```sql
ALTER TABLE entries ADD COLUMN source_app TEXT;
```

Handled via the existing migration pattern in `run_migrations`. Existing rows get `NULL`, displayed as "Unknown" in the UI.

### Rust model

```rust
pub source_app: Option<String>,
```

### TypeScript model

```ts
sourceApp: string | null;
```

## Capture

The foreground process name is resolved at clipboard-change time (same WinAPI call introduced for capture exclusion — the two features share infrastructure). The raw process filename (e.g. `chrome.exe`) is stored as-is.

If resolution fails, `source_app` is stored as `NULL`.

YANK's own process is stored as `NULL` (not "yank.exe") since entries it creates (e.g. OCR results) have no meaningful source app.

## Display

On each `ClipboardEntryComponent` card, below the content preview and above the timestamp:

```
┌──────────────────────────────────────┐
│ Some copied text here...             │
│ chrome.exe          · 2 min ago      │
└──────────────────────────────────────┘
```

- Font: JetBrains Mono, size `xs`, muted foreground colour (same as the existing timestamp).
- Process name is shown **without any transformation** — displayed exactly as stored (e.g. `chrome.exe`, `Code.exe`, `WINWORD.EXE`). This keeps the display honest and avoids incorrect guesses on unusual process names.
- If `sourceApp` is `null`: the label is omitted entirely (no "Unknown" placeholder — keeps cards clean for pre-feature entries).
- The source app label and the timestamp sit on the same footer line, separated by ` · `.

## i18n

No new translation keys — the process name is a raw system value, not a translated string.

## Interaction with Exclusion Rules

The foreground process name is read once per clipboard event and passed to both the exclusion check and the source-app store. If the entry is excluded, it is never stored, so no source_app value is ever written for excluded apps.

## What is NOT in scope

- Window title capture (process name only).
- Application icon display.
- Filtering/grouping by source app.
- Editing or overriding the recorded source app.
