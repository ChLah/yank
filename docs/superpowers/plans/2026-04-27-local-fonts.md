# Local Font Hosting via Fontsource Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Google Fonts CDN with locally hosted fontsource packages for DM Sans and JetBrains Mono.

**Architecture:** Install variable-font fontsource packages, import them in the global stylesheet, and remove all Google Fonts `<link>` tags from the HTML entry point. No font-family declarations change — fontsource uses identical family name strings.

**Tech Stack:** pnpm, @fontsource-variable/dm-sans, @fontsource-variable/jetbrains-mono, Angular (src/styles.css, src/index.html)

---

### Task 1: Install fontsource packages

**Files:**
- Modify: `package.json` (via pnpm add)

- [ ] **Step 1: Install both variable-font packages**

```bash
pnpm add @fontsource-variable/dm-sans @fontsource-variable/jetbrains-mono
```

Expected output: two packages added to `dependencies`, `node_modules/@fontsource-variable/` directories created.

- [ ] **Step 2: Verify packages installed correctly**

```bash
ls node_modules/@fontsource-variable/
```

Expected: `dm-sans` and `jetbrains-mono` directories present.

---

### Task 2: Add fontsource imports to global stylesheet

**Files:**
- Modify: `src/styles.css` (lines 1–6, insert before existing imports)

- [ ] **Step 1: Add import lines at the very top of `src/styles.css`**

Replace the current top of the file:

```css
@layer theme, base, components, utilities;
@import "tailwindcss/theme.css" layer(theme);
```

With:

```css
@import '@fontsource-variable/dm-sans';
@import '@fontsource-variable/jetbrains-mono';

@layer theme, base, components, utilities;
@import "tailwindcss/theme.css" layer(theme);
```

The fontsource imports must come before the `@layer` declaration so they aren't accidentally scoped into a layer.

---

### Task 3: Remove Google Fonts link tags from index.html

**Files:**
- Modify: `src/index.html` (lines 9–11)

- [ ] **Step 1: Remove the three Google Fonts `<link>` tags from `src/index.html`**

Remove these three lines:

```html
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;1,9..40,400&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
```

The `<head>` should end up as:

```html
  <head>
    <meta charset="utf-8" />
    <title>ClipboardManager</title>
    <base href="/" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link rel="icon" type="image/x-icon" href="favicon.ico" />
  </head>
```

---

### Task 4: Verify and commit

**Files:** none new

- [ ] **Step 1: Run the dev server and verify fonts render**

```bash
pnpm tauri dev
```

Open the app and confirm:
- Body text uses DM Sans (check in DevTools → computed → font-family)
- Code/monospace elements use JetBrains Mono
- Network tab shows no requests to `fonts.googleapis.com` or `fonts.gstatic.com`

- [ ] **Step 2: Commit all changes**

```bash
git add src/styles.css src/index.html package.json pnpm-lock.yaml
git commit -m "refactor: replace Google Fonts with local fontsource packages"
```
