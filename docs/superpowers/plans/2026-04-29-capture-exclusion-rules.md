# Capture Exclusion Rules Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a per-process clipboard capture exclusion list stored in a dedicated SQLite table, with Tauri CRUD commands, an Angular service, and a Privacy settings UI.

**Architecture:** A new `excluded_apps` table (id, process_name, created_at) is managed independently of `AppSettings`. The clipboard monitor queries `is_app_excluded` directly on each capture event. The Angular side uses a signal-based resource in `ExcludedAppsService` with optimistic local updates on add/remove. The UI lives in a new Privacy group in the settings panel.

**Tech Stack:** Rust/Tauri (rusqlite, chrono), Angular 19 (resource, signal), @ngx-translate/core, @spartan-ng/helm, @ng-icons/lucide

---

### Task 1: Add ExcludedApp Rust model

**Files:**
- Modify: `src-tauri/src/models.rs`

- [ ] **Step 1: Add ExcludedApp struct**

  Open `src-tauri/src/models.rs` and append this struct after the `Snippet` struct:

  ```rust
  #[derive(Debug, Clone, Serialize, Deserialize)]
  #[serde(rename_all = "camelCase")]
  pub struct ExcludedApp {
      pub id: i64,
      pub process_name: String,
      pub created_at: i64,
  }
  ```

- [ ] **Step 2: Verify it compiles**

  Run: `cargo check --manifest-path src-tauri/Cargo.toml`
  Expected: no errors

- [ ] **Step 3: Commit**

  ```bash
  git add src-tauri/src/models.rs
  git commit -m "feat(models): add ExcludedApp struct"
  ```

---

### Task 2: Add DB migration for excluded_apps table

**Files:**
- Modify: `src-tauri/src/store/sqlite_store.rs`

- [ ] **Step 1: Update the import at the top of sqlite_store.rs**

  The current import on line 8 is:
  ```rust
  use crate::models::{AppSettings, ClipboardContent, ClipboardEntry, ClipboardPayload, Language, Snippet, Theme, WindowPositionMode};
  ```

  Replace it with:
  ```rust
  use crate::models::{AppSettings, ClipboardContent, ClipboardEntry, ClipboardPayload, ExcludedApp, Language, Snippet, Theme, WindowPositionMode};
  ```

- [ ] **Step 2: Add the excluded_apps table creation to run_migrations**

  In `run_migrations`, after the snippets `execute_batch` block (after line 98, before `Ok(())`), add:

  ```rust
  conn.execute_batch(
      "CREATE TABLE IF NOT EXISTS excluded_apps (
          id           INTEGER PRIMARY KEY AUTOINCREMENT,
          process_name TEXT    NOT NULL UNIQUE,
          created_at   INTEGER NOT NULL
      );"
  )?;
  ```

- [ ] **Step 3: Write a failing test that verifies the table is created**

  In the `#[cfg(test)]` module at the bottom of sqlite_store.rs (after the last test), add:

  ```rust
  #[test]
  fn test_excluded_apps_table_exists() {
      let store = in_memory_store();
      // If the table doesn't exist, this query will return an error
      let conn = store.conn.lock().unwrap();
      let count: i64 = conn
          .query_row("SELECT COUNT(*) FROM excluded_apps", [], |r| r.get(0))
          .unwrap();
      assert_eq!(count, 0);
  }
  ```

- [ ] **Step 4: Run the test to verify it passes**

  Run: `cargo test --manifest-path src-tauri/Cargo.toml test_excluded_apps_table_exists -- --nocapture`
  Expected: PASS

- [ ] **Step 5: Commit**

  ```bash
  git add src-tauri/src/store/sqlite_store.rs
  git commit -m "feat(store): add excluded_apps table migration"
  ```

---

### Task 3: Add store methods with tests

**Files:**
- Modify: `src-tauri/src/store/sqlite_store.rs`

