# Theme Selection + Spartan Select Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add dark/light/system theme selection persisted in SQLite, migrate the language dropdown to Spartan `HlmSelect`, and add a matching theme dropdown.

**Architecture:** A new `ThemeService` applies `.dark` or `.light` to `document.documentElement`; for `system` it removes both and lets `prefers-color-scheme` media queries take over. The Rust backend gains a `Theme` enum stored as the string `"dark"` / `"light"` / `"system"` in the existing key-value `settings` table. The Spartan CLI scaffolds the `HlmSelect` component family into `src/libs/ui/select/`.

**Tech Stack:** Angular 21 (signals, `linkedSignal`, `APP_INITIALIZER`), Spartan NG (`@spartan-ng/brain/select`), Tauri / Rust (`rusqlite`), Tailwind v4, `@ngx-translate/core`

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `src/libs/ui/select/src/` | Create (CLI) | Spartan HlmSelect component family |
| `tsconfig.json` | Modify | Add `@spartan-ng/helm/select` path alias |
| `src-tauri/src/models.rs` | Modify | Add `Theme` enum + field to `AppSettings` |
| `src-tauri/src/store/sqlite_store.rs` | Modify | Read/write `theme` key |
| `src/app/core/models/settings.model.ts` | Modify | Add `Theme` type + field |
| `src/app/core/services/theme.service.ts` | Create | Apply `.dark`/`.light` class to `<html>` |
| `src/styles.css` | Modify | Add `.dark`, `.light`, and media-query blocks |
| `src/index.html` | Modify | Remove hardcoded `bg-zinc-950` body class |
| `src/app/app.config.ts` | Modify | Add `ThemeService` `APP_INITIALIZER` |
| `src/app/i18n/translation.interface.ts` | Modify | Add `THEME_*` key types |
| `src/app/i18n/en.ts` | Modify | Add English theme strings |
| `src/app/i18n/de.ts` | Modify | Add German theme strings |
| `src/app/features/settings/settings.component.ts` | Modify | Replace plain `<select>`s with `HlmSelect`, add theme |

---

## Task 1: Scaffold Spartan Select via CLI

**Files:**
- Create: `src/libs/ui/select/src/` (CLI output)
- Modify: `tsconfig.json`

- [ ] **Step 1: Run the Spartan CLI to scaffold the select component**

```bash
pnpm spartan select
```

The CLI reads `components.json` (`componentsPath: "src/libs/ui"`, `importAlias: "@spartan-ng/helm"`) and generates files into `src/libs/ui/select/src/`. It may prompt for config if `components.json` is missing — answer `src/libs/ui` for path and `@spartan-ng/helm` for alias.

- [ ] **Step 2: Verify generated files exist**

```bash
ls src/libs/ui/select/src/
ls src/libs/ui/select/src/lib/
```

Expected: `index.ts` plus ~15 `hlm-select-*.ts` files in `lib/`.

- [ ] **Step 3: Verify or add tsconfig path**

The CLI may auto-add the path. Check `tsconfig.json` — if `"@spartan-ng/helm/select"` is missing, add it:

```json
"@spartan-ng/helm/select": ["./src/libs/ui/select/src/index.ts"]
```

The full `paths` block in `tsconfig.json` should then include:
```json
"paths": {
  "@spartan-ng/helm/button": ["./src/libs/ui/button/src/index.ts"],
  "@spartan-ng/helm/utils": ["./src/libs/ui/utils/src/index.ts"],
  "@spartan-ng/helm/input": ["./src/libs/ui/input/src/index.ts"],
  "@spartan-ng/helm/label": ["./src/libs/ui/label/src/index.ts"],
  "@spartan-ng/helm/badge": ["./src/libs/ui/badge/src/index.ts"],
  "@spartan-ng/helm/alert": ["./src/libs/ui/alert/src/index.ts"],
  "@spartan-ng/helm/icon": ["./src/libs/ui/icon/src/index.ts"],
  "@spartan-ng/helm/tabs": ["./src/libs/ui/tabs/src/index.ts"],
  "@spartan-ng/helm/select": ["./src/libs/ui/select/src/index.ts"]
}
```

