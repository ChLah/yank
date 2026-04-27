# Window Drag & Position Persistence Design

**Date:** 2026-04-27
**Status:** Approved

## Overview

Allow the user to move the undecorated popup window by dragging its title bar. Add a "Window Position" setting with two modes: *Cursor position* (open next to the cursor, existing behavior) and *Last position* (re-open at the position the user last left it). Position is saved automatically after each drag and is only stored when the setting is set to *Last position*.

---

## 1. Data Model

### TypeScript (`src/app/core/models/settings.model.ts`)

One new union type and one new field added to `AppSettings`:

```typescript
export type WindowPositionMode = 'cursor' | 'last';

export interface AppSettings {
  // ... existing fields ...
  windowPosition: WindowPositionMode; // default: 'cursor'
}

export const DEFAULT_SETTINGS: AppSettings = {
  // ... existing defaults ...
  windowPosition: 'cursor',
};
```

### Rust (`src-tauri/src/models.rs`)

```rust
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum WindowPositionMode {
    Cursor,
    Last,
}

impl Default for WindowPositionMode {
    fn default() -> Self { WindowPositionMode::Cursor }
}

pub struct AppSettings {
    // ... existing fields ...
    pub window_position: WindowPositionMode,
}
```

---

## 2. SQLite Storage

### Settings key-to-column mapping (additions)

| Key              | Column       | Type   |
|------------------|--------------|--------|
| `windowPosition` | `value_text` | string (`"cursor"` \| `"last"`) |
| `lastWindowX`    | `value_int`  | i64 (physical pixels) |
| `lastWindowY`    | `value_int`  | i64 (physical pixels) |

`lastWindowX` / `lastWindowY` are **not** part of `AppSettings` — they are stored separately and are never sent to Angular. They use the same `settings` table and are written via a dedicated `save_window_position` method.

### No schema migration required

The existing `settings` table schema (`key TEXT PRIMARY KEY, value_text TEXT, value_int INTEGER`) supports the new keys without any DDL changes. New keys are absent until the user first saves them; `get_settings` falls back to `WindowPositionMode::Cursor` if `windowPosition` is missing, and `get_window_position` returns `None` if the position keys are absent.

---

## 3. Rust Store API (`src-tauri/src/store/sqlite_store.rs`)

### Modified: `get_settings`

Reads the new `windowPosition` key and maps it:

```rust
let window_position = text("windowPosition").map(|v| match v.as_str() {
    "last" => WindowPositionMode::Last,
    _      => WindowPositionMode::Cursor,
}).unwrap_or(WindowPositionMode::Cursor);
```

### Modified: `save_settings`

Writes `windowPosition` as `value_text`:

```rust
("windowPosition", Some(window_position_str), None),
```

### New: `save_window_position(x: i64, y: i64)`

Writes `lastWindowX` and `lastWindowY` in a single transaction:

```rust
pub fn save_window_position(&self, x: i64, y: i64) -> Result<(), rusqlite::Error>
```

### New: `get_window_position()`

Returns `Option<(i64, i64)>` — `None` when neither key exists yet:

```rust
pub fn get_window_position(&self) -> Result<Option<(i64, i64)>, Box<dyn std::error::Error>>
```

---

## 4. Window Positioning Logic (`src-tauri/src/windows.rs`)

### Modified: `show_popup`

Before showing the window, attempts settings-based positioning and falls back to cursor:

```
if window_position == Last AND get_window_position() returns Some((x, y)):
    set_position(x, y)
else:
    position_near_cursor()
```

The store is accessed via `app.state::<Arc<SqliteStore>>()`.

---

## 5. New Tauri Command (`src-tauri/src/commands.rs`)

```rust
#[tauri::command]
pub fn save_window_position(x: i32, y: i32, store: StoreState) -> Result<(), String>
```

Called by Angular after each debounced `onMoved` event. Only called when `windowPosition === 'last'`.

---

## 6. Drag Region (Angular / HTML)

The `data-tauri-drag-region` attribute is added to the `h-11` header `<div>` in both:
- `clipboard-list.component.ts` — main popup window header
- `settings.component.ts` — settings view header (harmless on decorated windows; needed when settings is navigated to within the main undecorated window)

Child elements (icon buttons, links) inside the drag region still receive click events normally. Tauri 2 only initiates drag on a mouse-drag gesture, not on a plain click.

---

## 7. Position Save Flow (Angular)

Component: `clipboard-list.component.ts`

### On init

```
getCurrentWindow().onMoved(handler) → store unlisten fn
```

### Move handler logic

```
if suppressPositionSave → return
clear debounce timer
set debounce timer (300 ms):
    if settings.windowPosition === 'last':
        bridge.saveWindowPosition(payload.x, payload.y)
```

### Suppress-on-show

When `popup-shown` fires (i.e., programmatic `set_position` just ran):
```
suppressPositionSave = true
setTimeout(() => suppressPositionSave = false, 600 ms)
```

This prevents the programmatically-set opening position from being saved as "last position", which would freeze the window at the cursor's location rather than the user's chosen drag target.

### On destroy

```
unlistenWindowMoved?.()
clearTimeout(moveDebounceTimer)
```

---

## 8. Settings UI (`src/app/features/settings/settings.component.ts`)

New "Window Position" section added after the Theme section. Uses the existing `hlmSelect` pattern:

```html
<div hlmSelect [value]="settings().windowPosition" [itemToString]="windowPositionLabel"
     (valueChange)="onWindowPositionChange($event)">
  <hlm-select-item value="cursor">Cursor position</hlm-select-item>
  <hlm-select-item value="last">Last position</hlm-select-item>
</div>
```

Handler: `onWindowPositionChange(value)` — updates `settings` signal and calls `persist()`.

---

## 9. Translation Keys

Added to `translation.interface.ts`, `en.ts`, `de.ts`:

| Key | EN | DE |
|-----|----|----|
| `SETTINGS.WINDOW_POSITION_LABEL` | Window Position | Fensterposition |
| `SETTINGS.WINDOW_POSITION_CURSOR` | Cursor position | Cursor-Position |
| `SETTINGS.WINDOW_POSITION_LAST` | Last position | Letzte Position |

---

## 10. Files Affected

| File | Change |
|------|--------|
| `src-tauri/src/models.rs` | Add `WindowPositionMode` enum and `window_position` field to `AppSettings` |
| `src-tauri/src/store/sqlite_store.rs` | Read/write `windowPosition`; add `save_window_position`, `get_window_position` |
| `src-tauri/src/windows.rs` | `show_popup` reads settings and positions from last or cursor |
| `src-tauri/src/commands.rs` | Add `save_window_position` command |
| `src-tauri/src/lib.rs` | Register `save_window_position` in invoke handler |
| `src/app/core/models/settings.model.ts` | Add `WindowPositionMode` type and `windowPosition` field |
| `src/app/core/services/tauri-bridge.service.ts` | Add `saveWindowPosition(x, y)` |
| `src/app/features/clipboard-list/clipboard-list.component.ts` | Drag region, `onMoved` listener, suppress logic |
| `src/app/features/settings/settings.component.ts` | Drag region, Window Position select section |
| `src/app/i18n/translation.interface.ts` | Add 3 new SETTINGS keys |
| `src/app/i18n/en.ts` | English strings |
| `src/app/i18n/de.ts` | German strings |
