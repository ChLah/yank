# Settings Layout Redesign

**Date:** 2026-05-18
**Status:** Implemented

## Problem

The settings page felt narrow and not as polished as it could be. It opened in
two contexts — inline in the 480 px popup and as a 500 px standalone window —
and used a single long vertical scroll separated by `brn-separator` hairlines
across six groups (General, Appearance, History, Privacy, Updates, Statistics).
The 500 px width was barely wider than the popup, and the flat list gave no
visual rhythm beyond the dividers.

## Goal

Move the standalone settings to a more spacious, navigable layout — sidebar on
the left, one section visible at a time — without restructuring what the
settings actually are.

## Decisions (from brainstorm)

| Topic | Decision |
|---|---|
| Window context | Standalone only — the popup gear no longer routes inline |
| Window size | 880 × 680 fixed (see "Resizable: dropped" below) |
| IA style | Left sidebar navigation, one section visible at a time |
| Section count | Unchanged — the six existing groups |
| Sidebar visuals | Lucide icon per section, no search field (v1) |
| Field rows | Inline label-left / control-right; switches for booleans |
| Switch coloring | Neutral default (`bg-primary` / `bg-input`) for general toggles |

## Verdict from the prototype

Three variants were built on the existing `/settings` route, switchable via
`?variant=` with a floating bottom pill (`isDevMode()` gate). The active
sidebar section was shared across variants so the same content could be
evaluated side-by-side.

- **A — macOS-style** *(winner).* Sidebar + calm hero per section + inline
  label-left / control-right rows. Hairline `divide-y` between rows. Switches
  for booleans, right-aligned. Content column capped at `max-w-[600px]`.
- **B — Card-grouped.** Sidebar + section hero + one or more `rounded-xl`
  cards per section. Too much chrome competing with the data for a settings
  surface this small; cards inside scrollable content read busy for sections
  with only two fields.
- **C — Dense rows (Linear-style).** Sidebar + tiny uppercase section labels
  + 36 px row stack with hover. Densest, but visually too close to *what the
  current design already is* — wouldn't fix the "not as beautiful" complaint.

A also surfaced an unrelated bug worth fixing: the base `HlmSwitch` had
`data-[state=checked]:bg-green-500 / data-[state=unchecked]:bg-red-500` baked
into its defaults. That semantic coloring should only apply to the
capture-pause toggle on the clipboard-list page, not to every boolean
preference in settings. Fix below.

## Architecture

**Host + section components.** `SettingsComponent` is a thin host: page
header, sidebar nav, section title, and the `@switch` that mounts one section
at a time. Each of the six sections is its own component under
`features/settings/sections/` (e.g. `SettingsGeneralComponent`,
`SettingsAppearanceComponent`, ...). Sections are dumb presentational
components — they receive a typed slice of `AppSettings` via
`model.required<SliceType>()` and emit changes; the host owns the canonical
state and persistence. Sections that need ambient services (`ThemeService`,
`I18nService`, `UpdaterService`, `StatsService`) inject them locally so their
side effects stay with the UI that triggers them.

**Slice types.** Each section exports its slice type via
`Pick<AppSettings, ...>`, e.g.
`export type GeneralSettings = Pick<AppSettings, 'shortcut' | 'autostart' |
'windowPosition'>`. `AppSettings` remains the canonical persistence type
in `core/models/settings.model.ts` (single source mirrored by Rust); the
slices are derivatives that express each section's dependency, not pieces
the whole is composed from.

**Section metadata.** `sections/sections.ts` exposes one `const SECTIONS = {
general: { labelKey, icon }, appearance: {...}, ... } as const`, with
`type SectionKey = keyof typeof SECTIONS`. The string-literal union and the
data stay in one place; iteration order is the object's insertion order.

**Section state via query param.** `activeSection` is derived from
`route.queryParamMap` (`?section=privacy`), via `toSignal(...) + computed()`.
Sidebar clicks call `router.navigate(..., { queryParams: { section } })`.
The URL is now the source of truth — section state survives reload, history
back/forward traverses sections, and the standalone window can be opened to
a specific section from outside (tray menu items, deep links) by passing
`#/settings?section=updates` in its initialization script.

**Routing.** The `/settings` route is retained and is still what the
standalone window navigates to via its initialization script. Since the
popup gear now opens the standalone window via Tauri, `SettingsComponent` is
only ever mounted inside the `settings` window — no inline/embedded path
remains, and the close-X button renders unconditionally.

**Window chrome.** Reuses the existing `<app-page-header>` for the title bar
(consistent drag region + chrome with the rest of the app). The sidebar sits
below the page header, not beside it.

## Component structure

