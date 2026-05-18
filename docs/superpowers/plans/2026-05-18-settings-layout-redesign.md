# Settings Layout Redesign Implementation Plan

> **Retrospective backfill.** This plan documents work that has already shipped in commit `c7e5561` (2026-05-18). It is recorded here so the specs/plans index stays consistent. Every checkbox is marked done.

**Spec:** [2026-05-18-settings-layout-redesign-design.md](../specs/2026-05-18-settings-layout-redesign-design.md)

**Goal:** Move the standalone settings window from a 500 px single-scroll flat list to a more spacious 880×680 sidebar layout, with one section visible at a time. Keep the six existing groups (General, Appearance, History, Privacy, Updates, Statistics); refactor the monolithic `SettingsComponent` into a thin host + six dumb section components; drive the active section from a `?section=` query param so the URL is the source of truth and the standalone window can be deep-linked.

**Architecture:** Host + section components. `SettingsComponent` owns canonical state (a `linkedSignal<AppSettings>` mirroring `SettingsService.settings.value()`) and persistence. Each section is a standalone presentational component under `features/settings/sections/`, bound via `model.required<SliceType>()` (slice types are `Pick<AppSettings, ...>` derivatives, not the inverse). Section metadata lives in `sections/sections.ts` as a single `const SECTIONS = { ... } as const`, with `type SectionKey = keyof typeof SECTIONS`. The `@switch` block in the host template mounts exactly one section at a time. Statistics injects `StatsService` directly and skips the model since it owns no `AppSettings` fields.

**Tech stack:** Angular 21 (signals, standalone components, `model.required`, `linkedSignal`, `toSignal`), Tauri 2 (async command for window creation — see Task 6).

---

## File Structure

**New:**
- `src/app/features/settings/sections/sections.ts` — `SECTIONS` const, `SectionKey`, `SECTION_KEYS`, `isSectionKey` guard.
- `src/app/features/settings/sections/general.component.ts` — `model.required<GeneralSettings>` + shortcut/autostart/window-position fields.
- `src/app/features/settings/sections/appearance.component.ts` — `model.required<AppearanceSettings>` + `ThemeService` / `I18nService` side effects.
- `src/app/features/settings/sections/history.component.ts` — `model.required<HistorySettings>` + clamping rules.
- `src/app/features/settings/sections/privacy.component.ts` — `model.required<PrivacySettings>` + embedded `<app-excluded-apps>`.
- `src/app/features/settings/sections/updates.component.ts` — `model.required<UpdatesSettings>` + `UpdaterService`.
- `src/app/features/settings/sections/statistics.component.ts` — no model; owns danger-zone confirm-input state, calls `StatsService`.

**Modified:**
- `src/app/features/settings/settings.component.ts` — collapse from a long flat template into a thin host (~210 lines): `<app-page-header>` + sidebar nav + `@switch (activeSection())`. Computeds for each section slice; one generic `onSectionChange(slice: Partial<AppSettings>)` handler merges and persists; `activeSection` derived via `toSignal(route.queryParamMap) + computed()`.
- `src/app/features/clipboard-list/clipboard-list.component.ts` — gear icon becomes a `<button>` calling `bridge.openSettingsWindow()` (removed `RouterLink` import). The pause switch keeps `data-[state=checked]:bg-green-500 data-[state=unchecked]:bg-red-500` at the use-site.
- `src/app/core/services/tauri-bridge.service.ts` — add `openSettingsWindow()`.
- `src/libs/ui/switch/src/lib/hlm-switch.ts` — default switch colours reverted from green/red to the neutral shadcn pair (`data-[state=checked]:bg-primary data-[state=unchecked]:bg-input`).
- `src/app/features/settings/components/shortcut-input/shortcut-capture-guard.directive.ts` — implement `OnDestroy` and reset the global `PauseCapture::editing_shortcut` atomic on teardown (defensive cleanup; see Task 5).
- `src-tauri/src/commands.rs` — `open_settings_window` registered as **`async fn`** (see Task 6).
- `src-tauri/src/lib.rs` — register the command in the invoke handler.
- `src-tauri/src/windows.rs` — `open_settings` builder: 880×680, `.resizable(false)`, `.decorations(false)`, `.center()`, `.initialization_script("window.location.hash = '#/settings';")`.

