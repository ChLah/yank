# Window Drag & Position Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the undecorated popup window draggable via its title bar, and persist/restore the window position based on a new "Window Position" setting.

**Architecture:** Rust side gains a `WindowPositionMode` enum in `AppSettings`, two new SQLite store methods for reading/writing the last physical position, and modified window-show logic that picks between cursor and last-position. Angular side registers a Tauri `onMoved` listener that debounces position saves to the backend; the existing settings UI gains a new select section for the mode.

**Tech Stack:** Rust (Tauri 2, rusqlite), Angular 21 (signals, resource API), `@tauri-apps/api/window`, spartan-ng `hlmSelect`, ngx-translate.

---

## File Map

| File | Role |
|------|------|
| `src-tauri/src/models.rs` | `WindowPositionMode` enum; new field on `AppSettings` |
| `src-tauri/src/store/sqlite_store.rs` | Read/write `windowPosition`; `save_window_position`, `get_window_position` |
| `src-tauri/src/windows.rs` | `show_popup` — reads settings, positions from last coords or cursor |
| `src-tauri/src/commands.rs` | `save_window_position` Tauri command |
| `src-tauri/src/lib.rs` | Register new command in `invoke_handler` |
| `src/app/core/models/settings.model.ts` | `WindowPositionMode` type; `windowPosition` on `AppSettings` |
| `src/app/core/services/tauri-bridge.service.ts` | `saveWindowPosition(x, y)` |
| `src/app/features/clipboard-list/clipboard-list.component.ts` | Drag region; `onMoved` listener; suppress-on-show logic |
| `src/app/features/settings/settings.component.ts` | Drag region; Window Position `hlmSelect` section |
| `src/app/i18n/translation.interface.ts` | 3 new SETTINGS keys |
| `src/app/i18n/en.ts` | English strings |
| `src/app/i18n/de.ts` | German strings |

---

### Task 1: Add `WindowPositionMode` to Rust models

**Files:**
- Modify: `src-tauri/src/models.rs`