- [ ] **Step 4: Commit**

```bash
git add src/libs/ui/select/ tsconfig.json
git commit -m "feat(ui): scaffold spartan HlmSelect component via CLI"
```

---

## Task 2: Extend Rust Models with Theme

**Files:**
- Modify: `src-tauri/src/models.rs`

- [ ] **Step 1: Add `Theme` enum and `theme` field to `AppSettings`**

In `src-tauri/src/models.rs`, replace the `Language` enum block and `AppSettings` struct as follows (leave `ClipboardEntry`, `ClipboardContent`, `ClipboardPayload` untouched):

```rust
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum Language {
    En,
    De,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum Theme {
    Dark,
    Light,
    System,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    pub shortcut: String,
    pub max_entries: i64,
    pub language: Option<Language>,
    pub theme: Theme,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            shortcut: "Ctrl+Quote".to_string(),
            max_entries: 20,
            language: None,
            theme: Theme::System,
        }
    }
}
```

- [ ] **Step 2: Verify it compiles (Rust check only)**

```bash
cd src-tauri && cargo check 2>&1 | head -30
```

Expected: no errors about `AppSettings` or `Theme`. Errors about `sqlite_store.rs` are expected at this stage (unimplemented read/write).

---

## Task 3: Update SQLite Store for Theme

**Files:**
- Modify: `src-tauri/src/store/sqlite_store.rs` (lines ~236–298)

- [ ] **Step 1: Update `get_settings` to read the `theme` key**

In `sqlite_store.rs`, inside `get_settings`, after the `language` block (around line 267), add:

```rust
let theme = conn
    .query_row(
        "SELECT value FROM settings WHERE key = 'theme'",
        [],
        |row| row.get::<_, String>(0),
    )
    .ok()
    .map(|v| match v.as_str() {
        "dark" => Theme::Dark,
        "light" => Theme::Light,
        _ => Theme::System,
    })
    .unwrap_or(Theme::System);
```

Change the return value at the bottom of `get_settings` from:
```rust
Ok(AppSettings { shortcut, max_entries, language })
```
to:
```rust
Ok(AppSettings { shortcut, max_entries, language, theme })
```

Also add `Theme` to the import at the top of the file (or wherever `Language` is imported):
```rust
use crate::models::{AppSettings, Language, Theme};
```

- [ ] **Step 2: Update `save_settings` to write the `theme` key**

In `save_settings`, after the `language` match block (around line 296), add:

```rust
let theme_str = match settings.theme {
    Theme::Dark => "dark",
    Theme::Light => "light",
    Theme::System => "system",
};
conn.execute(
    "INSERT OR REPLACE INTO settings (key, value) VALUES ('theme', ?1)",
    params![theme_str],
)?;
```

- [ ] **Step 3: Verify it compiles**

```bash
cd src-tauri && cargo check 2>&1 | head -30
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
cd ..
git add src-tauri/src/models.rs src-tauri/src/store/sqlite_store.rs
git commit -m "feat(backend): add Theme enum and persist theme setting in SQLite"
```

---

## Task 4: Extend Angular Settings Model

**Files:**
- Modify: `src/app/core/models/settings.model.ts`

- [ ] **Step 1: Add `Theme` type and field**

Replace the entire contents of `src/app/core/models/settings.model.ts` with:

```typescript
export type Language = 'en' | 'de';
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

- [ ] **Step 2: Verify TypeScript is happy**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors in `settings.model.ts`. Errors in `settings.component.ts` are expected (not yet updated).

---

## Task 5: Create ThemeService

**Files:**
- Create: `src/app/core/services/theme.service.ts`

- [ ] **Step 1: Write the ThemeService**

Create `src/app/core/services/theme.service.ts`:

```typescript
import { Injectable } from '@angular/core';
import { Theme } from '../models/settings.model';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  applyTheme(theme: Theme): void {
    const root = document.documentElement;
    root.classList.remove('dark', 'light');
    if (theme !== 'system') {
      root.classList.add(theme);
    }
  }
}
```

- [ ] **Step 2: Write a basic spec**

Create `src/app/core/services/theme.service.spec.ts`:

```typescript
import { TestBed } from '@angular/core/testing';
import { ThemeService } from './theme.service';

