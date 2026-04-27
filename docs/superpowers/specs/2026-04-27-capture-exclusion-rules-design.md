---
# Capture Exclusion Rules — Design Spec

**Date:** 2026-04-27
**Status:** Approved

## Overview

Users can maintain a list of process names that YANK will never capture clipboard content from. Copying a password in KeePass or 1Password will silently skip storage. This is the #1 privacy feature users need before trusting a clipboard manager with their full copy history.

## Matching

- Match is against the **process name** of the foreground window at the moment the clipboard change is detected (e.g. `KeePass.exe`, `1Password.exe`).
- Case-insensitive, exact match (no wildcards in this version).
- YANK's own process (`yank.exe`) is always excluded implicitly — YANK-triggered clipboard writes (paste operations) must never be stored.

## Settings Model

Add one field to `AppSettings`:

```ts
excludedApps: string[]   // default: []
```

Rust:

```rust
pub excluded_apps: Vec<String>   // default: vec![]
```

Stored in SQLite as a JSON array in `value_text` for the key `excluded_apps`.

## Rust: Foreground Process Name

At clipboard-change time (inside `clipboard_monitor.rs`), before emitting the payload:

```rust
fn get_foreground_process_name() -> Option<String> {
    // GetForegroundWindow → GetWindowThreadProcessId → OpenProcess →
    // GetModuleFileNameExW → extract filename component
}
```

Returns `None` if any WinAPI call fails (treated as no exclusion). The result is threaded through to the store layer for the exclusion check and also used for source-app tracking (see Source App Tracking spec).

## Exclusion Check

In `lib.rs` where the clipboard payload is processed:

```rust
if let Some(proc) = &foreground_process {
    let excluded = settings.excluded_apps.iter()
        .any(|e| e.eq_ignore_ascii_case(proc));
    if excluded { return; }
}
```

## Settings UI

In the **Privacy** settings group (new group, below Clipboard):

```
Excluded apps

[ KeePass.exe          ✕ ]
[ 1Password.exe        ✕ ]
[ ________________________ ]  ← text input
[  + Add app  ]
```

- Text input accepts a process name. Pressing Enter or clicking **+ Add app** appends to the list.
- Each row has a remove (✕) button.
- Empty input is rejected silently.
- Duplicate entries are ignored (case-insensitive check before adding).
- The list is saved immediately on each add/remove (same autosave pattern as other settings).

## i18n Keys

```
SETTINGS.EXCLUDED_APPS_LABEL        = "Excluded apps"
SETTINGS.EXCLUDED_APPS_PLACEHOLDER  = "e.g. KeePass.exe"
SETTINGS.EXCLUDED_APPS_ADD          = "Add app"
```

## What is NOT in scope

- Wildcard or regex matching.
- Window-title-based exclusion.
- Temporary pause ("pause capture for 5 minutes").