```
SettingsComponent  (host, ~210 lines)
├── app-page-header                       (title + close X)
└── flex-row
    ├── aside (200px sidebar)
    │   └── nav buttons read from SECTIONS,
    │       (click) → router.navigate(..., { queryParams: { section } })
    └── main (overflow-y-auto, max-w-[600px] mx-auto px-8 py-7)
        ├── <h2>{{ SECTIONS[activeSection()].labelKey | translate }}</h2>
        └── @switch (activeSection())
            ├── @case 'general'     → <app-settings-general    [settings] (settingsChange)>
            ├── @case 'appearance'  → <app-settings-appearance [settings] (settingsChange)>
            ├── @case 'history'     → <app-settings-history    [settings] (settingsChange)>
            ├── @case 'privacy'     → <app-settings-privacy    [settings] (settingsChange)>
            ├── @case 'updates'     → <app-settings-updates    [settings] (settingsChange)>
            └── @case 'statistics'  → <app-settings-statistics />     (no slice)
```

### Data flow

1. Host owns `settings = linkedSignal<AppSettings>(...)` mirroring
   `SettingsService.settings.value()`.
2. Host exposes one `computed` slice per section
   (`generalSlice()`, `appearanceSlice()`, ...).
3. Section binds with `[settings]="hostSlice()"` and writes back via
   `this.settings.update(s => ({ ...s, field: value }))`, which causes
   `model.required` to emit `settingsChange`.
4. Host's `onSectionChange(slice: Partial<AppSettings>)` merges the slice
   into the full state and persists. One handler covers every section — each
   slice type is assignable to `Partial<AppSettings>`.

`Statistics` skips the model entirely (no `AppSettings` fields) — it injects
`StatsService` directly and owns its own danger-zone confirm input state.

### Section content patterns