- [ ] **Step 1: Add `WindowPositionMode` enum and extend `AppSettings`**

  In `src-tauri/src/models.rs`, after the `Theme` enum add:

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
  ```

  Add to `AppSettings` struct:
  ```rust
  pub window_position: WindowPositionMode,
  ```

  Add to `Default` impl:
  ```rust
  window_position: WindowPositionMode::Cursor,
  ```

- [ ] **Step 2: Verify it compiles**

  ```bash
  cd src-tauri && cargo check
  ```

  Expected: `Finished` with no errors. (Will see warnings about unused — that's fine, they disappear in later tasks.)

- [ ] **Step 3: Commit**

  ```bash
  git add src-tauri/src/models.rs
  git commit -m "feat(models): add WindowPositionMode enum and window_position to AppSettings"
  ```

---

### Task 2: Store — read/write `windowPosition` + position helpers

**Files:**
- Modify: `src-tauri/src/store/sqlite_store.rs`

No schema migration is needed — the existing `settings` table already has `key / value_text / value_int` columns and supports arbitrary keys.

- [ ] **Step 1: Update `get_settings` to fetch `windowPosition`**

  In `get_settings`, add `"windowPosition"` to the keys slice:
  ```rust
  let map = Self::fetch_settings_map(&conn, &[
      "shortcut", "maxEntries", "language", "theme",
      "autostart", "deleteAfterMaxEntries", "deleteAfterDays", "maxDays",
      "windowPosition",
  ])?;
  ```

  Add mapping after `max_days`:
  ```rust
  let window_position = text("windowPosition").map(|v| match v.as_str() {
      "last" => WindowPositionMode::Last,
      _      => WindowPositionMode::Cursor,
  }).unwrap_or(WindowPositionMode::Cursor);
  ```

  Include in the returned struct:
  ```rust
  Ok(AppSettings { shortcut, max_entries, language, theme, autostart,
                   delete_after_max_entries, delete_after_days, max_days,
                   window_position })
  ```

- [ ] **Step 2: Update `save_settings` to write `windowPosition`**

  Add the `WindowPositionMode` import at the top of the file (alongside existing `Theme`):
  ```rust
  use crate::models::{AppSettings, ClipboardContent, ClipboardEntry, ClipboardPayload,
                      Language, Theme, WindowPositionMode};
  ```

  In `save_settings`, derive a string before building `rows`:
  ```rust
  let window_position_str = match settings.window_position {
      WindowPositionMode::Cursor => "cursor",
      WindowPositionMode::Last   => "last",
  };
  ```

  Add row:
  ```rust
  ("windowPosition", Some(window_position_str), None),
  ```

- [ ] **Step 3: Add `save_window_position` and `get_window_position`**

  Insert after `save_settings`, before `get_prune_settings_internal`:

  ```rust
  pub fn save_window_position(&self, x: i64, y: i64) -> Result<(), rusqlite::Error> {
      let conn = self.conn.lock().unwrap();
      let tx = conn.unchecked_transaction()?;
      let mut stmt = tx.prepare(
          "INSERT OR REPLACE INTO settings (key, value_text, value_int) VALUES (?1, ?2, ?3)"
      )?;
      stmt.execute(params!["lastWindowX", None::<String>, Some(x)])?;
      stmt.execute(params!["lastWindowY", None::<String>, Some(y)])?;
      drop(stmt);
      tx.commit()
  }

  pub fn get_window_position(&self) -> Result<Option<(i64, i64)>, Box<dyn std::error::Error>> {
      let conn = self.conn.lock().unwrap();
      let map = Self::fetch_settings_map(&conn, &["lastWindowX", "lastWindowY"])?;
      let x = map.get("lastWindowX").and_then(|(_, i)| *i);
      let y = map.get("lastWindowY").and_then(|(_, i)| *i);
      Ok(x.zip(y))
  }
  ```

- [ ] **Step 4: Write a round-trip test for `window_position`**

  Add to the `#[cfg(test)]` block at the bottom of `sqlite_store.rs`:

  ```rust
  #[test]
  fn test_window_position_round_trip() {
      let store = in_memory_store();

      // Default is cursor
      let s = store.get_settings().unwrap();
      assert_eq!(s.window_position, WindowPositionMode::Cursor);

      // Save last
      store.save_settings(&AppSettings {
          window_position: WindowPositionMode::Last,
          ..AppSettings::default()
      }).unwrap();
      let s = store.get_settings().unwrap();
      assert_eq!(s.window_position, WindowPositionMode::Last);
  }

  #[test]
  fn test_save_and_get_window_position() {
      let store = in_memory_store();

      // None before saving
      assert!(store.get_window_position().unwrap().is_none());

      store.save_window_position(1280, 720).unwrap();
      let pos = store.get_window_position().unwrap();
      assert_eq!(pos, Some((1280, 720)));

      // Overwrite
      store.save_window_position(100, 200).unwrap();
      assert_eq!(store.get_window_position().unwrap(), Some((100, 200)));
  }
  ```

- [ ] **Step 5: Run the new tests**

  ```bash
  cd src-tauri && cargo test test_window_position_round_trip test_save_and_get_window_position -- --nocapture
  ```

  Expected: both PASS.

- [ ] **Step 6: Run the full test suite to check for regressions**

  ```bash
  cd src-tauri && cargo test
  ```

  Expected: all existing tests still pass.

- [ ] **Step 7: Commit**

  ```bash
  git add src-tauri/src/store/sqlite_store.rs
  git commit -m "feat(store): read/write windowPosition setting; add save/get_window_position"
  ```

---

### Task 3: `show_popup` — position from last coords or cursor

**Files:**
- Modify: `src-tauri/src/windows.rs`

