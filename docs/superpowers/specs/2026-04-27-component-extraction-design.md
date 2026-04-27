# Component Extraction Design

**Date:** 2026-04-27
**Status:** Approved

## Problem

The frontend has grown three large inline templates (clipboard-list, settings, image-preview) with significant structural duplication: identical header toolbars, repeated empty/error state blocks, copy-pasted `<kbd>` hint spans, raw checkbox markup, and a custom CSS spinner appearing in multiple places. No shared UI layer exists.

## Goal

Extract the repeated patterns into focused, composable components. Use spartan.ng primitives where they replace custom markup. Keep input surfaces minimal — content projection handles complex slot content; inputs handle only minor style variants.

## Approach

Eight components total, split into three groups:

1. App-wide shared components (`src/app/shared/ui/`)
2. Settings-scoped components (`src/app/features/settings/components/`)
3. New spartan helm components to generate (`src/libs/ui/`)

---

## Section 1: Shared UI Components

All live in `src/app/shared/ui/`. Each is a standalone component with `ChangeDetectionStrategy.OnPush`.

### PageHeaderComponent

**Selector:** `app-page-header`
**File:** `shared/ui/page-header/page-header.component.ts`

Encapsulates the `px-3.5 h-11 flex items-center justify-between shrink-0 border-b` toolbar used in clipboard-list, settings, and image-preview.

**Inputs:**

| Input | Type | Default | Purpose |
|---|---|---|---|
| `variant` | `'default' \| 'dark'` | `'default'` | `'default'` = `bg-card border-border`; `'dark'` = `bg-zinc-900 border-zinc-800` (image-preview window) |
| `dragRegion` | `boolean` | `true` | Adds `data-tauri-drag-region` to the inner `<div>` so Tauri picks it up. Set to `false` for image-preview (separate window, no drag needed). |

**Content slots:**

- `[start]` — left side (icon, title, badge, back link)
- `[end]` — right side (action buttons)

**Usage:**
```html
<!-- clipboard-list -->
<app-page-header>
  <ng-container start>
    <ng-icon hlm size="sm" name="lucideClipboard" class="text-muted-foreground shrink-0" />
    <span class="text-[13px] font-semibold text-foreground tracking-tight">{{ 'CLIPBOARD.TITLE' | translate }}</span>
    @if (allEntries().length > 0) {
      <span hlmBadge variant="secondary">{{ allEntries().length }}</span>
    }
  </ng-container>
  <ng-container end>
    <a routerLink="/settings" class="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
      <ng-icon hlm size="sm" name="lucideSettings" />
    </a>
  </ng-container>
</app-page-header>

<!-- image-preview (separate window — no drag region) -->
<app-page-header variant="dark" [dragRegion]="false">
  <ng-container start>...</ng-container>
  <ng-container end>...</ng-container>
</app-page-header>
```

---

### EmptyStateComponent

**Selector:** `app-empty-state`
**File:** `shared/ui/empty-state/empty-state.component.ts`

Replaces 5 instances of the centered icon + text pattern in clipboard-list (error, empty-pinned, no-matches, empty) and image-preview (error).

**Inputs:**

| Input | Type | Required | Purpose |
|---|---|---|---|
| `icon` | `string` | yes | Lucide icon name passed to `<ng-icon hlm>` |
| `title` | `string` | yes | Primary message (already-translated string; caller uses `\| translate`) |
| `hint` | `string` | no | Secondary smaller message below title |
| `variant` | `'default' \| 'destructive'` | no | `'default'` = `bg-card` rounded-xl, muted icon; `'destructive'` = `bg-red-500/10` rounded-full, red icon |

**Content:** optional `ng-content` slot for extra actions (e.g. "Try again" button).

