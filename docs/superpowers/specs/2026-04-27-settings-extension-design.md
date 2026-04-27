# Settings Extension Design

**Date:** 2026-04-27
**Status:** Approved

## Overview

Extend the clipboard manager settings with three new features: autostart at login, optional max-entries deletion (with extended range), and optional age-based entry deletion. Includes a SQLite schema upgrade from a single `value TEXT` column to typed `value_text TEXT` / `value_int INTEGER` columns.

---

## 1. Data Model

### TypeScript (`src/app/core/models/settings.model.ts`)

Four new fields added to `AppSettings`:

```typescript
export interface AppSettings {
  shortcut: string;
  maxEntries: number;             // range: 5–999 (extended from 5–100)
  language: Language | null;
  theme: Theme;
  autostart: boolean;             // default: false
  deleteAfterMaxEntries: boolean; // default: true  (preserves existing behavior)
  deleteAfterDays: boolean;       // default: false
  maxDays: number;                // default: 30, range: 1–365
}

export const DEFAULT_SETTINGS: AppSettings = {
  shortcut: 'Ctrl+SEMICOLON',
  maxEntries: 20,
  language: null,
  theme: 'system',
  autostart: false,
  deleteAfterMaxEntries: true,
  deleteAfterDays: false,
  maxDays: 30,
};
```

### Rust (`src-tauri/src/models.rs`)

```rust
pub struct AppSettings {
    pub shortcut: String,
    pub max_entries: i64,
    pub language: Option<Language>,
    pub theme: Theme,
    pub autostart: bool,
    pub delete_after_max_entries: bool,
    pub delete_after_days: bool,
    pub max_days: i64,
}
```

Default impl updated to include new fields with matching defaults.

---

## 2. SQLite Schema

### New schema

```sql
CREATE TABLE settings (
    key        TEXT PRIMARY KEY,
    value_text TEXT,
    value_int  INTEGER
);
```

Booleans are stored as 0/1 in `value_int`. Each row uses exactly one column; the other is NULL.

### Migration (v0 → v1)

Schema version tracked via `PRAGMA user_version`.

On store init, if `user_version < 1`:
1. `DROP TABLE IF EXISTS settings`
2. `CREATE TABLE settings (key TEXT PRIMARY KEY, value_text TEXT, value_int INTEGER)`
3. `PRAGMA user_version = 1`

Settings reset to defaults on first launch after the upgrade. This is intentional for the development stage; future migrations will preserve data.

### Key-to-column mapping

| Key                    | Column       | Type    |
|------------------------|--------------|---------|
| `shortcut`             | `value_text` | string  |
| `language`             | `value_text` | string? |
| `theme`                | `value_text` | string  |
| `maxEntries`           | `value_int`  | i64     |
| `autostart`            | `value_int`  | bool    |
| `deleteAfterMaxEntries`| `value_int`  | bool    |
| `deleteAfterDays`      | `value_int`  | bool    |
| `maxDays`              | `value_int`  | i64     |

`get_settings` reads `value_text` or `value_int` directly (no string parsing). `save_settings` writes to the correct column per field. `rusqlite` handles `bool` as `i64` 0/1.

---

## 3. Deletion Logic (Rust)

### Max-entries pruning (`save_entry`)

Existing prune query is now conditional:

```rust
if settings.delete_after_max_entries {
    // existing DELETE ... LIMIT -1 OFFSET max_entries query
}
```

### Age-based pruning

New helper `prune_old_entries(conn: &Connection, max_days: i64)`:

```sql
DELETE FROM entries
WHERE pinned = 0
  AND created_at < ?1
```

Where `?1 = now_unix_seconds - max_days * 86400`. Uses `created_at` (capture time), not `last_used_at`.

Called from two places:
1. `save_entry` — when `delete_after_days` is true, after inserting the new entry
2. App startup (`lib.rs`) — when `delete_after_days` is true, after loading settings and before the clipboard monitor starts

---

## 4. Autostart (Tauri)

Add to `Cargo.toml`:
```toml
tauri-plugin-autostart = "2"
```

Register in `lib.rs` alongside existing plugins.

In `save_settings` command (`commands.rs`), after persisting to SQLite:

```rust
if settings.autostart {
    app.autolaunch().enable()?;
} else {
    app.autolaunch().disable()?;
}
```

Mirrors the existing shortcut re-registration pattern in that command.

---

## 5. UI (Angular)

### New setting sections

All three new sections follow the existing section pattern (`space-y-1.5`, `hlmLabel`, `hlmInput`). Each checkbox auto-saves on change via the existing `persist()` flow.

**Start at Login**
- `HlmCheckbox` bound to `settings().autostart`
- No dependent input

**History Limit** (existing section, modified)
- `HlmCheckbox` for `deleteAfterMaxEntries` in the section header row
- Existing number input gets `[disabled]="!settings().deleteAfterMaxEntries"`
- Range hint updated: 5–999
- `onMaxEntriesBlur` clamp updated: `Math.min(999, Math.max(5, value))`

**Auto-delete old entries**
- `HlmCheckbox` for `deleteAfterDays`
- Number input for `maxDays`, `[disabled]="!settings().deleteAfterDays"`
- `onMaxDaysBlur` handler: clamp to `Math.min(365, Math.max(1, value))`

### New translation keys

Added to `en.ts`, `de.ts`, and `translation.interface.ts`:

```
SETTINGS.AUTOSTART_LABEL              e.g. "Start at Login"
SETTINGS.DELETE_AFTER_MAX_LABEL       replaces MAX_ENTRIES_LABEL as the section header; checkbox label
SETTINGS.DELETE_AFTER_DAYS_LABEL      e.g. "Auto-delete old entries"
SETTINGS.MAX_DAYS_RANGE               e.g. "days (1 – 365)"
SETTINGS.MAX_ENTRIES_RANGE            updated to reflect new max: "entries (5 – 999)"
```

---

## 6. Files Affected

| File | Change |
|------|--------|
| `src/app/core/models/settings.model.ts` | Add 4 fields + update defaults + extend maxEntries range |
| `src/app/features/settings/settings.component.ts` | Add 3 sections, update clamp, add onMaxDaysBlur |
| `src/app/i18n/translation.interface.ts` | Add new translation keys to interface |
| `src/app/i18n/en.ts` | Add English strings |
| `src/app/i18n/de.ts` | Add German strings |
| `src-tauri/src/models.rs` | Add 4 fields to AppSettings + update Default |
| `src-tauri/src/commands.rs` | Add autostart toggle after save |
| `src-tauri/src/store/sqlite_store.rs` | Schema migration, typed read/write, conditional pruning, age pruning |
| `src-tauri/src/lib.rs` | Register autostart plugin, call age pruning on startup |
| `src-tauri/Cargo.toml` | Add tauri-plugin-autostart |
