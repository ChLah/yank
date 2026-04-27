# Settings Grouping Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Group the 7 settings into three named sections (General, Appearance, History) separated by dividers, without changing any settings logic.

**Architecture:** Pure template restructuring in `settings.component.ts` plus three new i18n keys. No new components, no logic changes, no new files beyond i18n additions.

**Tech Stack:** Angular 21 (inline template, signals), ngx-translate, Tailwind CSS, Spartan-ng hlm components.

---

### Task 1: Add group i18n keys

**Files:**
- Modify: `src/app/i18n/translation.interface.ts`
- Modify: `src/app/i18n/en.ts`
- Modify: `src/app/i18n/de.ts`

> No unit-testable logic here. Verification is TypeScript compilation (no errors after changes).

- [ ] **Step 1: Add keys to translation interface**

In `src/app/i18n/translation.interface.ts`, add three keys to the `SETTINGS` block (after `WINDOW_POSITION_LAST`):

```typescript
  SETTINGS: {
    // ... existing keys ...
    WINDOW_POSITION_LABEL: string;
    WINDOW_POSITION_CURSOR: string;
    WINDOW_POSITION_LAST: string;
    GROUP_GENERAL: string;
    GROUP_APPEARANCE: string;
    GROUP_HISTORY: string;
  };
```

- [ ] **Step 2: Add English translations**

In `src/app/i18n/en.ts`, add to the `SETTINGS` object (after `WINDOW_POSITION_LAST`):

```typescript
    WINDOW_POSITION_LAST: 'Last position',
    GROUP_GENERAL: 'General',
    GROUP_APPEARANCE: 'Appearance',
    GROUP_HISTORY: 'History',
```

- [ ] **Step 3: Add German translations**

In `src/app/i18n/de.ts`, add to the `SETTINGS` object (after `WINDOW_POSITION_LAST`):

```typescript
    WINDOW_POSITION_LAST: 'Letzte Position',
    GROUP_GENERAL: 'Allgemein',
    GROUP_APPEARANCE: 'Darstellung',
    GROUP_HISTORY: 'Verlauf',
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `pnpm exec tsc --noEmit`
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add src/app/i18n/translation.interface.ts src/app/i18n/en.ts src/app/i18n/de.ts
git commit -m "feat(i18n): add settings group translation keys (EN + DE)"
```

---

### Task 2: Restructure settings template into groups

**Files:**
- Modify: `src/app/features/settings/settings.component.ts` (template only, lines 45–188)

> No unit-testable logic. Verification is visual: run `pnpm tauri dev` and check the settings page.

- [ ] **Step 1: Replace the flat settings list with grouped template**

Replace the entire `@else` block content (the `<div class="flex-1 flex flex-col p-5 gap-5 overflow-y-auto">` and everything inside it, lines 45–188) with the following:

