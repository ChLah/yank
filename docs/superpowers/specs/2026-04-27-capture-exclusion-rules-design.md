---
# Capture Exclusion Rules — Design Spec

**Date:** 2026-04-27
**Status:** Approved

## Overview

Users can maintain a list of process names that YANK will never capture clipboard content from. Copying a password in KeePass or 1Password will silently skip storage. This is the #1 privacy feature users need before trusting a clipboard manager with their full copy history.

## Matching

- Match is against the **process name** of the foreground window at the moment the clipboard change is detected (e.g. `KeePass.exe`, `1Password.exe`).
- Case-insensitive, exact match (no wildcards in this version).

## Data Model

### SQLite Table

```sql
CREATE TABLE IF NOT EXISTS excluded_apps (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    process_name TEXT    NOT NULL UNIQUE,
    created_at   INTEGER NOT NULL
);
```

`created_at` is a Unix timestamp in milliseconds, consistent with `entries.created_at`. The `UNIQUE` constraint enforces deduplication at the DB level. No entry in the `settings` table — excluded apps are fully independent of `AppSettings`.

### Rust Model

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExcludedApp {
    pub id: i64,
    pub process_name: String,
    pub created_at: i64,
}
```

`AppSettings` has **no** `excluded_apps` field.

### TypeScript Model

```typescript
export interface ExcludedApp {
  id: number;
  processName: string;
  createdAt: number;
}
```

`AppSettings` has **no** `excludedApps` field.

## Store Methods

```rust
pub fn get_excluded_apps(&self) -> Result<Vec<ExcludedApp>>
pub fn add_excluded_app(&self, process_name: &str) -> Result<ExcludedApp>
pub fn remove_excluded_app(&self, id: i64) -> Result<()>
pub fn is_app_excluded(&self, process_name: &str) -> Result<bool>
```

- `add_excluded_app` trims the input before insert. Empty string after trim returns an error without touching the DB. UNIQUE violation also returns an error.
- `is_app_excluded` uses a targeted existence query — no full list load:

```sql
SELECT EXISTS(SELECT 1 FROM excluded_apps WHERE process_name = ? COLLATE NOCASE)
```

## Rust: Foreground Process Name

At clipboard-change time (inside `clipboard_monitor.rs`), before saving the entry:

```rust
fn get_foreground_process_name() -> Option<String> {
    // GetForegroundWindow → GetWindowThreadProcessId → OpenProcess →
    // GetModuleFileNameExW → extract filename component
}
```

Returns `None` if any WinAPI call fails (treated as no exclusion).

## Exclusion Check

In the clipboard monitor, after reading the foreground process name:

```rust
if let Some(proc) = &foreground_process {
    if store.is_app_excluded(proc).unwrap_or(false) {
        return;
    }
}
```

Single targeted DB query per clipboard event. No caching.

## Tauri Commands

```rust
#[tauri::command] get_excluded_apps()                    -> Result<Vec<ExcludedApp>>
#[tauri::command] add_excluded_app(process_name: String) -> Result<ExcludedApp>
#[tauri::command] remove_excluded_app(id: i64)           -> Result<()>
```

`add_excluded_app` trims `process_name` before passing to the store. Empty string after trim returns an error immediately.

## Angular Integration

- `tauri-bridge.service.ts` gets three new methods alongside the snippet methods.
- A dedicated `excluded-apps.service.ts` manages state via a signal-based resource (same pattern as snippets/settings).
- **Add:** trim → empty check → call `addExcludedApp` → reload resource.
- **Remove:** call `removeExcludedApp(id)` then `resource.update(apps => apps.filter(a => a.id !== id))` — optimistic, no reload.

## Settings UI

Located in the **Privacy** settings group (new group, below Clipboard):

```
Excluded apps

[ KeePass.exe                    added Apr 27, 2026  ✕ ]
[ 1Password.exe                  added Apr 28, 2026  ✕ ]
[ ________________________ ]  ← text input
[  + Add app  ]
```

- `created_at` displayed as a short locale date next to each entry.
- List ordered by `id ASC` (insertion order).
- Text input trimmed on submit. Empty input rejected silently. Duplicate ignored silently.
- Each row has a remove (✕) button triggering optimistic removal.

## i18n Keys

```
SETTINGS.EXCLUDED_APPS_LABEL        = "Excluded apps"
SETTINGS.EXCLUDED_APPS_PLACEHOLDER  = "e.g. KeePass.exe"
SETTINGS.EXCLUDED_APPS_ADD          = "Add app"
SETTINGS.EXCLUDED_APPS_ADDED        = "added {date}"
```

## What is NOT in scope

- Wildcard or regex matching.
- Window-title-based exclusion.
- Temporary pause ("pause capture for 5 minutes").
- Manual reordering of the list.
- Soft-disable (enabled/disabled toggle per entry).