**Usage:**
```html
<app-empty-state
  icon="lucideAlertCircle"
  [title]="'CLIPBOARD.ERROR_LOAD' | translate"
  variant="destructive">
  <button hlmBtn variant="link" size="sm" (click)="clipboard.entries.reload()">
    {{ 'CLIPBOARD.TRY_AGAIN' | translate }}
  </button>
</app-empty-state>

<app-empty-state
  icon="lucideBookmark"
  [title]="'CLIPBOARD.EMPTY_PINNED' | translate"
  [hint]="'CLIPBOARD.EMPTY_PINNED_HINT' | translate"
/>
```

---

### KeyboardHintComponent

**Selector:** `app-keyboard-hint`
**File:** `shared/ui/keyboard-hint/keyboard-hint.component.ts`

Replaces the 5 repeated `<span><kbd>KEY</kbd> label</span>` blocks in the clipboard-list footer. The 6th hint (search, text-only with `ml-auto`) stays inline.

**Inputs:**

| Input | Type | Required | Purpose |
|---|---|---|---|
| `key` | `string` | yes | Key label rendered inside `<kbd>` |
| `label` | `string` | yes | Descriptive text rendered next to the kbd |

**Usage:**
```html
<app-keyboard-hint key="↑↓" label="{{ 'CLIPBOARD.HINT_NAV' | translate }}" />
<app-keyboard-hint key="↵" label="{{ 'CLIPBOARD.HINT_PASTE' | translate }}" />
<app-keyboard-hint key="⌫" label="{{ 'CLIPBOARD.HINT_DELETE' | translate }}" />
<app-keyboard-hint key="P" label="{{ 'CLIPBOARD.HINT_PIN' | translate }}" />
<app-keyboard-hint key="Esc" label="{{ 'CLIPBOARD.HINT_CLOSE' | translate }}" />
```

---

### LoadingSpinnerComponent

**Selector:** `app-loading-spinner`
**File:** `shared/ui/loading-spinner/loading-spinner.component.ts`

Replaces the CSS-only spinner div in settings and image-preview. Always `w-5 h-5`.

**Inputs:**

| Input | Type | Default | Purpose |
|---|---|---|---|
| `variant` | `'default' \| 'dark'` | `'default'` | `'default'` = `border-muted border-t-muted-foreground`; `'dark'` = `border-zinc-800 border-t-zinc-500` |

**Usage:**
```html
<!-- settings -->
<app-loading-spinner />

<!-- image-preview -->
<app-loading-spinner variant="dark" />
```

---

## Section 2: Settings-Scoped Components

Both live in `src/app/features/settings/components/`. Settings-scoped means opinionated for the settings page — no need to be general-purpose.

### SettingFieldComponent

**Selector:** `app-setting-field`
**File:** `features/settings/components/setting-field/setting-field.component.ts`

Wraps the `<div class="space-y-1.5">` field group pattern used 6 times in settings. Renders an optional outer label and optional hint paragraph. The control itself is projected.

**Inputs:**

| Input | Type | Required | Purpose |
|---|---|---|---|
| `label` | `string` | no | If provided, renders `<label hlmLabel class="block uppercase tracking-wider">` above the control |
| `hint` | `string` | no | If provided, renders `<p class="text-[11px] text-muted-foreground">` below the control |

**Content:** `ng-content` — the control (input, select, checkbox row, etc.).