describe('ThemeService', () => {
  let service: ThemeService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ThemeService);
    document.documentElement.classList.remove('dark', 'light');
  });

  it('adds .dark class for dark theme', () => {
    service.applyTheme('dark');
    expect(document.documentElement.classList.contains('dark')).toBeTrue();
    expect(document.documentElement.classList.contains('light')).toBeFalse();
  });

  it('adds .light class for light theme', () => {
    service.applyTheme('light');
    expect(document.documentElement.classList.contains('light')).toBeTrue();
    expect(document.documentElement.classList.contains('dark')).toBeFalse();
  });

  it('removes both classes for system theme', () => {
    document.documentElement.classList.add('dark');
    service.applyTheme('system');
    expect(document.documentElement.classList.contains('dark')).toBeFalse();
    expect(document.documentElement.classList.contains('light')).toBeFalse();
  });

  it('switches from light to dark', () => {
    service.applyTheme('light');
    service.applyTheme('dark');
    expect(document.documentElement.classList.contains('dark')).toBeTrue();
    expect(document.documentElement.classList.contains('light')).toBeFalse();
  });
});
```

- [ ] **Step 3: Run the spec**

```bash
npx ng test --include="**/theme.service.spec.ts" --watch=false 2>&1 | tail -15
```

Expected: 4 specs, 0 failures.

- [ ] **Step 4: Commit**

```bash
git add src/app/core/services/theme.service.ts src/app/core/services/theme.service.spec.ts
git commit -m "feat(theme): add ThemeService with class-based theme switching"
```

---

## Task 6: Restructure styles.css for Multi-Theme Support

**Files:**
- Modify: `src/styles.css`

- [ ] **Step 1: Replace styles.css with themed variable blocks**

Replace the entire `src/styles.css` with:

```css
@layer theme, base, components, utilities;
@import "tailwindcss/theme.css" layer(theme);
@import "tailwindcss/preflight.css" layer(base);
@import "tailwindcss/utilities.css";
@import "@spartan-ng/brain/hlm-tailwind-preset.css";

