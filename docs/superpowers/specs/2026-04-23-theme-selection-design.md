# Theme Selection + Spartan Select Migration

**Date:** 2026-04-23  
**Status:** Approved

## Overview

Add a theme selection setting (dark / light / system) persisted in the SQLite settings table, and migrate the existing plain HTML language `<select>` to the Spartan UI `HlmSelect` component. A new theme select is added alongside it using the same component.

## Architecture

### Theme Switching Mechanism

CSS class on `document.documentElement`. A `ThemeService` adds `.dark` or `.light` to the `<html>` element. For `system`, both classes are removed and a `prefers-color-scheme` media query in `styles.css` takes over. This is the standard Tailwind v4 / Spartan approach.

### Settings Storage

The existing SQLite key-value `settings` table is extended with a `theme` key. Value is `"dark"`, `"light"`, or `"system"`. A missing key reads as `system`.

---

## Backend Changes (Rust/Tauri)

**`src-tauri/src/models.rs`**

Add `Theme` enum:
```rust
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum Theme {
    Dark,
    Light,
    System,
}
```

Extend `AppSettings`:
```rust
pub struct AppSettings {
    pub shortcut: String,
    pub max_entries: i64,
    pub language: Option<Language>,
    pub theme: Option<Theme>,  // defaults to System when key is absent in DB
}
```

**`src-tauri/src/store/sqlite_store.rs`**

- `get_settings`: read `key='theme'`, map `"dark"` → `Dark`, `"light"` → `Light`, `"system"` or missing key → `System`
- `save_settings`: always write the theme key (`"dark"` / `"light"` / `"system"`). Use `"system"` as the stored string for the system default so intent is explicit.

No changes to `commands.rs` — `get_settings` / `save_settings` pass the full struct through already.

---

## Frontend Changes

### `settings.model.ts`

Add `Theme` type and field:
```ts
export type Theme = 'dark' | 'light' | 'system';

export interface AppSettings {
  shortcut: string;
  maxEntries: number;
  language: Language | null;
  theme: Theme;
}

export const DEFAULT_SETTINGS: AppSettings = {
  shortcut: 'Ctrl+SEMICOLON',
  maxEntries: 20,
  language: null,
  theme: 'system',
};
```

### `core/services/theme.service.ts` (new)

- `applyTheme(theme: Theme)`: removes `.dark` / `.light` from `document.documentElement.classList`, then adds the appropriate class (nothing added for `system`)
- Called on app init and on each settings save

### `app.config.ts`

Add `ThemeService.applyTheme()` call to the `APP_INITIALIZER` alongside `i18nService.init()`, reading the theme from the loaded settings.

### `styles.css`

Restructure CSS variables:
- `.dark { ... }` — existing dark variables
- `.light { ... }` — new light variables (inverted OKLch values)
- `@media (prefers-color-scheme: dark) { :root { ... } }` — system fallback for dark OS preference
- `@media (prefers-color-scheme: light) { :root { ... } }` — system fallback for light OS preference

### Spartan Select Component (`src/libs/ui/select/`)

Scaffolded via the Spartan CLI:
```
npx nx g @spartan-ng/cli:ui select --path src/libs/ui
```
Generates the full `HlmSelect` component family (trigger, content, item, etc.) into `src/libs/ui/select/` with Tailwind tokens pre-applied.

### Settings Component (`features/settings/settings.component.ts`)

**New signal:**
```ts
protected theme = linkedSignal(() => this.settingsService.settings.value()?.theme ?? 'system');
```

**New handler:**
```ts
onThemeChange(theme: Theme): void {
  this.theme.set(theme);
  this.themeService.applyTheme(theme);
}
```

**`save()`** — include `theme` in the settings object passed to `settingsService.saveSettings()`.

**Template changes:**
- Replace language `<select>` with `HlmSelect` (options: System / English / German)
- Add new Theme `HlmSelect` (options: System / Light / Dark)
- Both use the `translate` pipe for option labels

### i18n (`en.ts` / `de.ts`)

Add to the `SETTINGS` namespace:
```ts
THEME: 'Theme',
THEME_SYSTEM: 'System',
THEME_LIGHT: 'Light',
THEME_DARK: 'Dark',
```
(German equivalents in `de.ts`: `'Design'`, `'System'`, `'Hell'`, `'Dunkel'`)

Also update `translation.interface.ts` with the new keys.

---

## Data Flow

1. App init → `ThemeService.applyTheme(settings.theme)` sets class on `<html>`
2. User picks theme in settings → `onThemeChange()` applies immediately (live preview)
3. User clicks Save → `settingsService.saveSettings()` → Tauri bridge → Rust writes to SQLite
4. On next launch, settings are loaded and theme is applied in `APP_INITIALIZER`

---

## Out of Scope

- Additional themes beyond dark / light / system
- Per-component theme overrides
- Theme transition animations