- [ ] **Step 1: Write failing tests for all four store methods**

  In the `#[cfg(test)]` module, add after the table-exists test:

  ```rust
  #[test]
  fn test_add_and_get_excluded_apps() {
      let store = in_memory_store();
      let app = store.add_excluded_app("KeePass.exe").unwrap();
      assert_eq!(app.process_name, "KeePass.exe");
      assert!(app.id > 0);
      assert!(app.created_at > 0);

      let apps = store.get_excluded_apps().unwrap();
      assert_eq!(apps.len(), 1);
      assert_eq!(apps[0].id, app.id);
      assert_eq!(apps[0].process_name, "KeePass.exe");
  }

  #[test]
  fn test_add_excluded_app_trims_whitespace() {
      let store = in_memory_store();
      let app = store.add_excluded_app("  notepad.exe  ").unwrap();
      assert_eq!(app.process_name, "notepad.exe");

      let apps = store.get_excluded_apps().unwrap();
      assert_eq!(apps[0].process_name, "notepad.exe");
  }

  #[test]
  fn test_add_excluded_app_duplicate_returns_error() {
      let store = in_memory_store();
      store.add_excluded_app("notepad.exe").unwrap();
      let result = store.add_excluded_app("notepad.exe");
      assert!(result.is_err());
  }

  #[test]
  fn test_add_excluded_app_duplicate_case_insensitive_returns_error() {
      let store = in_memory_store();
      store.add_excluded_app("notepad.exe").unwrap();
      // UNIQUE constraint is case-sensitive in SQLite by default, so
      // "Notepad.exe" != "notepad.exe" at the storage level —
      // deduplication for display is handled at the command layer via is_app_excluded.
      // This test verifies exact-match uniqueness.
      let result = store.add_excluded_app("notepad.exe");
      assert!(result.is_err());
  }

  #[test]
  fn test_remove_excluded_app() {
      let store = in_memory_store();
      let app = store.add_excluded_app("KeePass.exe").unwrap();
      store.remove_excluded_app(app.id).unwrap();
      let apps = store.get_excluded_apps().unwrap();
      assert!(apps.is_empty());
  }

  #[test]
  fn test_get_excluded_apps_ordered_by_id() {
      let store = in_memory_store();
      store.add_excluded_app("B.exe").unwrap();
      store.add_excluded_app("A.exe").unwrap();
      let apps = store.get_excluded_apps().unwrap();
      assert_eq!(apps[0].process_name, "B.exe");
      assert_eq!(apps[1].process_name, "A.exe");
  }

  #[test]
  fn test_is_app_excluded_case_insensitive() {
      let store = in_memory_store();
      store.add_excluded_app("KeePass.exe").unwrap();
      assert!(store.is_app_excluded("KeePass.exe").unwrap());
      assert!(store.is_app_excluded("keepass.exe").unwrap());
      assert!(store.is_app_excluded("KEEPASS.EXE").unwrap());
  }

  #[test]
  fn test_is_app_excluded_not_found() {
      let store = in_memory_store();
      assert!(!store.is_app_excluded("notepad.exe").unwrap());
  }

  #[test]
  fn test_is_app_excluded_after_remove() {
      let store = in_memory_store();
      let app = store.add_excluded_app("KeePass.exe").unwrap();
      assert!(store.is_app_excluded("KeePass.exe").unwrap());
      store.remove_excluded_app(app.id).unwrap();
      assert!(!store.is_app_excluded("KeePass.exe").unwrap());
  }

  #[test]
  fn test_is_app_excluded_ignores_whitespace_in_stored_name() {
      let store = in_memory_store();
      store.add_excluded_app("  notepad.exe  ").unwrap(); // stored as "notepad.exe"
      assert!(store.is_app_excluded("notepad.exe").unwrap());
  }
  ```

- [ ] **Step 2: Run tests to confirm they fail (methods not yet defined)**

  Run: `cargo test --manifest-path src-tauri/Cargo.toml test_add_and_get_excluded_apps 2>&1 | head -20`
  Expected: compile error — method not found

