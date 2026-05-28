# Auto-Paste Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When the user selects any item from Yank's popup, the content is placed on the clipboard and Ctrl+V is automatically sent to the previously-focused application — eliminating the manual paste step. Controlled by an "Auto-Paste" toggle in Settings → History, defaulting to on.

**Architecture:** Two new Rust commands (`paste_entry_and_close`, `paste_text_and_close`) replace all existing `set_clipboard` / `set_clipboard_text` + `hide_popup` call chains. Each command sets the clipboard, reads `auto_paste` from the settings store, hides the popup, then — if enabled — waits 150 ms for Windows to restore focus and sends Ctrl+V via `SendInput`. No window-handle tracking is needed: Windows automatically restores focus to the previous app when our popup is hidden.

**Tech Stack:** Rust (Tauri commands, `windows` crate for `SendInput`, `arboard` for clipboard), Angular 19 (signals, `resource`, `linkedSignal`), SQLite (key-value settings table), ngx-translate.

---

## File Map

| File | Change |
|------|--------|
| `src-tauri/src/models.rs` | Add `auto_paste: bool` to `AppSettings` |
| `src-tauri/src/store/sqlite_store.rs` | Read/write `autoPaste` setting key |
| `src-tauri/src/commands.rs` | Add `paste_entry_and_close`, `paste_text_and_close`; remove `set_clipboard`, `set_clipboard_text` |
| `src-tauri/src/lib.rs` | Register new commands, unregister old ones |
| `src/app/core/models/settings.model.ts` | Add `autoPaste` to `AppSettings` and `DEFAULT_SETTINGS` |
| `src/app/core/services/tauri-bridge.service.ts` | Add `pasteEntryAndClose`, `pasteTextAndClose`; remove `setClipboard`, `setClipboardText` |
| `src/app/core/services/clipboard.service.ts` | Remove `setClipboard()` method |
| `src/app/features/clipboard-list/clipboard-tab.component.ts` | Replace all paste call sites |
| `src/app/features/clipboard-list/snippets-tab.component.ts` | Replace all paste call sites |
| `src/app/features/image-preview/image-preview.component.ts` | Replace paste call site |
| `src/app/features/settings/sections/history.component.ts` | Add `autoPaste` to `HistorySettings`, add toggle UI |
| `src/app/features/settings/settings.component.ts` | Add `autoPaste` to `historySlice` |
| `src/app/i18n/en.ts` | Add `AUTO_PASTE_LABEL` |
| `src/app/i18n/de.ts` | Add `AUTO_PASTE_LABEL` |

---

### Task 1: Add `auto_paste` to the Rust settings model and store

**Files:**
- Modify: `src-tauri/src/models.rs`
- Modify: `src-tauri/src/store/sqlite_store.rs`

- [ ] **Add the field to `AppSettings` in `models.rs`**

  In the `AppSettings` struct (around line 47), add the new field after `auto_check_updates`:
  ```rust
  pub auto_paste: bool,
  ```

  In `AppSettings::default()` (around line 61), add after `auto_check_updates: true`:
  ```rust
  auto_paste: true,
  ```

- [ ] **Wire `auto_paste` into `get_settings` in `sqlite_store.rs`**

  In `get_settings` (around line 420), add `"autoPaste"` to the key slice:
  ```rust
  pub fn get_settings(&self) -> Result<AppSettings, Box<dyn std::error::Error>> {
      let conn = self.conn.lock().unwrap();
      let map = Self::fetch_settings_map(&conn, &[
          "shortcut", "maxEntries", "language", "theme",
          "autostart", "deleteAfterMaxEntries", "deleteAfterDays", "maxDays",
          "windowPosition", "pauseShortcut", "autoCheckUpdates", "autoPaste",
      ])?;
  ```

  After the `auto_check_updates` line (around line 451), add:
  ```rust
  let auto_paste = int("autoPaste").map(|v| v != 0).unwrap_or(defaults.auto_paste);
  ```

  Add `auto_paste` to the returned `AppSettings` struct literal (around line 453):
  ```rust
  Ok(AppSettings {
      shortcut, max_entries, language, theme, autostart,
      delete_after_max_entries, delete_after_days, max_days,
      window_position, pause_shortcut, auto_check_updates, auto_paste,
  })
  ```

- [ ] **Wire `auto_paste` into `save_settings` in `sqlite_store.rs`**

  In `save_settings` (around line 486), add after the `autoCheckUpdates` entry in the upsert slice:
  ```rust
  ("autoPaste", None, Some(settings.auto_paste as i64)),
  ```