@layer base {
  :root {
    --radius: 0.625rem;
  }

  /* Dark theme: default + explicit .dark class */
  :root,
  .dark {
    color-scheme: dark;
    --background: oklch(0.145 0 0);
    --foreground: oklch(0.985 0 0);
    --card: oklch(0.205 0 0);
    --card-foreground: oklch(0.985 0 0);
    --popover: oklch(0.205 0 0);
    --popover-foreground: oklch(0.985 0 0);
    --primary: oklch(0.922 0 0);
    --primary-foreground: oklch(0.205 0 0);
    --secondary: oklch(0.269 0 0);
    --secondary-foreground: oklch(0.985 0 0);
    --muted: oklch(0.269 0 0);
    --muted-foreground: oklch(0.708 0 0);
    --accent: oklch(0.269 0 0);
    --accent-foreground: oklch(0.985 0 0);
    --destructive: oklch(0.704 0.191 22.216);
    --border: oklch(1 0 0 / 10%);
    --input: oklch(1 0 0 / 15%);
    --ring: oklch(0.556 0 0);
    --sidebar: oklch(0.205 0 0);
    --sidebar-foreground: oklch(0.985 0 0);
    --sidebar-primary: oklch(0.985 0 0);
    --sidebar-primary-foreground: oklch(0.205 0 0);
    --sidebar-accent: oklch(0.269 0 0);
    --sidebar-accent-foreground: oklch(0.985 0 0);
    --sidebar-border: oklch(1 0 0 / 10%);
    --sidebar-ring: oklch(0.556 0 0);
  }

  /* System: light OS preference overrides dark default */
  @media (prefers-color-scheme: light) {
    :root:not(.dark) {
      color-scheme: light;
      --background: oklch(1 0 0);
      --foreground: oklch(0.145 0 0);
      --card: oklch(1 0 0);
      --card-foreground: oklch(0.145 0 0);
      --popover: oklch(1 0 0);
      --popover-foreground: oklch(0.145 0 0);
      --primary: oklch(0.205 0 0);
      --primary-foreground: oklch(0.985 0 0);
      --secondary: oklch(0.961 0 0);
      --secondary-foreground: oklch(0.205 0 0);
      --muted: oklch(0.961 0 0);
      --muted-foreground: oklch(0.556 0 0);
      --accent: oklch(0.961 0 0);
      --accent-foreground: oklch(0.205 0 0);
      --destructive: oklch(0.704 0.191 22.216);
      --border: oklch(0.922 0 0);
      --input: oklch(0.922 0 0);
      --ring: oklch(0.708 0 0);
      --sidebar: oklch(0.985 0 0);
      --sidebar-foreground: oklch(0.145 0 0);
      --sidebar-primary: oklch(0.205 0 0);
      --sidebar-primary-foreground: oklch(0.985 0 0);
      --sidebar-accent: oklch(0.961 0 0);
      --sidebar-accent-foreground: oklch(0.205 0 0);
      --sidebar-border: oklch(0.922 0 0);
      --sidebar-ring: oklch(0.708 0 0);
    }
  }

  /* Explicit light theme */
  .light {
    color-scheme: light;
    --background: oklch(1 0 0);
    --foreground: oklch(0.145 0 0);
    --card: oklch(1 0 0);
    --card-foreground: oklch(0.145 0 0);
    --popover: oklch(1 0 0);
    --popover-foreground: oklch(0.145 0 0);
    --primary: oklch(0.205 0 0);
    --primary-foreground: oklch(0.985 0 0);
    --secondary: oklch(0.961 0 0);
    --secondary-foreground: oklch(0.205 0 0);
    --muted: oklch(0.961 0 0);
    --muted-foreground: oklch(0.556 0 0);
    --accent: oklch(0.961 0 0);
    --accent-foreground: oklch(0.205 0 0);
    --destructive: oklch(0.704 0.191 22.216);
    --border: oklch(0.922 0 0);
    --input: oklch(0.922 0 0);
    --ring: oklch(0.708 0 0);
    --sidebar: oklch(0.985 0 0);
    --sidebar-foreground: oklch(0.145 0 0);
    --sidebar-primary: oklch(0.205 0 0);
    --sidebar-primary-foreground: oklch(0.985 0 0);
    --sidebar-accent: oklch(0.961 0 0);
    --sidebar-accent-foreground: oklch(0.205 0 0);
    --sidebar-border: oklch(0.922 0 0);
    --sidebar-ring: oklch(0.708 0 0);
  }

  * {
    box-sizing: border-box;
    font-family: 'DM Sans', system-ui, -apple-system, sans-serif;
  }

  html, body {
    margin: 0;
    padding: 0;
    height: 100%;
    background: var(--background);
    color: var(--foreground);
  }
}

