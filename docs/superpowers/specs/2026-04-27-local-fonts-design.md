# Local Font Hosting via Fontsource

**Date:** 2026-04-27  
**Status:** Approved

## Problem

Fonts (DM Sans, JetBrains Mono) are loaded from Google Fonts at runtime, requiring an outbound network request and leaking user IP to Google's servers.

## Solution

Replace Google Fonts with fontsource variable-font packages so fonts are bundled and served locally.

## Changes

### 1. Install packages

```
pnpm add @fontsource-variable/dm-sans @fontsource-variable/jetbrains-mono
```

### 2. `src/styles.css`

Add at the top:

```css
@import '@fontsource-variable/dm-sans';
@import '@fontsource-variable/jetbrains-mono';
```

Existing `font-family` declarations are unchanged — fontsource uses the same family name strings.

### 3. `src/index.html`

Remove the three Google Fonts `<link>` tags:

```html
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?..." rel="stylesheet" />
```

## Out of Scope

- Tailwind config — no changes needed (font names unchanged)
- Angular config — no changes needed (imports land in global stylesheet)
- Optical-size axis — standard variable font axes (weight + italic) are sufficient