**Usage:**
```html
<!-- With label + hint (shortcut field) -->
<app-setting-field
  [label]="'SETTINGS.SHORTCUT_LABEL' | translate"
  [hint]="'SETTINGS.SHORTCUT_HINT' | translate">
  <input hlmInput type="text" [value]="settings().shortcut" class="w-full font-mono" readonly (keydown)="captureShortcut($event)" />
</app-setting-field>

<!-- Checkbox row (no outer label) -->
<app-setting-field>
  <app-setting-checkbox
    id="autostart-checkbox"
    [label]="'SETTINGS.AUTOSTART_LABEL' | translate"
    [checked]="settings().autostart"
    (checkedChange)="onAutostartChange($event)"
  />
</app-setting-field>

<!-- Checkbox + conditional number input (history fields) -->
<app-setting-field>
  <app-setting-checkbox
    id="delete-max-checkbox"
    [label]="'SETTINGS.DELETE_AFTER_MAX_LABEL' | translate"
    [checked]="settings().deleteAfterMaxEntries"
    (checkedChange)="onDeleteAfterMaxChange($event)"
  />
  <div class="flex items-center gap-3" [class.opacity-50]="!settings().deleteAfterMaxEntries">
    <input hlmInput #maxEntriesInput type="number" [value]="settings().maxEntries"
      (blur)="onMaxEntriesBlur(maxEntriesInput.valueAsNumber)"
      [attr.disabled]="!settings().deleteAfterMaxEntries ? '' : null"
      min="5" max="999" class="w-24" />
    <span class="text-[12px] text-muted-foreground">
      {{ 'SETTINGS.MAX_ENTRIES_RANGE' | translate:{ min: 5, max: 999 } }}
    </span>
  </div>
</app-setting-field>
```

---

### SettingCheckboxComponent

**Selector:** `app-setting-checkbox`
**File:** `features/settings/components/setting-checkbox/setting-checkbox.component.ts`

Replaces the 4× repeated raw `<input type="checkbox">` + `<label hlmLabel>` rows. Uses `HlmCheckbox` from spartan (generated in Section 3).

**Inputs:**

| Input | Type | Required | Purpose |
|---|---|---|---|
| `id` | `string` | yes | Links `<label for>` to the checkbox |
| `label` | `string` | yes | Already-translated label text |
| `checked` | `boolean` | yes | Checkbox state |

**Output:** `checkedChange: OutputEmitterRef<boolean>`

**Usage:**
```html
<app-setting-checkbox
  id="autostart-checkbox"
  [label]="'SETTINGS.AUTOSTART_LABEL' | translate"
  [checked]="settings().autostart"
  (checkedChange)="onAutostartChange($event)"
/>
```

---

## Section 3: New Spartan Helm Components

Two components need to be generated before use. Run via the spartan CLI:

```bash
pnpm spartan add checkbox
pnpm spartan add separator
```

### HlmCheckbox

Used inside `SettingCheckboxComponent` to replace raw `<input type="checkbox" class="h-4 w-4 ...">`. Adds consistent design-system styling and accessibility (label association, focus ring).

Tsconfig alias added: `"@spartan-ng/helm/checkbox": ["./src/libs/ui/checkbox/src/index.ts"]`

### HlmSeparator

Replaces the two `<hr class="border-border" />` dividers between settings sections.

```html
<!-- before -->
<hr class="border-border" />

<!-- after -->
<hlm-separator />
```

Tsconfig alias added: `"@spartan-ng/helm/separator": ["./src/libs/ui/separator/src/index.ts"]`

---

## File Structure After Implementation

```
src/app/
├── shared/
│   └── ui/
│       ├── page-header/
│       │   └── page-header.component.ts
│       ├── empty-state/
│       │   └── empty-state.component.ts
│       ├── keyboard-hint/
│       │   └── keyboard-hint.component.ts
│       └── loading-spinner/
│           └── loading-spinner.component.ts
└── features/
    └── settings/
        └── components/
            ├── setting-field/
            │   └── setting-field.component.ts
            └── setting-checkbox/
                └── setting-checkbox.component.ts

src/libs/ui/
├── checkbox/        ← generated by spartan CLI
└── separator/       ← generated by spartan CLI
```

## Out of Scope

- The settings section headers (`<p class="text-[11px] font-semibold uppercase tracking-widest ...">`) — only 3 instances, all in one file, not worth extracting.
- The clipboard-list skeleton loading rows — unique to that component, not duplicated.
- The image-preview copied toast — unique to that component.
- Tailwind class string consolidation — low value without a design token layer.