@layer utilities {
  .scrollbar-thin {
    scrollbar-width: thin;
    scrollbar-color: #27272a transparent;
  }
}
```

- [ ] **Step 2: Update index.html — remove hardcoded dark background class**

In `src/index.html`, change:
```html
<body class="bg-zinc-950">
```
to:
```html
<body>
```

- [ ] **Step 3: Commit**

```bash
git add src/styles.css src/index.html
git commit -m "feat(theme): restructure CSS for dark/light/system theme classes"
```

---

## Task 7: Wire ThemeService into App Initializer

**Files:**
- Modify: `src/app/app.config.ts`

- [ ] **Step 1: Add a second APP_INITIALIZER for theme**

Replace the entire `src/app/app.config.ts` with:

```typescript
import { APP_INITIALIZER, ApplicationConfig, importProvidersFrom, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withHashLocation } from '@angular/router';
import { TranslateLoader, TranslateModule } from '@ngx-translate/core';
import { routes } from './app.routes';
import { TypescriptTranslateLoader } from './i18n/translate-loader';
import { I18nService } from './core/services/i18n.service';
import { ThemeService } from './core/services/theme.service';
import { TauriBridgeService } from './core/services/tauri-bridge.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withHashLocation()),
    importProvidersFrom(
      TranslateModule.forRoot({
        defaultLanguage: 'en',
        loader: {
          provide: TranslateLoader,
          useClass: TypescriptTranslateLoader,
        },
      }),
    ),
    {
      provide: APP_INITIALIZER,
      useFactory: (i18nService: I18nService) => () => i18nService.init(),
      deps: [I18nService],
      multi: true,
    },
    {
      provide: APP_INITIALIZER,
      useFactory: (themeService: ThemeService, bridge: TauriBridgeService) => async () => {
        const settings = await bridge.getSettings();
        themeService.applyTheme(settings.theme);
      },
      deps: [ThemeService, TauriBridgeService],
      multi: true,
    },
  ],
};
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit 2>&1 | grep -E "error|warning" | head -20
```

Expected: no errors in `app.config.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/app/app.config.ts
git commit -m "feat(theme): apply theme on app init via APP_INITIALIZER"
```

---

## Task 8: Add i18n Keys for Theme

**Files:**
- Modify: `src/app/i18n/translation.interface.ts`
- Modify: `src/app/i18n/en.ts`
- Modify: `src/app/i18n/de.ts`

- [ ] **Step 1: Update translation.interface.ts**

In `src/app/i18n/translation.interface.ts`, extend the `SETTINGS` block (add after `LANGUAGE_DE`):

```typescript
export interface Translation {
  [key: string]: any;
  SETTINGS: {
    TITLE: string;
    SHORTCUT_LABEL: string;
    SHORTCUT_PLACEHOLDER: string;
    SHORTCUT_HINT: string;
    MAX_ENTRIES_LABEL: string;
    MAX_ENTRIES_RANGE: string;
    LANGUAGE_LABEL: string;
    LANGUAGE_SYSTEM: string;
    LANGUAGE_EN: string;
    LANGUAGE_DE: string;
    THEME_LABEL: string;
    THEME_SYSTEM: string;
    THEME_LIGHT: string;
    THEME_DARK: string;
    SAVE: string;
    SAVING: string;
    SAVED: string;
  };
  // ... rest unchanged
```

- [ ] **Step 2: Update en.ts**

In `src/app/i18n/en.ts`, inside the `SETTINGS` block, add after `LANGUAGE_DE`:

```typescript
THEME_LABEL: 'Theme',
THEME_SYSTEM: 'System',
THEME_LIGHT: 'Light',
THEME_DARK: 'Dark',
```

- [ ] **Step 3: Update de.ts**

In `src/app/i18n/de.ts`, inside the `SETTINGS` block, add after `LANGUAGE_DE`:

```typescript
THEME_LABEL: 'Design',
THEME_SYSTEM: 'System',
THEME_LIGHT: 'Hell',
THEME_DARK: 'Dunkel',
```

- [ ] **Step 4: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/i18n/
git commit -m "feat(i18n): add theme translation keys (en + de)"
```

---

## Task 9: Update Settings Component

**Files:**
- Modify: `src/app/features/settings/settings.component.ts`

- [ ] **Step 1: Replace the settings component with the updated version**

Replace the entire `src/app/features/settings/settings.component.ts` with:

```typescript
import {
  ChangeDetectionStrategy,
  Component,
  inject,
  linkedSignal,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideChevronLeft } from '@ng-icons/lucide';
import { TranslatePipe } from '@ngx-translate/core';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmIcon } from '@spartan-ng/helm/icon';
import { HlmInput } from '@spartan-ng/helm/input';
import { HlmLabel } from '@spartan-ng/helm/label';
import { HlmAlert, HlmAlertDescription } from '@spartan-ng/helm/alert';
import { HlmSelectImports } from '@spartan-ng/helm/select';
import { SettingsService } from '../../core/services/settings.service';
import { I18nService } from '../../core/services/i18n.service';
import { ThemeService } from '../../core/services/theme.service';
import { Language, Theme } from '../../core/models/settings.model';

@Component({
  selector: 'app-settings',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink, NgIcon, HlmIcon, HlmButton, HlmInput, HlmLabel,
    HlmAlert, HlmAlertDescription, TranslatePipe, HlmSelectImports,
  ],
  providers: [provideIcons({ lucideChevronLeft })],
  template: `
    <div class="flex flex-col h-screen bg-background">

