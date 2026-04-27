# Settings Auto-Save Design

**Date:** 2026-04-27
**Status:** Approved

## Goal

Remove the explicit save button from the settings screen and instead persist each setting immediately when it changes, giving a seamless, form-free experience.

## Current State

The settings component has four `linkedSignal`s (shortcut, maxEntries, language, theme) and a `save()` method triggered by a submit button. Language and theme already apply side-effects immediately but only persist on button click.

## New Design

### Single Settings Signal

Replace the four individual `linkedSignal`s with one:

```typescript
protected settings = linkedSignal<AppSettings>(
  () => this.settingsService.settings.value() ?? DEFAULT_SETTINGS
);
```

The template binds to `settings().shortcut`, `settings().maxEntries`, etc.

### Save Triggers

| Field | Event | Action |
|-------|-------|--------|
| Shortcut | `captureShortcut` — when a valid combo (≥2 parts) is detected | `settings.update(s => ({ ...s, shortcut }))` then `persist()` |
| MaxEntries | `(blur)` on the number input | Clamp value to [5, 100], `settings.update(s => ({ ...s, maxEntries }))` then `persist()` |
| Language | `(valueChange)` on the select | `settings.update(s => ({ ...s, language }))`, `i18nService.setLanguage()`, then `persist()` |
| Theme | `(valueChange)` on the select | `settings.update(s => ({ ...s, theme }))`, `themeService.applyTheme()`, then `persist()` |

### persist() Helper

```typescript
private async persist(): Promise<void> {
  this.error.set(null);
  try {
    await this.settingsService.saveSettings(this.settings());
  } catch (e) {
    this.error.set(String(e));
    setTimeout(() => this.error.set(null), 2000);
  }
}
```

### Removed

- `shortcut`, `maxEntries`, `language`, `theme` individual `linkedSignal`s
- `saving` signal and its usage
- `saved` signal and its success alert
- `save()` method
- Save button and its wrapper `<div>`
- `<form>` element replaced with `<div>` (no submit needed)
- `HlmButton` import (no longer used)

### Kept

- `error` signal and its destructive alert — persisted errors need user visibility
- All existing side-effects: `i18nService.setLanguage()`, `themeService.applyTheme()`

## Template Changes

- `<form (ngSubmit)="save()">` → `<div>`
- `[value]="shortcut()"` → `[value]="settings().shortcut"`
- `[value]="maxEntries()"` → `[value]="settings().maxEntries"`, add `(blur)="onMaxEntriesBlur($event)"`
- `(input)="maxEntries.set(...)"` removed (no longer needed for signal sync — blur handles it)
- `[value]="language() ?? ''"` → `[value]="settings().language ?? ''"`
- `[value]="theme()"` → `[value]="settings().theme"`
- Remove saved alert and save button

## Error Handling

Errors auto-clear after 2 seconds. No per-field error states — a single error banner is sufficient given saves are silent on success.