- [ ] **Write a round-trip test in `sqlite_store.rs`**

  At the bottom of the existing `#[cfg(test)]` block (around line 1046), add:
  ```rust
  #[test]
  fn test_auto_paste_setting_round_trip() {
      let store = in_memory_store();

      // default is true
      let loaded = store.get_settings().unwrap();
      assert!(loaded.auto_paste);

      // save false and reload
      let mut settings = store.get_settings().unwrap();
      settings.auto_paste = false;
      store.save_settings(&settings).unwrap();
      let loaded = store.get_settings().unwrap();
      assert!(!loaded.auto_paste);
  }
  ```

- [ ] **Run the test**

  ```
  cargo test -p yank-lib test_auto_paste_setting_round_trip -- --nocapture
  ```
  Expected: `test test_auto_paste_setting_round_trip ... ok`

- [ ] **Commit**

  ```
  git add src-tauri/src/models.rs src-tauri/src/store/sqlite_store.rs
  git commit -m "feat(backend): add auto_paste field to AppSettings model and store"
  ```

---

### Task 2: Add the new Rust commands and remove the old ones

**Files:**
- Modify: `src-tauri/src/commands.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Add `do_paste_and_close` helper and the two new commands to `commands.rs`**

  Add these at the bottom of `commands.rs`, before the closing brace. The helper uses `tokio::time::sleep` (non-blocking) and `SendInput` (Windows-only):

  ```rust
  async fn do_paste_and_close(app_handle: &tauri::AppHandle, auto_paste: bool) {
      if let Some(window) = app_handle.get_webview_window("main") {
          let _ = window.hide();
      }
      if !auto_paste {
          return;
      }
      #[cfg(target_os = "windows")]
      {
          use std::mem::size_of;
          use windows::Win32::UI::Input::KeyboardAndMouse::{
              SendInput, INPUT, INPUT_0, INPUT_KEYBOARD, KEYBD_EVENT_FLAGS, KEYBDINPUT,
              KEYEVENTF_KEYUP, VIRTUAL_KEY, VK_CONTROL, VK_V,
          };
          tokio::time::sleep(std::time::Duration::from_millis(150)).await;
          let make = |vk: VIRTUAL_KEY, flags: KEYBD_EVENT_FLAGS| INPUT {
              r#type: INPUT_KEYBOARD,
              Anonymous: INPUT_0 {
                  ki: KEYBDINPUT {
                      wVk: vk,
                      wScan: 0,
                      dwFlags: flags,
                      time: 0,
                      dwExtraInfo: 0,
                  },
              },
          };
          let inputs = [
              make(VK_CONTROL, KEYBD_EVENT_FLAGS(0)),
              make(VK_V,       KEYBD_EVENT_FLAGS(0)),
              make(VK_V,       KEYEVENTF_KEYUP),
              make(VK_CONTROL, KEYEVENTF_KEYUP),
          ];
          unsafe { SendInput(&inputs, size_of::<INPUT>() as i32) };
      }
  }

  #[tauri::command]
  pub async fn paste_entry_and_close(
      id: i64,
      store: StoreState<'_>,
      session_stats: SessionStatsState<'_>,
      app_handle: tauri::AppHandle,
  ) -> Result<(), String> {
      store.restore_to_clipboard(id).map_err(|e| e.to_string())?;
      session_stats.pastes.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
      let auto_paste = store.get_settings().map(|s| s.auto_paste).unwrap_or(false);
      do_paste_and_close(&app_handle, auto_paste).await;
      Ok(())
  }

  #[tauri::command]
  pub async fn paste_text_and_close(
      text: String,
      store: StoreState<'_>,
      app_handle: tauri::AppHandle,
  ) -> Result<(), String> {
      let mut clipboard = arboard::Clipboard::new().map_err(|e| e.to_string())?;
      clipboard.set_text(text).map_err(|e| e.to_string())?;
      let auto_paste = store.get_settings().map(|s| s.auto_paste).unwrap_or(false);
      do_paste_and_close(&app_handle, auto_paste).await;
      Ok(())
  }
  ```

- [ ] **Remove the old `set_clipboard` and `set_clipboard_text` commands from `commands.rs`**

  Delete these two functions entirely (around lines 25–33 and 113–116):
  ```rust
  // DELETE this function:
  #[tauri::command]
  pub fn set_clipboard(
      id: i64,
      store: StoreState,
      session_stats: SessionStatsState,
  ) -> Result<(), String> { ... }

  // DELETE this function:
  #[tauri::command]
  pub fn set_clipboard_text(text: String) -> Result<(), String> { ... }
  ```

- [ ] **Update `lib.rs` `invoke_handler` to register new commands and remove old ones**

  In the `tauri::generate_handler![...]` block (around line 224), replace:
  ```rust
  commands::set_clipboard,
  // ...
  commands::set_clipboard_text,
  ```
  with:
  ```rust
  commands::paste_entry_and_close,
  commands::paste_text_and_close,
  ```
  (Keep all other existing command registrations unchanged.)

- [ ] **Verify it compiles**

  ```
  cargo build -p yank-lib 2>&1 | tail -5
  ```
  Expected: `Finished` with no errors. Warnings about unused imports are fine.

- [ ] **Commit**

  ```
  git add src-tauri/src/commands.rs src-tauri/src/lib.rs
  git commit -m "feat(backend): add paste_entry_and_close and paste_text_and_close commands"
  ```

---

### Task 3: Update the TypeScript settings model

**Files:**
- Modify: `src/app/core/models/settings.model.ts`

- [ ] **Add `autoPaste` to `AppSettings` and `DEFAULT_SETTINGS`**

  Open `src/app/core/models/settings.model.ts`. The full file becomes:
  ```ts
  export type Language = 'en' | 'de';
  export type Theme = 'dark' | 'light' | 'system';
  export type WindowPositionMode = 'cursor' | 'last';

  export interface AppSettings {
    shortcut: string;
    pauseShortcut: string;
    maxEntries: number;
    language: Language | null;
    theme: Theme;
    autostart: boolean;
    deleteAfterMaxEntries: boolean;
    deleteAfterDays: boolean;
    maxDays: number;
    windowPosition: WindowPositionMode;
    autoCheckUpdates: boolean;
    autoPaste: boolean;
  }

  export const DEFAULT_SETTINGS: AppSettings = {
    shortcut: 'Ctrl+Semicolon',
    pauseShortcut: '',
    maxEntries: 20,
    language: null,
    theme: 'system',
    autostart: false,
    deleteAfterMaxEntries: true,
    deleteAfterDays: false,
    maxDays: 30,
    windowPosition: 'cursor',
    autoCheckUpdates: true,
    autoPaste: true,
  };
  ```

- [ ] **Run TypeScript type-check to confirm no errors**

  ```
  pnpm exec tsc --noEmit 2>&1 | head -20
  ```
  Expected: no output (zero errors).

- [ ] **Commit**

  ```
  git add src/app/core/models/settings.model.ts
  git commit -m "feat(frontend): add autoPaste to AppSettings model"
  ```

---

### Task 4: Update `TauriBridgeService` and remove `ClipboardService.setClipboard`

**Files:**
- Modify: `src/app/core/services/tauri-bridge.service.ts`
- Modify: `src/app/core/services/clipboard.service.ts`

- [ ] **Replace `setClipboard` and `setClipboardText` with new methods in `TauriBridgeService`**

  In `src/app/core/services/tauri-bridge.service.ts`, replace:
  ```ts
  setClipboard(id: number): Promise<void> {
    return invoke('set_clipboard', { id });
  }
  ```
  with:
  ```ts
  pasteEntryAndClose(id: number): Promise<void> {
    return invoke('paste_entry_and_close', { id });
  }
  ```

  And replace:
  ```ts
  setClipboardText(text: string): Promise<void> {
    return invoke('set_clipboard_text', { text });
  }
  ```
  with:
  ```ts
  pasteTextAndClose(text: string): Promise<void> {
    return invoke('paste_text_and_close', { text });
  }
  ```

- [ ] **Remove `setClipboard()` from `ClipboardService`**

  In `src/app/core/services/clipboard.service.ts`, delete the `setClipboard` method entirely:
  ```ts
  // DELETE:
  async setClipboard(id: number): Promise<void> {
    await this.bridge.setClipboard(id);
    await this.bridge.hidePopup();
  }
  ```

- [ ] **Run type-check**

  ```
  pnpm exec tsc --noEmit 2>&1 | head -20
  ```
  Expected: errors only for the call sites that still reference `setClipboard` / `setClipboardText` — these are fixed in the next task.

- [ ] **Commit**

  ```
  git add src/app/core/services/tauri-bridge.service.ts src/app/core/services/clipboard.service.ts
  git commit -m "feat(frontend): replace setClipboard/setClipboardText with pasteEntryAndClose/pasteTextAndClose"
  ```

---

### Task 5: Update all paste call sites in Angular components

**Files:**
- Modify: `src/app/features/clipboard-list/clipboard-tab.component.ts`
- Modify: `src/app/features/clipboard-list/snippets-tab.component.ts`
- Modify: `src/app/features/image-preview/image-preview.component.ts`

- [ ] **Update `clipboard-tab.component.ts` — entry selection (line ~332)**

  Find `selectEntry` method. Replace:
  ```ts
  } else {
    this.clipboard.setClipboard(entry.id);
  }
  ```
  with:
  ```ts
  } else {
    this.bridge.pasteEntryAndClose(entry.id);
  }
  ```
  (`this.bridge` is already injected in this component.)

- [ ] **Update `clipboard-tab.component.ts` — `onEditConfirm` (line ~401)**

  Replace:
  ```ts
  await this.bridge.setClipboardText(text);
  this.bridge.hidePopup();
  ```
  with:
  ```ts
  await this.bridge.pasteTextAndClose(text);
  ```

- [ ] **Update `clipboard-tab.component.ts` — `onTransformApplied` (line ~414)**

  Replace:
  ```ts
  await this.bridge.setClipboardText(event.transformedContent);
  this.bridge.hidePopup();
  ```
  with:
  ```ts
  await this.bridge.pasteTextAndClose(event.transformedContent);
  ```

- [ ] **Update `clipboard-tab.component.ts` — `onMergeApplied` (line ~588)**

  Replace:
  ```ts
  await this.bridge.setClipboardText(merged);
  this.bridge.hidePopup();
  ```
  with:
  ```ts
  await this.bridge.pasteTextAndClose(merged);
  ```

- [ ] **Update `snippets-tab.component.ts` — placeholder-confirmed paste (line ~434)**

  Find the method that handles confirmed placeholder overlay paste. Replace:
  ```ts
  await this.bridge.setClipboardText(text);
  this.bridge.hidePopup();
  ```
  with:
  ```ts
  await this.bridge.pasteTextAndClose(text);
  ```

- [ ] **Update `snippets-tab.component.ts` — `pasteOrOverlaySnippet` (line ~506)**

  Replace:
  ```ts
  this.bridge.setClipboardText(snippet.content).then(() => this.bridge.hidePopup());
  ```
  with:
  ```ts
  this.bridge.pasteTextAndClose(snippet.content);
  ```

- [ ] **Update `image-preview.component.ts` — `copyToClipboard` (line ~140)**

  Replace:
  ```ts
  await this.bridge.setClipboard(this.entryId());
  await this.bridge.hidePopup();
  ```
  with:
  ```ts
  await this.bridge.pasteEntryAndClose(this.entryId());
  ```

- [ ] **Run type-check — should now be clean**

  ```
  pnpm exec tsc --noEmit 2>&1 | head -20
  ```
  Expected: no output.

- [ ] **Run the existing Angular unit tests**

  ```
  pnpm test --watch=false 2>&1 | tail -20
  ```
  Expected: all tests pass. If any test mocks `setClipboard` or `setClipboardText` on `TauriBridgeService`, update those mocks to use `pasteEntryAndClose` / `pasteTextAndClose` instead.

- [ ] **Commit**

  ```
  git add src/app/features/clipboard-list/clipboard-tab.component.ts src/app/features/clipboard-list/snippets-tab.component.ts src/app/features/image-preview/image-preview.component.ts
  git commit -m "feat(frontend): migrate all paste call sites to pasteEntryAndClose/pasteTextAndClose"
  ```

---

### Task 6: Add the Auto-Paste toggle to the History settings section

**Files:**
- Modify: `src/app/features/settings/sections/history.component.ts`
- Modify: `src/app/features/settings/settings.component.ts`
- Modify: `src/app/i18n/en.ts`
- Modify: `src/app/i18n/de.ts`

- [ ] **Add `AUTO_PASTE_LABEL` to `en.ts`**

  In `src/app/i18n/en.ts`, inside the `SETTINGS` block, add after `UPDATES_AUTO_CHECK_LABEL`:
  ```ts
  AUTO_PASTE_LABEL: 'Auto-Paste',
  ```

- [ ] **Add `AUTO_PASTE_LABEL` to `de.ts`**

  In `src/app/i18n/de.ts`, inside the `SETTINGS` block, add after `UPDATES_AUTO_CHECK_LABEL`:
  ```ts
  AUTO_PASTE_LABEL: 'Auto-Einfügen',
  ```

- [ ] **Add `autoPaste` to `HistorySettings` and the component in `history.component.ts`**

  Replace the `HistorySettings` type:
  ```ts
  export type HistorySettings = Pick<
    AppSettings,
    'maxEntries' | 'deleteAfterMaxEntries' | 'maxDays' | 'deleteAfterDays' | 'autoPaste'
  >;
  ```

  Add the toggle row to the template, inside the `<div class="divide-y divide-border/60">` container, after the existing two rows:
  ```html
  <div class="flex items-center justify-between gap-4 py-3.5">
    <label class="text-[13px] text-foreground" for="auto-paste-switch">
      {{ 'SETTINGS.AUTO_PASTE_LABEL' | translate }}
    </label>
    <hlm-switch
      id="auto-paste-switch"
      [checked]="settings().autoPaste"
      (checkedChange)="onAutoPasteChange($event)"
    />
  </div>
  ```

  Add the handler method to the class:
  ```ts
  protected onAutoPasteChange(checked: boolean): void {
    this.settings.update((s) => ({ ...s, autoPaste: checked }));
  }
  ```

- [ ] **Add `autoPaste` to `historySlice` in `settings.component.ts`**

  Find `historySlice` (around line 196). Replace:
  ```ts
  protected readonly historySlice = computed(() => ({
    maxEntries: this.settings().maxEntries,
    deleteAfterMaxEntries: this.settings().deleteAfterMaxEntries,
    maxDays: this.settings().maxDays,
    deleteAfterDays: this.settings().deleteAfterDays,
  }));
  ```
  with:
  ```ts
  protected readonly historySlice = computed(() => ({
    maxEntries: this.settings().maxEntries,
    deleteAfterMaxEntries: this.settings().deleteAfterMaxEntries,
    maxDays: this.settings().maxDays,
    deleteAfterDays: this.settings().deleteAfterDays,
    autoPaste: this.settings().autoPaste,
  }));
  ```

- [ ] **Run type-check**

  ```
  pnpm exec tsc --noEmit 2>&1 | head -20
  ```
  Expected: no output.

- [ ] **Run all Angular unit tests**

  ```
  pnpm test --watch=false 2>&1 | tail -20
  ```
  Expected: all pass.

- [ ] **Commit**

  ```
  git add src/app/features/settings/sections/history.component.ts src/app/features/settings/settings.component.ts src/app/i18n/en.ts src/app/i18n/de.ts
  git commit -m "feat(frontend): add Auto-Paste toggle to History settings section"
  ```

---

### Task 7: Format changed TypeScript files with Prettier

**Files:** all `.ts` files modified in Tasks 3–6.

- [ ] **Run Prettier on all modified TypeScript files**

  ```
  pnpm exec prettier --write src/app/core/models/settings.model.ts src/app/core/services/tauri-bridge.service.ts src/app/core/services/clipboard.service.ts src/app/features/clipboard-list/clipboard-tab.component.ts src/app/features/clipboard-list/snippets-tab.component.ts src/app/features/image-preview/image-preview.component.ts src/app/features/settings/sections/history.component.ts src/app/features/settings/settings.component.ts src/app/i18n/en.ts src/app/i18n/de.ts
  ```

- [ ] **Commit any formatting changes**

  ```
  git add -u
  git diff --cached --stat
  git commit -m "style: format auto-paste changes with prettier" --allow-empty-message
  ```
  (Only commit if `git diff --cached --stat` shows changes. If nothing changed, skip the commit.)

---

### Task 8: Smoke-test the full feature end-to-end

- [ ] **Build and launch the dev app**

  ```
  pnpm tauri dev
  ```

- [ ] **Verify Auto-Paste toggle appears in Settings → History**

  Open Settings (tray or shortcut), navigate to History. Confirm "Auto-Paste" / "Auto-Einfügen" toggle is visible and defaults to on.

- [ ] **Verify paste works with the toggle on**

  1. Focus a text editor (e.g. Notepad).
  2. Copy some text into the clipboard.
  3. Press the Yank shortcut to open the popup.
  4. Select any history entry.
  5. The popup closes and the selected text is pasted into Notepad automatically.

- [ ] **Verify paste is suppressed with the toggle off**

  1. Turn Auto-Paste off in settings.
  2. Focus Notepad, press the Yank shortcut, select an entry.
  3. The popup closes but nothing is pasted — only the clipboard is updated.

- [ ] **Verify Escape does not auto-paste**

  1. Turn Auto-Paste on.
  2. Open the popup and press Escape.
  3. The popup closes, nothing is pasted.

- [ ] **Verify snippets paste**

  Select a snippet from the Snippets tab — confirm it auto-pastes when the toggle is on.

- [ ] **Verify image copy**

  Select an image entry from the clipboard list — confirm the popup closes (auto-paste fires, though it will only actually paste in apps that accept images).