      <!-- Header -->
      <div class="px-3.5 h-11 flex items-center gap-2 shrink-0 bg-card border-b border-border">
        <a routerLink="/" class="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
          <ng-icon hlm size="sm" name="lucideChevronLeft" />
        </a>
        <span class="text-[13px] font-semibold text-foreground tracking-tight">{{ 'SETTINGS.TITLE' | translate }}</span>
      </div>

      @if (settingsService.settings.isLoading()) {
        <div class="flex-1 flex items-center justify-center">
          <div class="w-5 h-5 border-2 border-muted border-t-muted-foreground rounded-full animate-spin"></div>
        </div>
      } @else {
        <form (ngSubmit)="save()" class="flex-1 flex flex-col p-5 gap-5 overflow-y-auto">

          <!-- Global Shortcut -->
          <div class="space-y-1.5">
            <label hlmLabel class="block uppercase tracking-wider">{{ 'SETTINGS.SHORTCUT_LABEL' | translate }}</label>
            <input
              hlmInput
              type="text"
              [value]="shortcut()"
              class="w-full font-mono"
              [placeholder]="'SETTINGS.SHORTCUT_PLACEHOLDER' | translate"
              (keydown)="captureShortcut($event)"
              readonly
            />
            <p class="text-[11px] text-muted-foreground">
              {{ 'SETTINGS.SHORTCUT_HINT' | translate }}
            </p>
          </div>

          <!-- Max entries -->
          <div class="space-y-1.5">
            <label hlmLabel class="block uppercase tracking-wider">{{ 'SETTINGS.MAX_ENTRIES_LABEL' | translate }}</label>
            <div class="flex items-center gap-3">
              <input
                hlmInput
                #maxInput
                type="number"
                [value]="maxEntries()"
                (input)="maxEntries.set(maxInput.valueAsNumber)"
                min="5"
                max="100"
                class="w-24"
              />
              <span class="text-[12px] text-muted-foreground">{{ 'SETTINGS.MAX_ENTRIES_RANGE' | translate:{ min: 5, max: 100 } }}</span>
            </div>
          </div>

          <!-- Language -->
          <div class="space-y-1.5">
            <label hlmLabel class="block uppercase tracking-wider">{{ 'SETTINGS.LANGUAGE_LABEL' | translate }}</label>
            <div hlmSelect [value]="language() ?? ''" (valueChange)="onLanguageChange($event)">
              <hlm-select-trigger class="w-full">
                <hlm-select-value />
              </hlm-select-trigger>
              <hlm-select-content>
                <hlm-select-item value="">{{ 'SETTINGS.LANGUAGE_SYSTEM' | translate }}</hlm-select-item>
                <hlm-select-item value="en">{{ 'SETTINGS.LANGUAGE_EN' | translate }}</hlm-select-item>
                <hlm-select-item value="de">{{ 'SETTINGS.LANGUAGE_DE' | translate }}</hlm-select-item>
              </hlm-select-content>
            </div>
          </div>

          <!-- Theme -->
          <div class="space-y-1.5">
            <label hlmLabel class="block uppercase tracking-wider">{{ 'SETTINGS.THEME_LABEL' | translate }}</label>
            <div hlmSelect [value]="theme()" (valueChange)="onThemeChange($event)">
              <hlm-select-trigger class="w-full">
                <hlm-select-value />
              </hlm-select-trigger>
              <hlm-select-content>
                <hlm-select-item value="system">{{ 'SETTINGS.THEME_SYSTEM' | translate }}</hlm-select-item>
                <hlm-select-item value="light">{{ 'SETTINGS.THEME_LIGHT' | translate }}</hlm-select-item>
                <hlm-select-item value="dark">{{ 'SETTINGS.THEME_DARK' | translate }}</hlm-select-item>
              </hlm-select-content>
            </div>
          </div>

          @if (error()) {
            <hlm-alert variant="destructive">
              <p hlmAlertDescription>{{ error() }}</p>
            </hlm-alert>
          }

          @if (saved()) {
            <hlm-alert>
              <p hlmAlertDescription>{{ 'SETTINGS.SAVED' | translate }}</p>
            </hlm-alert>
          }

          <div class="mt-auto">
            <button hlmBtn type="submit" class="w-full" [disabled]="!shortcut() || saving()">
              {{ (saving() ? 'SETTINGS.SAVING' : 'SETTINGS.SAVE') | translate }}
            </button>
          </div>
        </form>
      }
    </div>
  `,
})
export class SettingsComponent {
  protected settingsService = inject(SettingsService);
  protected i18nService = inject(I18nService);
  protected themeService = inject(ThemeService);

  protected shortcut = linkedSignal(() => this.settingsService.settings.value()?.shortcut ?? '');
  protected maxEntries = linkedSignal(() => this.settingsService.settings.value()?.maxEntries ?? 20);
  protected language = linkedSignal(() => this.i18nService.currentLanguage());
  protected theme = linkedSignal(() => this.settingsService.settings.value()?.theme ?? 'system');
  protected saving = signal(false);
  protected saved = signal(false);
  protected error = signal<string | null>(null);

  protected captureShortcut(event: KeyboardEvent): void {
    event.preventDefault();
    const parts: string[] = [];
    if (event.ctrlKey) parts.push('Ctrl');
    if (event.altKey) parts.push('Alt');
    if (event.shiftKey) parts.push('Shift');
    if (event.metaKey) parts.push('Super');

    const key = event.code;
    if (!['ControlLeft', 'ControlRight', 'AltLeft', 'AltRight',
          'ShiftLeft', 'ShiftRight', 'MetaLeft', 'MetaRight'].includes(key)) {
      const cleanKey = key.startsWith('Key') ? key.slice(3) : key;
      parts.push(cleanKey);
    }

    if (parts.length > 1) {
      this.shortcut.set(parts.join('+'));
    }
  }

  protected onLanguageChange(value: string): void {
    const lang = value === '' ? null : (value as Language);
    this.language.set(lang);
    this.i18nService.setLanguage(lang);
  }

  protected onThemeChange(value: string): void {
    const theme = (value as Theme) || 'system';
    this.theme.set(theme);
    this.themeService.applyTheme(theme);
  }

  protected async save(): Promise<void> {
    if (!this.shortcut()) return;
    this.saving.set(true);
    this.error.set(null);
    this.saved.set(false);
    try {
      await this.settingsService.saveSettings({
        shortcut: this.shortcut(),
        maxEntries: this.maxEntries(),
        language: this.language(),
        theme: this.theme(),
      });
      this.saved.set(true);
      setTimeout(() => this.saved.set(false), 2000);
    } catch (e) {
      this.error.set(String(e));
    } finally {
      this.saving.set(false);
    }
  }
}
```

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/features/settings/settings.component.ts
git commit -m "feat(settings): add theme select and migrate language to HlmSelect"
```

---

## Task 10: Build Verification

- [ ] **Step 1: Build the Angular app**

```bash
npx ng build 2>&1 | tail -20
```

Expected: `Application bundle generation complete.` with no errors.

- [ ] **Step 2: Run tests**

```bash
npx ng test --watch=false 2>&1 | tail -10
```

Expected: all specs pass (at minimum the 4 ThemeService specs).

- [ ] **Step 3: Smoke test in Tauri dev**

```bash
pnpm tauri dev
```

Open the settings panel. Verify:
1. Language dropdown shows the Spartan select style (chevron icon, styled dropdown)
2. Theme dropdown appears below language with System / Light / Dark options
3. Selecting "Light" immediately switches the app to light colors
4. Selecting "Dark" immediately switches back
5. Selecting "System" removes explicit class, follows OS
6. Clicking Save, then restarting the app, restores the saved theme

- [ ] **Step 4: Final commit if any fixups were needed**

```bash
git add -p
git commit -m "fix(settings): post-build corrections"
```