**Deleted:**
- `src/app/features/settings/components/setting-field/` (component + spec).
- `src/app/features/settings/components/setting-checkbox/` (component + spec).
  The flat-list wrappers no longer have a home — inline label-left / control-right rows live directly in each section template separated by `divide-y divide-border/60`.

---

## Tasks

The work shipped as a single squashed commit `c7e5561 feat(settings): redesign layout with sidebar + section components`. The task breakdown below records the logical units inside that commit.

### Task 1: Section components and metadata

- [x] Create `sections/sections.ts` with `const SECTIONS = { general, appearance, history, privacy, updates, statistics } as const`, each carrying `{ labelKey, icon }`. Export `SectionKey = keyof typeof SECTIONS`, `SECTION_KEYS = Object.keys(SECTIONS) as SectionKey[]`, and an `isSectionKey(value: string): value is SectionKey` guard.
- [x] Create the six section components under `sections/`. Each non-Statistics section: `selector: 'app-settings-<name>'`, standalone, `model.required<...Settings>()` input, write back via `this.settings.update(s => ({ ...s, field: value }))`. Statistics: no model, injects `StatsService`, owns danger-zone confirm-input state.
- [x] Export per-section slice types via `Pick<AppSettings, ...>`, e.g. `export type GeneralSettings = Pick<AppSettings, 'shortcut' | 'autostart' | 'windowPosition'>`.

### Task 2: Thin host + sidebar + `@switch`

- [x] Rewrite `settings.component.ts` template to:
  ```
  <app-page-header>            # title + close X (unconditional now)
  flex-row
  ├── aside (200px sidebar)    # iterates SECTIONS, click → router.navigate(..., { queryParams: { section } })
  └── main (overflow-y-auto, max-w-[600px] mx-auto px-8 py-7)
      ├── <h2>{{ SECTIONS[activeSection()].labelKey | translate }}</h2>
      └── @switch (activeSection())  → <app-settings-<name> [settings]=hostSlice() (settingsChange)=onSectionChange($event)>
  ```
- [x] Host owns `settings = linkedSignal<AppSettings>(...)` mirroring `SettingsService.settings.value()`, plus one `computed` slice per section.
- [x] `onSectionChange(slice: Partial<AppSettings>)` merges into full state and persists. One handler covers every section since each slice type is assignable to `Partial<AppSettings>`.
- [x] Derive `activeSection` from `route.queryParamMap` via `toSignal(...)` + `computed()` with `isSectionKey` validation; default to `'general'`.

### Task 3: Switch coloring fix

- [x] In `src/libs/ui/switch/src/lib/hlm-switch.ts`, reset defaults to neutral: `data-[state=checked]:bg-primary data-[state=unchecked]:bg-input` (was green/red).
- [x] In `src/app/features/clipboard-list/clipboard-list.component.ts`, opt the capture-pause switch into the green/red semantic at the use-site: `class="data-[state=checked]:bg-green-500 data-[state=unchecked]:bg-red-500"`. `tailwind-merge` (via the `hlm()` utility) dedupes the conflicting `bg-*` classes and keeps the override.

### Task 4: Popup gear button reroutes to the standalone window

- [x] Add `open_settings_window` to `src-tauri/src/commands.rs` and register it in `src-tauri/src/lib.rs`'s invoke handler. **Must be `async fn`** — see Task 6.
- [x] Add `openSettingsWindow()` to `TauriBridgeService`.
- [x] In `clipboard-list.component.ts`, switch the gear from `RouterLink` to a `<button>` that awaits `hidePopup()` and then calls `bridge.openSettingsWindow()`. The await is necessary because the popup is `alwaysOnTop: true`; without hiding it first, the new settings window opens *behind* the popup on Windows.
- [x] Keep the `/settings` route registered. It's no longer reachable from the popup, but the standalone window's initialization script still navigates to `#/settings` internally.