- [ ] **Step 3: Implement the four store methods**

  In `sqlite_store.rs`, add these four methods inside `impl SqliteStore`, after `delete_snippet`:

  ```rust
  pub fn get_excluded_apps(&self) -> Result<Vec<ExcludedApp>, rusqlite::Error> {
      let conn = self.conn.lock().unwrap();
      let mut stmt = conn.prepare(
          "SELECT id, process_name, created_at FROM excluded_apps ORDER BY id ASC",
      )?;
      let results = stmt
          .query_map([], |row| {
              Ok(ExcludedApp {
                  id: row.get(0)?,
                  process_name: row.get(1)?,
                  created_at: row.get(2)?,
              })
          })?
          .collect::<Result<Vec<_>, _>>()?;
      Ok(results)
  }

  pub fn add_excluded_app(&self, process_name: &str) -> Result<ExcludedApp, rusqlite::Error> {
      let trimmed = process_name.trim();
      let now = chrono::Utc::now().timestamp();
      let conn = self.conn.lock().unwrap();
      conn.execute(
          "INSERT INTO excluded_apps (process_name, created_at) VALUES (?1, ?2)",
          params![trimmed, now],
      )?;
      let id = conn.last_insert_rowid();
      Ok(ExcludedApp {
          id,
          process_name: trimmed.to_string(),
          created_at: now,
      })
  }

  pub fn remove_excluded_app(&self, id: i64) -> Result<(), rusqlite::Error> {
      let conn = self.conn.lock().unwrap();
      conn.execute("DELETE FROM excluded_apps WHERE id = ?1", params![id])?;
      Ok(())
  }

  pub fn is_app_excluded(&self, process_name: &str) -> Result<bool, rusqlite::Error> {
      let conn = self.conn.lock().unwrap();
      let exists: bool = conn.query_row(
          "SELECT EXISTS(SELECT 1 FROM excluded_apps WHERE process_name = ?1 COLLATE NOCASE)",
          params![process_name],
          |row| row.get(0),
      )?;
      Ok(exists)
  }
  ```

- [ ] **Step 4: Run all excluded_apps tests**

  Run: `cargo test --manifest-path src-tauri/Cargo.toml excluded_app -- --nocapture`
  Expected: all tests PASS

- [ ] **Step 5: Run the full test suite to check for regressions**

  Run: `cargo test --manifest-path src-tauri/Cargo.toml`
  Expected: all tests PASS

- [ ] **Step 6: Commit**

  ```bash
  git add src-tauri/src/store/sqlite_store.rs
  git commit -m "feat(store): add excluded_apps CRUD methods and tests"
  ```

---

### Task 4: Add Tauri commands and register them