- **Section header.** Rendered by the host above the section component
  (sections themselves don't repeat the title). `<h2 class="text-[15px]
  font-semibold">` with `mb-5` gap.
- **Simple field row.** `flex items-center justify-between gap-4 py-3.5`,
  label on the left (`text-[13px]`), control on the right
  (`w-[240px]`-class column or right-aligned switch). Rows separated by
  `divide-y divide-border/60`.
- **Field row with hint.** Label + hint stacked on the left (`text-[11px]
  text-muted-foreground mt-0.5` for the hint), control on the right.
- **Inputs with toggle.** History uses `<input type="number">` followed by an
  `<hlm-switch>` — input opacity drops to 50 % when the switch is off.
- **Long-form controls.** Excluded-apps and the danger-zone panel break out of
  the inline-row pattern, occupying full width below a label.

## Switch coloring fix

`HlmSwitch` is the shared switch primitive used in both clipboard-list (the
capture-pause toggle) and settings (autostart, auto-check-updates, history
toggles). The hardcoded green/red defaults were inappropriate for the
settings toggles. Resolution:

- `src/libs/ui/switch/src/lib/hlm-switch.ts`: defaults reset to the standard
  shadcn pair — `data-[state=checked]:bg-primary
  data-[state=unchecked]:bg-input`.
- `src/app/features/clipboard-list/clipboard-list.component.ts`: the
  capture-pause switch opts into the green/red semantic at the use-site via
  `class="data-[state=checked]:bg-green-500
  data-[state=unchecked]:bg-red-500"`. `tailwind-merge` (via the `hlm()`
  utility) dedupes the conflicting `bg-*` classes and keeps the override.

## Popup gear button rerouting

With the new layout requiring ≥ 760 px wide, the inline `/settings` path
inside the 480 px popup would have been broken. Resolution:

- New Tauri command `open_settings_window` in
  `src-tauri/src/commands.rs` (mirrors `open_image_preview`), registered in
  `src-tauri/src/lib.rs`'s invoke handler.
- New bridge method `TauriBridgeService.openSettingsWindow()`.
- `clipboard-list.component.ts`: the gear icon is now a `<button>` calling
  `bridge.openSettingsWindow()` (removed `RouterLink` import).

The `/settings` route itself still exists and is still what the standalone
window navigates to internally; it's just no longer reachable from the popup.

## Tauri window changes

`src-tauri/src/windows.rs` `open_settings`:

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

Was: `500 × 680`, `resizable(false)`.

### Resizable: dropped

The brainstorm picked resizable + `min_inner_size(760, 600)`, but with
`decorations: false` the OS draws no visible resize handles, so the only way
a user could resize would be by guessing at a 1-pixel edge. The combination
also appeared to cause a white-paint failure of the WebView on Windows in
practice. Reverted to `resizable(false)` and dropped `min_inner_size`. If
real user-driven resize is wanted later, the right shape is custom CSS-based
drag regions inside the page, not OS edge resize on an undecorated window.

Added `.center()` so the window opens centred on the active monitor rather
than at the default top-left, which on some multi-monitor setups landed
partially off-screen.

### Shortcut-capture-guard cleanup on destroy

The shortcut-capture-guard directive flips a global
`PauseCapture::editing_shortcut` atomic on focus to suppress global shortcut
handling while the user is typing a shortcut. If the host input is removed
(section switch, window close) while still focused, the browser's blur event
may not complete its IPC round-trip before the directive is torn down,
leaving the flag stuck at `true` and silently disabling every global
shortcut — including the popup opener, leaving the app unrecoverable without
restart.

`ShortcutCaptureGuardDirective` now implements `OnDestroy` and resets the
flag in `ngOnDestroy` as a defensive cleanup. Owning this in the directive
(rather than backend-side per-window logic) keeps the lifecycle reasoning
local to the thing that set the flag in the first place.

### Hide the popup before opening settings from it

The main popup is `alwaysOnTop: true`. Opening the settings window from the
popup's gear button leaves the new window *behind* the popup, and the
popup's existing focus-loss → hide handler doesn't fire reliably from this
path on Windows.

The gear handler in `clipboard-list.component.ts` now awaits `hidePopup()`
before invoking `openSettingsWindow()`. Doing the hide as its own IPC
round-trip from the frontend (rather than baking it into the
`open_settings` Rust function) lets the popup webview fully settle before
any window creation runs, and keeps `open_settings` symmetric for callers
that don't have a popup to worry about (the tray code path).

### The `open_settings_window` command must be `async fn`

`WebviewWindowBuilder::build()` deadlocks when invoked from a *sync* Tauri
command on Windows. The symptom is a permanently white/unpainted new
window. The reason is that the worker thread holding the sync command also
needs to drive parts of the event loop that process window creation, so the
build never completes. The tray-menu path doesn't hit this because menu
events fire on the main thread directly. This is a Tauri 2 footgun
documented (subtly) in
[`WebviewWindowBuilder::new`](https://docs.rs/tauri/latest/tauri/webview/struct.WebviewWindowBuilder.html#method.new)
and confirmed in
[tauri#13963](https://github.com/tauri-apps/tauri/issues/13963).

Fix: declare the command `async fn`, which moves it onto Tauri's
async-runtime worker pool where the event loop is not blocked.

```rust
#[tauri::command]
pub async fn open_settings_window(app_handle: tauri::AppHandle) -> Result<(), String> {
    crate::windows::open_settings(&app_handle).map_err(|e| e.to_string())
}
```

## Out of scope

- No new translation strings (section labels reuse the existing
  `SETTINGS.GROUP_*` keys; no section-level descriptions or hints added).
- No restructuring of the six sections (no Storage/Capture/About merge).
- No search field in the sidebar.
- **Not** deriving `AppSettings` from section slice types. `AppSettings` is
  the canonical persistence model (mirrored in Rust `models.rs`); section
  slices are derivatives via `Pick<>`, not the other way around. Inverting
  that dependency would scatter the wire format across feature components
  for no real upside.
- **Not** using a child `<router-outlet>` for sections. Each section is
  rendered via direct `<app-settings-*>` with `[settings]` / `(settingsChange)`
  binding so it stays a pure dumb component. A router outlet would force
  state-sharing through a service, taking the "dumb" out of the section.
- No inline `/settings` styling for the 480 px popup case (the route still
  works at narrow widths but is no longer reached by app navigation).

## Deletions

The flat-list layout used two purpose-built field wrappers that the sidebar
layout doesn't need. Removed:

- `src/app/features/settings/components/setting-field/` (component + spec)
- `src/app/features/settings/components/setting-checkbox/` (component + spec)

## Touchpoints

| File | Change |
|---|---|
| `src/app/features/settings/settings.component.ts` | Thin host: sidebar + `@switch` + query-param wiring + slice computeds + generic `onSectionChange` |
| `src/app/features/settings/sections/sections.ts` | `SECTIONS` const, `SectionKey = keyof typeof SECTIONS`, `SECTION_KEYS`, `isSectionKey` guard |
| `src/app/features/settings/sections/general.component.ts` | `model.required<GeneralSettings>` + 3 fields |
| `src/app/features/settings/sections/appearance.component.ts` | `model.required<AppearanceSettings>` + language/theme side effects |
| `src/app/features/settings/sections/history.component.ts` | `model.required<HistorySettings>` + clamping |
| `src/app/features/settings/sections/privacy.component.ts` | `model.required<PrivacySettings>` + embedded `<app-excluded-apps>` |
| `src/app/features/settings/sections/updates.component.ts` | `model.required<UpdatesSettings>` + `UpdaterService` |
| `src/app/features/settings/sections/statistics.component.ts` | No model — owns confirm-input state, `StatsService` actions |
| `src/app/features/settings/components/setting-field/*` | Deleted |
| `src/app/features/settings/components/setting-checkbox/*` | Deleted |
| `src/app/features/clipboard-list/clipboard-list.component.ts` | Gear → `openSettingsWindow()`; pause switch keeps green/red |
| `src/app/core/services/tauri-bridge.service.ts` | `openSettingsWindow()` |
| `src/libs/ui/switch/src/lib/hlm-switch.ts` | Default switch colors → neutral |
| `src-tauri/src/commands.rs` | `open_settings_window` is `async fn` (see white-window section) |
| `src-tauri/src/lib.rs` | Register the command in `invoke_handler` |
| `src-tauri/src/windows.rs` | `open_settings` → 880×680 fixed, `.center()` |
| `src/app/features/settings/components/shortcut-input/shortcut-capture-guard.directive.ts` | `ngOnDestroy` resets `editing_shortcut` defensively |