### Task 5: Defensive cleanup in `ShortcutCaptureGuardDirective`

- [x] In `shortcut-capture-guard.directive.ts`, implement `OnDestroy` and reset the global `PauseCapture::editing_shortcut` atomic in `ngOnDestroy`. The browser's blur event may not complete its IPC round-trip before the directive is torn down when the host input is removed (section switch, window close) while still focused — leaving the flag stuck at `true` silently disables every global shortcut, including the popup opener, leaving the app unrecoverable without restart.

### Task 6: Tauri window builder — fixed size, centered, async command

- [x] In `src-tauri/src/windows.rs`, rewrite `open_settings`:
  ```rust
  WebviewWindowBuilder::new(app, label, WebviewUrl::App("/".into()))
      .title("Settings")
      .inner_size(880.0, 680.0)
      .resizable(false)
      .decorations(false)
      .center()
      .initialization_script("window.location.hash = '#/settings';")
      .build()?;
  ```
- [x] **`open_settings_window` is declared `async fn`.** `WebviewWindowBuilder::build()` deadlocks when invoked from a *sync* Tauri command on Windows (symptom: permanently white new window; the worker thread holding the sync command also needs to drive event-loop steps that process window creation, so the build never completes). The tray-menu path doesn't hit this because menu events fire on the main thread. Documented in [`WebviewWindowBuilder::new`](https://docs.rs/tauri/latest/tauri/webview/struct.WebviewWindowBuilder.html#method.new) and [tauri-apps/tauri#13963](https://github.com/tauri-apps/tauri/issues/13963).
  ```rust
  #[tauri::command]
  pub async fn open_settings_window(app_handle: tauri::AppHandle) -> Result<(), String> {
      crate::windows::open_settings(&app_handle).map_err(|e| e.to_string())
  }
  ```
- [x] **`resizable` is `false` and `min_inner_size` is dropped.** With `decorations: false`, the OS draws no visible resize handles; the only way to resize would be to guess at a 1-pixel edge, and the combination appeared to trigger a WebView white-paint failure on Windows. If real user-driven resize is wanted later, the right shape is CSS-based drag regions inside the page, not OS edge resize on an undecorated window.
- [x] `.center()` added so the window opens centered on the active monitor rather than at the default top-left (which on some multi-monitor setups landed partially off-screen).

### Task 7: Delete the flat-list field wrappers

- [x] Remove `src/app/features/settings/components/setting-field/` (component + spec).
- [x] Remove `src/app/features/settings/components/setting-checkbox/` (component + spec).

### Task 8: Commit

- [x] Single squashed commit:
  ```bash
  git commit -m "feat(settings): redesign layout with sidebar + section components"
  ```

---

## Verification (performed)

- [x] Build: `pnpm build` succeeded with no TypeScript errors.
- [x] Manual smoke: settings window opens at 880×680, centered; sidebar navigation switches sections; `?section=privacy` deep-links work; reload preserves the active section; popup gear hides the popup before opening the settings window; section switches don't leak the `editing_shortcut` flag; all six section toggles read with neutral colouring while the clipboard-list pause toggle keeps green/red.

---

## Out of Scope (per spec)

- No new translation strings (sections reuse `SETTINGS.GROUP_*`; no section-level descriptions or hints).
- No restructuring of the six sections (no Storage/Capture/About merge).
- No search field in the sidebar.
- Not deriving `AppSettings` from section slice types — `AppSettings` remains the canonical persistence model mirrored in Rust; slices are derivatives.
- Not using a child `<router-outlet>` for sections; direct `<app-settings-*>` binding keeps sections pure dumb components.
- No inline `/settings` styling for the 480 px popup case — the route still works at narrow widths but is no longer reached by app navigation.