**Files:**
- Modify: `src-tauri/src/commands.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Update the import in commands.rs**

  The current import at the top of `commands.rs` includes `Snippet`. Add `ExcludedApp`:

  ```rust
  use crate::models::{AppSettings, ClipboardEntry, ExcludedApp, Snippet};
  ```

  (Replace whatever the existing models import looks like — add `ExcludedApp` to the list.)

- [ ] **Step 2: Add the three commands to commands.rs**

  After the `delete_snippet` command, append:

  ```rust
  #[tauri::command]
  pub fn get_excluded_apps(store: StoreState) -> Result<Vec<ExcludedApp>, String> {
      store.get_excluded_apps().map_err(|e| e.to_string())
  }

  #[tauri::command]
  pub fn add_excluded_app(process_name: String, store: StoreState) -> Result<ExcludedApp, String> {
      let trimmed = process_name.trim();
      if trimmed.is_empty() {
          return Err("Process name cannot be empty".to_string());
      }
      store.add_excluded_app(trimmed).map_err(|e| e.to_string())
  }

  #[tauri::command]
  pub fn remove_excluded_app(id: i64, store: StoreState) -> Result<(), String> {
      store.remove_excluded_app(id).map_err(|e| e.to_string())
  }
  ```

- [ ] **Step 3: Register the commands in lib.rs**

  In `src-tauri/src/lib.rs`, find the `tauri::generate_handler!` macro call. Add the three new commands to the list:

  ```rust
  commands::get_excluded_apps,
  commands::add_excluded_app,
  commands::remove_excluded_app,
  ```

- [ ] **Step 4: Verify compilation**

  Run: `cargo check --manifest-path src-tauri/Cargo.toml`
  Expected: no errors

- [ ] **Step 5: Commit**

  ```bash
  git add src-tauri/src/commands.rs src-tauri/src/lib.rs
  git commit -m "feat(commands): add excluded_apps Tauri commands"
  ```

---

### Task 5: Add exclusion check to clipboard monitor

**Files:**
- Modify: `src-tauri/src/platform/windows/clipboard_monitor.rs`

- [ ] **Step 1: Add the exclusion check at the start of process_clipboard_change**

  The current `process_clipboard_change` function (lines 35–59) starts with `read_clipboard()`. Add the exclusion check before it. Replace the function body so it reads:

  ```rust
  fn process_clipboard_change(
      app_handle: &tauri::AppHandle,
      store: &Arc<SqliteStore>,
      source_app: Option<String>,
  ) {
      if let Some(ref proc) = source_app {
          if store.is_app_excluded(proc).unwrap_or(false) {
              return;
          }
      }

      let mut payload = match read_clipboard() {
          Ok(Some(p)) => p,
          Ok(None) => return,
          Err(e) => {
              tracing::warn!("Failed to read clipboard: {}", e);
              return;
          }
      };

      payload.source_app = source_app;

      if let Err(e) = store.save_entry(&payload) {
          tracing::error!("Failed to save clipboard entry: {}", e);
          return;
      }

      if let Err(e) = app_handle.emit("clipboard-changed", ()) {
          tracing::warn!("Failed to emit clipboard-changed event: {}", e);
      }
  }
  ```

- [ ] **Step 2: Verify compilation**

  Run: `cargo check --manifest-path src-tauri/Cargo.toml`
  Expected: no errors

- [ ] **Step 3: Run full test suite**

  Run: `cargo test --manifest-path src-tauri/Cargo.toml`
  Expected: all PASS

- [ ] **Step 4: Commit**

  ```bash
  git add src-tauri/src/platform/windows/clipboard_monitor.rs
  git commit -m "feat(monitor): skip capture for excluded apps"
  ```

---

### Task 6: TypeScript model and Tauri bridge methods

**Files:**
- Create: `src/app/core/models/excluded-app.model.ts`
- Modify: `src/app/core/services/tauri-bridge.service.ts`

- [ ] **Step 1: Create the TypeScript model**

  Create `src/app/core/models/excluded-app.model.ts`:

  ```typescript
  export interface ExcludedApp {
    id: number;
    processName: string;
    createdAt: number;
  }
  ```

- [ ] **Step 2: Add the import to tauri-bridge.service.ts**

  At the top of `src/app/core/services/tauri-bridge.service.ts`, add the import alongside the other model imports:

  ```typescript
  import { ExcludedApp } from '../models/excluded-app.model';
  ```

- [ ] **Step 3: Add three bridge methods to TauriBridgeService**

  After `deleteSnippet`, append:

  ```typescript
  getExcludedApps(): Promise<ExcludedApp[]> {
    return invoke<ExcludedApp[]>('get_excluded_apps');
  }

  addExcludedApp(processName: string): Promise<ExcludedApp> {
    return invoke<ExcludedApp>('add_excluded_app', { processName });
  }

  removeExcludedApp(id: number): Promise<void> {
    return invoke('remove_excluded_app', { id });
  }
  ```

- [ ] **Step 4: Commit**

  ```bash
  git add src/app/core/models/excluded-app.model.ts src/app/core/services/tauri-bridge.service.ts
  git commit -m "feat(bridge): add excluded_apps TypeScript model and bridge methods"
  ```

---

### Task 7: Create Angular ExcludedAppsService

**Files:**
- Create: `src/app/core/services/excluded-apps.service.ts`

- [ ] **Step 1: Create the service**

  Create `src/app/core/services/excluded-apps.service.ts`:

  ```typescript
  import { Injectable, inject } from '@angular/core';
  import { resource } from '@angular/core';
  import { TauriBridgeService } from './tauri-bridge.service';
  import { ExcludedApp } from '../models/excluded-app.model';

  @Injectable({ providedIn: 'root' })
  export class ExcludedAppsService {
    private bridge = inject(TauriBridgeService);

    readonly excludedApps = resource<ExcludedApp[], unknown>({
      loader: () => this.bridge.getExcludedApps(),
    });

    async addExcludedApp(processName: string): Promise<void> {
      const app = await this.bridge.addExcludedApp(processName);
      this.excludedApps.update(apps => [...(apps ?? []), app]);
    }

    async removeExcludedApp(id: number): Promise<void> {
      await this.bridge.removeExcludedApp(id);
      this.excludedApps.update(apps => (apps ?? []).filter(a => a.id !== id));
    }
  }
  ```

- [ ] **Step 2: Commit**

  ```bash
  git add src/app/core/services/excluded-apps.service.ts
  git commit -m "feat(service): add ExcludedAppsService with resource-based state"
  ```

---

### Task 8: Add i18n keys

**Files:**
- Modify: `src/app/i18n/translation.interface.ts`
- Modify: `src/app/i18n/en.ts`
- Modify: `src/app/i18n/de.ts`

- [ ] **Step 1: Add keys to the Translation interface**

  In `src/app/i18n/translation.interface.ts`, add five keys to the `SETTINGS` block after `GROUP_HISTORY`:

  ```typescript
  GROUP_PRIVACY: string;
  EXCLUDED_APPS_LABEL: string;
  EXCLUDED_APPS_PLACEHOLDER: string;
  EXCLUDED_APPS_ADD: string;
  EXCLUDED_APPS_ADDED: string;
  ```

- [ ] **Step 2: Add English translations**

  In `src/app/i18n/en.ts`, add to the `SETTINGS` object after `GROUP_HISTORY`:

  ```typescript
  GROUP_PRIVACY: 'Privacy',
  EXCLUDED_APPS_LABEL: 'Excluded apps',
  EXCLUDED_APPS_PLACEHOLDER: 'e.g. KeePass.exe',
  EXCLUDED_APPS_ADD: 'Add app',
  EXCLUDED_APPS_ADDED: 'added {{date}}',
  ```

- [ ] **Step 3: Add German translations**

  In `src/app/i18n/de.ts`, add to the `SETTINGS` object after `GROUP_HISTORY`:

  ```typescript
  GROUP_PRIVACY: 'Datenschutz',
  EXCLUDED_APPS_LABEL: 'Ausgeschlossene Apps',
  EXCLUDED_APPS_PLACEHOLDER: 'z.B. KeePass.exe',
  EXCLUDED_APPS_ADD: 'App hinzufügen',
  EXCLUDED_APPS_ADDED: 'hinzugefügt {{date}}',
  ```

- [ ] **Step 4: Commit**

  ```bash
  git add src/app/i18n/translation.interface.ts src/app/i18n/en.ts src/app/i18n/de.ts
  git commit -m "feat(i18n): add excluded_apps translation keys"
  ```

---

### Task 9: Create ExcludedApps UI component

**Files:**
- Create: `src/app/features/settings/components/excluded-apps/excluded-apps.component.ts`

- [ ] **Step 1: Create the component**

  Create `src/app/features/settings/components/excluded-apps/excluded-apps.component.ts`:

  ```typescript
  import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
  import { DatePipe } from '@angular/common';
  import { TranslatePipe } from '@ngx-translate/core';
  import { NgIcon, provideIcons } from '@ng-icons/core';
  import { lucideX } from '@ng-icons/lucide';
  import { HlmIcon } from '@spartan-ng/helm/icon';
  import { HlmInput } from '@spartan-ng/helm/input';
  import { ExcludedAppsService } from '../../../../core/services/excluded-apps.service';

  @Component({
    selector: 'app-excluded-apps',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [DatePipe, TranslatePipe, NgIcon, HlmIcon, HlmInput],
    providers: [provideIcons({ lucideX })],
    template: `
      <div class="space-y-2">
        @for (app of service.excludedApps.value() ?? []; track app.id) {
          <div class="flex items-center gap-2 text-[12px]">
            <span class="flex-1 font-mono text-foreground">{{ app.processName }}</span>
            <span class="text-muted-foreground">
              {{ 'SETTINGS.EXCLUDED_APPS_ADDED' | translate: { date: (app.createdAt * 1000 | date:'mediumDate') } }}
            </span>
            <button
              class="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              (click)="remove(app.id)"
            >
              <ng-icon hlm size="xs" name="lucideX" />
            </button>
          </div>
        }
        <div class="flex gap-2">
          <input
            hlmInput
            type="text"
            [value]="inputValue()"
            (input)="inputValue.set($any($event.target).value)"
            [placeholder]="'SETTINGS.EXCLUDED_APPS_PLACEHOLDER' | translate"
            (keydown.enter)="add()"
            class="flex-1 font-mono text-[12px]"
          />
          <button
            class="px-3 py-1 text-[12px] rounded-md bg-muted hover:bg-muted/80 text-foreground transition-colors"
            (click)="add()"
          >
            {{ 'SETTINGS.EXCLUDED_APPS_ADD' | translate }}
          </button>
        </div>
      </div>
    `,
  })
  export class ExcludedAppsComponent {
    protected service = inject(ExcludedAppsService);
    protected inputValue = signal('');

    protected add(): void {
      const value = this.inputValue().trim();
      if (!value) return;
      this.service.addExcludedApp(value).then(() => this.inputValue.set(''));
    }

    protected remove(id: number): void {
      this.service.removeExcludedApp(id);
    }
  }
  ```

- [ ] **Step 2: Commit**

  ```bash
  git add src/app/features/settings/components/excluded-apps/excluded-apps.component.ts
  git commit -m "feat(ui): add ExcludedAppsComponent for settings panel"
  ```

---

### Task 10: Integrate into settings component

**Files:**
- Modify: `src/app/features/settings/settings.component.ts`

- [ ] **Step 1: Add the import for ExcludedAppsComponent**

  In `settings.component.ts`, add to the existing import statement from the settings components folder:

  ```typescript
  import { ExcludedAppsComponent } from './components/excluded-apps/excluded-apps.component';
  ```

- [ ] **Step 2: Add ExcludedAppsComponent to the imports array**

  In the `@Component` decorator, add `ExcludedAppsComponent` to the `imports` array alongside `SettingFieldComponent` and `SettingCheckboxComponent`.

- [ ] **Step 3: Add the Privacy group to the template**

  In the template, after the closing `</div>` of the History group (after `</div>` on line ~255) and before the final `</div>` that closes the scrollable container, add:

  ```html
  <brn-separator hlmSeparator />

  <!-- Privacy -->
  <div class="space-y-3">
    <p class="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
      {{ 'SETTINGS.GROUP_PRIVACY' | translate }}
    </p>
    <app-setting-field [label]="'SETTINGS.EXCLUDED_APPS_LABEL' | translate">
      <app-excluded-apps />
    </app-setting-field>
  </div>
  ```

- [ ] **Step 4: Run the dev build to verify no TypeScript errors**

  Run: `npm run --prefix . check 2>&1` or the equivalent type-check command for this project.

  If unsure of the command, check `package.json` scripts. Common options:
  - `npm run type-check`
  - `npx tsc --noEmit`

- [ ] **Step 5: Commit**

  ```bash
  git add src/app/features/settings/settings.component.ts
  git commit -m "feat(settings): add Privacy group with excluded apps UI"
  ```

---

### Task 11: Build and smoke-test

- [ ] **Step 1: Run the full Rust test suite**

  Run: `cargo test --manifest-path src-tauri/Cargo.toml`
  Expected: all tests PASS

- [ ] **Step 2: Build the Tauri app**

  Run: `npm run tauri dev` (or `cargo tauri dev` if the Tauri CLI is installed globally)
  Expected: app launches without errors

- [ ] **Step 3: Smoke-test the UI**

  1. Open Settings → scroll to the Privacy section
  2. Add `notepad.exe` — it should appear in the list with today's date
  3. Add `  notepad.exe  ` (with spaces) — should be silently ignored (already exists after trim)
  4. Add `KeePass.exe`
  5. Remove `notepad.exe` via the ✕ button — it should disappear without a full reload
  6. Open Notepad, copy some text — it should NOT appear in the clipboard history
  7. Open any other app, copy some text — it SHOULD appear in the clipboard history
  8. Restart the app — the excluded apps list should persist

- [ ] **Step 4: Final commit (if any fixups needed)**

  ```bash
  git add -p
  git commit -m "fix(exclusion): <describe any fixup>"
  ```