- [ ] **Step 1: Add imports**

  At the top of `windows.rs`, after the existing `use tauri::{...}` line, add:

  ```rust
  use std::sync::Arc;
  use crate::{models::WindowPositionMode, store::SqliteStore};
  ```

- [ ] **Step 2: Refactor `show_popup` to use a helper**

  Replace the existing `show_popup` function:

  ```rust
  pub fn show_popup(app: &AppHandle) {
      if let Some(window) = app.get_webview_window("main") {
          if !try_position_from_last(app, &window) {
              position_near_cursor(&window);
          }
          let _ = window.show();
          let _ = window.set_focus();
          let _ = app.emit_to("main", "popup-shown", ());
      }
  }

  fn try_position_from_last(app: &AppHandle, window: &tauri::WebviewWindow) -> bool {
      let store = app.state::<Arc<SqliteStore>>();
      let settings = match store.get_settings() {
          Ok(s) => s,
          Err(_) => return false,
      };
      if settings.window_position != WindowPositionMode::Last {
          return false;
      }
      match store.get_window_position() {
          Ok(Some((x, y))) => {
              let _ = window.set_position(tauri::PhysicalPosition::new(x as i32, y as i32));
              true
          }
          _ => false,
      }
  }
  ```

- [ ] **Step 3: Verify compilation**

  ```bash
  cd src-tauri && cargo check
  ```

  Expected: `Finished` with no errors.

- [ ] **Step 4: Commit**

  ```bash
  git add src-tauri/src/windows.rs
  git commit -m "feat(windows): position popup from last saved coords when mode is Last"
  ```

---

### Task 4: New `save_window_position` Tauri command + registration