```html
      } @else {
        <div class="flex-1 flex flex-col p-5 gap-5 overflow-y-auto">

          <!-- General -->
          <div class="space-y-3">
            <p class="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">{{ 'SETTINGS.GROUP_GENERAL' | translate }}</p>

            <!-- Global Shortcut -->
            <div class="space-y-1.5">
              <label hlmLabel class="block uppercase tracking-wider">{{ 'SETTINGS.SHORTCUT_LABEL' | translate }}</label>
              <input
                hlmInput
                type="text"
                [value]="settings().shortcut"
                class="w-full font-mono"
                [placeholder]="'SETTINGS.SHORTCUT_PLACEHOLDER' | translate"
                (keydown)="captureShortcut($event)"
                readonly
              />
              <p class="text-[11px] text-muted-foreground">
                {{ 'SETTINGS.SHORTCUT_HINT' | translate }}
              </p>
            </div>

            <!-- Start at Login -->
            <div class="space-y-1.5">
              <div class="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="autostart-checkbox"
                  [checked]="settings().autostart"
                  (change)="onAutostartChange($event)"
                  class="h-4 w-4 rounded border-border accent-primary cursor-pointer"
                />
                <label hlmLabel for="autostart-checkbox" class="uppercase tracking-wider cursor-pointer">
                  {{ 'SETTINGS.AUTOSTART_LABEL' | translate }}
                </label>
              </div>
            </div>

            <!-- Window Position -->
            <div class="space-y-1.5">
              <label hlmLabel class="block uppercase tracking-wider">{{ 'SETTINGS.WINDOW_POSITION_LABEL' | translate }}</label>
              <div hlmSelect [value]="settings().windowPosition" [itemToString]="windowPositionLabel" (valueChange)="onWindowPositionChange($event)">
                <hlm-select-trigger class="w-full">
                  <hlm-select-value />
                </hlm-select-trigger>
                <hlm-select-content *hlmSelectPortal>
                  <hlm-select-item value="cursor">{{ 'SETTINGS.WINDOW_POSITION_CURSOR' | translate }}</hlm-select-item>
                  <hlm-select-item value="last">{{ 'SETTINGS.WINDOW_POSITION_LAST' | translate }}</hlm-select-item>
                </hlm-select-content>
              </div>
            </div>
          </div>

          <hr class="border-border" />

          <!-- Appearance -->
          <div class="space-y-3">
            <p class="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">{{ 'SETTINGS.GROUP_APPEARANCE' | translate }}</p>

            <!-- Language -->
            <div class="space-y-1.5">
              <label hlmLabel class="block uppercase tracking-wider">{{ 'SETTINGS.LANGUAGE_LABEL' | translate }}</label>
              <div hlmSelect [value]="settings().language ?? ''" [itemToString]="languageLabel" (valueChange)="onLanguageChange($event)">
                <hlm-select-trigger class="w-full">
                  <hlm-select-value />
                </hlm-select-trigger>
                <hlm-select-content *hlmSelectPortal>
                  <hlm-select-item value="">{{ 'SETTINGS.LANGUAGE_SYSTEM' | translate }}</hlm-select-item>
                  <hlm-select-item value="en">{{ 'SETTINGS.LANGUAGE_EN' | translate }}</hlm-select-item>
                  <hlm-select-item value="de">{{ 'SETTINGS.LANGUAGE_DE' | translate }}</hlm-select-item>
                </hlm-select-content>
              </div>
            </div>

            <!-- Theme -->
            <div class="space-y-1.5">
              <label hlmLabel class="block uppercase tracking-wider">{{ 'SETTINGS.THEME_LABEL' | translate }}</label>
              <div hlmSelect [value]="settings().theme" [itemToString]="themeLabel" (valueChange)="onThemeChange($event)">
                <hlm-select-trigger class="w-full">
                  <hlm-select-value />
                </hlm-select-trigger>
                <hlm-select-content *hlmSelectPortal>
                  <hlm-select-item value="system">{{ 'SETTINGS.THEME_SYSTEM' | translate }}</hlm-select-item>
                  <hlm-select-item value="light">{{ 'SETTINGS.THEME_LIGHT' | translate }}</hlm-select-item>
                  <hlm-select-item value="dark">{{ 'SETTINGS.THEME_DARK' | translate }}</hlm-select-item>
                </hlm-select-content>
              </div>
            </div>
          </div>

          <hr class="border-border" />

          <!-- History -->
          <div class="space-y-3">
            <p class="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">{{ 'SETTINGS.GROUP_HISTORY' | translate }}</p>

            <!-- Limit history size -->
            <div class="space-y-1.5">
              <div class="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="delete-max-checkbox"
                  [checked]="settings().deleteAfterMaxEntries"
                  (change)="onDeleteAfterMaxChange($event)"
                  class="h-4 w-4 rounded border-border accent-primary cursor-pointer"
                />
                <label hlmLabel for="delete-max-checkbox" class="uppercase tracking-wider cursor-pointer">
                  {{ 'SETTINGS.DELETE_AFTER_MAX_LABEL' | translate }}
                </label>
              </div>
              <div class="flex items-center gap-3" [class.opacity-50]="!settings().deleteAfterMaxEntries">
                <input
                  hlmInput
                  #maxEntriesInput
                  type="number"
                  [value]="settings().maxEntries"
                  (blur)="onMaxEntriesBlur(maxEntriesInput.valueAsNumber)"
                  [attr.disabled]="!settings().deleteAfterMaxEntries ? '' : null"
                  min="5"
                  max="999"
                  class="w-24"
                />
                <span class="text-[12px] text-muted-foreground">
                  {{ 'SETTINGS.MAX_ENTRIES_RANGE' | translate:{ min: 5, max: 999 } }}
                </span>
              </div>
            </div>

            <!-- Auto-delete old entries -->
            <div class="space-y-1.5">
              <div class="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="delete-days-checkbox"
                  [checked]="settings().deleteAfterDays"
                  (change)="onDeleteAfterDaysChange($event)"
                  class="h-4 w-4 rounded border-border accent-primary cursor-pointer"
                />
                <label hlmLabel for="delete-days-checkbox" class="uppercase tracking-wider cursor-pointer">
                  {{ 'SETTINGS.DELETE_AFTER_DAYS_LABEL' | translate }}
                </label>
              </div>
              <div class="flex items-center gap-3" [class.opacity-50]="!settings().deleteAfterDays">
                <input
                  hlmInput
                  #maxDaysInput
                  type="number"
                  [value]="settings().maxDays"
                  (blur)="onMaxDaysBlur(maxDaysInput.valueAsNumber)"
                  [attr.disabled]="!settings().deleteAfterDays ? '' : null"
                  min="1"
                  max="365"
                  class="w-24"
                />
                <span class="text-[12px] text-muted-foreground">
                  {{ 'SETTINGS.MAX_DAYS_RANGE' | translate:{ min: 1, max: 365 } }}
                </span>
              </div>
            </div>
          </div>

        </div>
      }
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `pnpm exec tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/app/features/settings/settings.component.ts
git commit -m "feat(settings): group settings into General, Appearance, History sections"
```