**Files:**
- Modify: `src-tauri/src/commands.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Add the command to `commands.rs`**

  Append after `toggle_pin`:

  ```rust
  #[tauri::command]
  pub fn save_window_position(x: i32, y: i32, store: StoreState) -> Result<(), String> {
      store.save_window_position(x as i64, y as i64).map_err(|e| e.to_string())
  }
  ```

- [ ] **Step 2: Register in `lib.rs`**

  In the `invoke_handler!` macro, add:
  ```rust
  commands::save_window_position,
  ```

- [ ] **Step 3: Compile check**

  ```bash
  cd src-tauri && cargo check
  ```

  Expected: `Finished` cleanly.

- [ ] **Step 4: Commit**

  ```bash
  git add src-tauri/src/commands.rs src-tauri/src/lib.rs
  git commit -m "feat(commands): add save_window_position Tauri command"
  ```

---

### Task 5: Angular model + bridge

**Files:**
- Modify: `src/app/core/models/settings.model.ts`
- Modify: `src/app/core/services/tauri-bridge.service.ts`

- [ ] **Step 1: Extend `settings.model.ts`**

  Add after `Theme`:
  ```typescript
  export type WindowPositionMode = 'cursor' | 'last';
  ```

  Add to `AppSettings` interface:
  ```typescript
  windowPosition: WindowPositionMode;
  ```

  Add to `DEFAULT_SETTINGS`:
  ```typescript
  windowPosition: 'cursor',
  ```

- [ ] **Step 2: Add `saveWindowPosition` to the bridge**

  In `tauri-bridge.service.ts`, add after `onPopupShown`:

  ```typescript
  saveWindowPosition(x: number, y: number): Promise<void> {
    return invoke('save_window_position', { x, y });
  }
  ```

- [ ] **Step 3: TypeScript check**

  ```bash
  pnpm exec tsc --noEmit
  ```

  Expected: no errors.

- [ ] **Step 4: Commit**

  ```bash
  git add src/app/core/models/settings.model.ts \
          src/app/core/services/tauri-bridge.service.ts
  git commit -m "feat(angular): add WindowPositionMode type and saveWindowPosition bridge method"
  ```

---

### Task 6: Clipboard-list drag region + `onMoved` listener

**Files:**
- Modify: `src/app/features/clipboard-list/clipboard-list.component.ts`

- [ ] **Step 1: Add imports**

  Add after the existing `UnlistenFn` import:
  ```typescript
  import { getCurrentWindow } from '@tauri-apps/api/window';
  ```

  Add after the `TauriBridgeService` import:
  ```typescript
  import { SettingsService } from '../../core/services/settings.service';
  ```

- [ ] **Step 2: Add `data-tauri-drag-region` to the header**

  In the template, find the header div and add the attribute:
  ```html
  <div class="px-3.5 h-11 flex items-center justify-between shrink-0 bg-card border-b border-border"
       data-tauri-drag-region>
  ```

- [ ] **Step 3: Add new class fields**

  In the component class, after `private unlistenPopupShown`:
  ```typescript
  private settings = inject(SettingsService);
  private unlistenWindowMoved?: UnlistenFn;
  private moveDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private suppressPositionSave = false;
  ```

- [ ] **Step 4: Update `ngOnInit`**

  Inside the `onPopupShown` callback, after `this.clearSearch()`, add:
  ```typescript
  this.suppressPositionSave = true;
  setTimeout(() => { this.suppressPositionSave = false; }, 600);
  ```

  After the existing `onPopupShown` setup, add:
  ```typescript
  getCurrentWindow().onMoved(({ payload }) => {
    if (this.suppressPositionSave) return;
    if (this.moveDebounceTimer) clearTimeout(this.moveDebounceTimer);
    this.moveDebounceTimer = setTimeout(() => {
      if (this.settings.settings.value()?.windowPosition === 'last') {
        this.bridge.saveWindowPosition(payload.x, payload.y);
      }
    }, 300);
  }).then(fn => { this.unlistenWindowMoved = fn; });
  ```

- [ ] **Step 5: Update `ngOnDestroy`**

  Add cleanup:
  ```typescript
  this.unlistenWindowMoved?.();
  if (this.moveDebounceTimer) clearTimeout(this.moveDebounceTimer);
  ```

- [ ] **Step 6: TypeScript check**

  ```bash
  pnpm exec tsc --noEmit
  ```

  Expected: no errors.

- [ ] **Step 7: Commit**

  ```bash
  git add src/app/features/clipboard-list/clipboard-list.component.ts
  git commit -m "feat(clipboard-list): add drag region and window position tracking"
  ```

---

### Task 7: Settings UI — Window Position select

**Files:**
- Modify: `src/app/features/settings/settings.component.ts`

- [ ] **Step 1: Add drag region to settings header**

  Find the settings header div and add the attribute:
  ```html
  <div class="px-3.5 h-11 flex items-center gap-2 shrink-0 bg-card border-b border-border"
       data-tauri-drag-region>
  ```

- [ ] **Step 2: Update the import for `WindowPositionMode`**

  In the existing `AppSettings` import line, add `WindowPositionMode`:
  ```typescript
  import { AppSettings, DEFAULT_SETTINGS, Language, Theme, WindowPositionMode }
    from '../../core/models/settings.model';
  ```

- [ ] **Step 3: Add `windowPositionLabel` helper**

  After `themeLabel`:
  ```typescript
  protected windowPositionLabel = (val: string): string => {
    switch (val) {
      case 'last': return this.translate.instant('SETTINGS.WINDOW_POSITION_LAST');
      default:     return this.translate.instant('SETTINGS.WINDOW_POSITION_CURSOR');
    }
  };
  ```

- [ ] **Step 4: Add the change handler**

  After `onThemeChange`:
  ```typescript
  protected onWindowPositionChange(value: string | null): void {
    const windowPosition = (value as WindowPositionMode) || 'cursor';
    this.settings.update(s => ({ ...s, windowPosition }));
    this.persist();
  }
  ```

- [ ] **Step 5: Add the template section**

  After the Theme section, before `</div>` (the scrollable container close):

  ```html
  <!-- Window Position -->
  <div class="space-y-1.5">
    <label hlmLabel class="block uppercase tracking-wider">
      {{ 'SETTINGS.WINDOW_POSITION_LABEL' | translate }}
    </label>
    <div hlmSelect
         [value]="settings().windowPosition"
         [itemToString]="windowPositionLabel"
         (valueChange)="onWindowPositionChange($event)">
      <hlm-select-trigger class="w-full">
        <hlm-select-value />
      </hlm-select-trigger>
      <hlm-select-content *hlmSelectPortal>
        <hlm-select-item value="cursor">
          {{ 'SETTINGS.WINDOW_POSITION_CURSOR' | translate }}
        </hlm-select-item>
        <hlm-select-item value="last">
          {{ 'SETTINGS.WINDOW_POSITION_LAST' | translate }}
        </hlm-select-item>
      </hlm-select-content>
    </div>
  </div>
  ```

- [ ] **Step 6: TypeScript check**

  ```bash
  pnpm exec tsc --noEmit
  ```

  Expected: no errors.

- [ ] **Step 7: Commit**

  ```bash
  git add src/app/features/settings/settings.component.ts
  git commit -m "feat(settings): add Window Position select"
  ```

---

### Task 8: Translation keys

**Files:**
- Modify: `src/app/i18n/translation.interface.ts`
- Modify: `src/app/i18n/en.ts`
- Modify: `src/app/i18n/de.ts`

- [ ] **Step 1: Add keys to the interface**

  In `translation.interface.ts`, inside `SETTINGS`, after `MAX_DAYS_RANGE`:
  ```typescript
  WINDOW_POSITION_LABEL: string;
  WINDOW_POSITION_CURSOR: string;
  WINDOW_POSITION_LAST: string;
  ```

- [ ] **Step 2: Add English strings**

  In `en.ts`, after `MAX_DAYS_RANGE`:
  ```typescript
  WINDOW_POSITION_LABEL: 'Window Position',
  WINDOW_POSITION_CURSOR: 'Cursor position',
  WINDOW_POSITION_LAST: 'Last position',
  ```

- [ ] **Step 3: Add German strings**

  In `de.ts`, after `MAX_DAYS_RANGE`:
  ```typescript
  WINDOW_POSITION_LABEL: 'Fensterposition',
  WINDOW_POSITION_CURSOR: 'Cursor-Position',
  WINDOW_POSITION_LAST: 'Letzte Position',
  ```

- [ ] **Step 4: TypeScript check**

  ```bash
  pnpm exec tsc --noEmit
  ```

  Expected: no errors.

- [ ] **Step 5: Commit**

  ```bash
  git add src/app/i18n/translation.interface.ts src/app/i18n/en.ts src/app/i18n/de.ts
  git commit -m "feat(i18n): add Window Position translation keys"
  ```

---

## Manual Verification Checklist

After all tasks are complete, verify the following in a running `pnpm tauri dev` session:

- [ ] **Drag**: Grab the clipboard popup header and drag it — the window moves freely.
- [ ] **Cursor mode** (default): Open the popup via shortcut multiple times from different cursor positions — window always appears near the cursor.
- [ ] **Switch to Last position**: Open settings → Window Position → Last position.
- [ ] **Last position — first open**: After switching, close and re-open the popup via shortcut — it should still appear near the cursor (no saved position yet).
- [ ] **Save on drag**: Drag the popup to a specific corner, close it (Esc), re-open it — it should re-appear at the dragged position.
- [ ] **Persist across restarts**: Close the app, relaunch, open the popup — it should open at the last dragged position.
- [ ] **Switch back to Cursor**: Change setting back to Cursor position — popup should follow cursor again.
- [ ] **Settings drag**: The settings page header (reached via the gear icon) is also draggable from the header area.
- [ ] **No phantom saves**: Open popup (cursor mode), wait a moment, close — the stored position should NOT update (position saving is suppressed for 600 ms after show and requires mode to be `last`).
