# spartan/ng Integration Design

**Date:** 2026-04-23  
**Project:** clipboard-manager (Tauri v2 + Angular v21 + Tailwind v4)

## Goal

Replace hand-rolled Tailwind control classes (buttons, inputs, labels, badges, alert banners) with spartan/ng equivalents to eliminate duplication and establish a consistent, maintainable UI primitive layer.

## Installation Approach

CLI-driven (Approach A):

1. Install `@spartan-ng/cli` as a local dev dependency (not global).
2. Add a `"spartan"` npm script to `package.json` so the CLI is invocable via `pnpm spartan`.
3. Run `pnpm exec ng g @spartan-ng/cli:init` to scaffold the theme and update `styles.css`.
4. Add each needed component via `pnpm spartan` (or `pnpm exec ng g @spartan-ng/cli:ui`).

Components to install: `button`, `input`, `label`, `badge`, `alert`

Generated files land in `src/libs/ui/` (spartan default output path).

## CSS Migration

`src/styles.css` changes from the single Tailwind v4 shorthand to explicit layer imports plus the spartan preset:

```css
@layer theme, base, components, utilities;
@import "tailwindcss/theme.css" layer(theme);
@import "tailwindcss/preflight.css" layer(base);
@import "tailwindcss/utilities.css";
@import "@spartan-ng/brain/hlm-tailwind-preset.css";
```

Existing custom rules (dark `color-scheme`, `box-sizing`, font stack, `scrollbar-thin` utility) are preserved below the imports.

## Component Replacement Map

| File | Element | Spartan replacement |
|------|---------|-------------------|
| `clipboard-list.component.ts` | count pill `<span>` | `HlmBadgeDirective` (`hlmBadge`) |
| `clipboard-list.component.ts` | "Try again" `<button>` | `HlmButtonDirective` (`hlmBtn`) |
| `clipboard-entry.component.ts` | delete icon `<button>` | `HlmButtonDirective`, ghost + icon variant |
| `settings.component.ts` | `<label>` × 2 | `HlmLabelComponent` |
| `settings.component.ts` | `<input type="text">` | `HlmInputDirective` (`hlmInput`) |
| `settings.component.ts` | `<input type="number">` | `HlmInputDirective` (`hlmInput`) |
| `settings.component.ts` | submit `<button>` | `HlmButtonDirective` (`hlmBtn`) |
| `settings.component.ts` | error/success banners | `HlmAlertComponent`, `HlmAlertDescriptionDirective` |
| `image-preview.component.ts` | copy `<button>` | `HlmButtonDirective` (`hlmBtn`) |

Elements **not** replaced:
- `<a routerLink>` icon links (settings gear, back arrow) — keep as plain `<a>` with Tailwind classes; spartan button-as-link requires different wiring.
- `<kbd>` elements in the footer — display only, no interactive equivalent.
- Error/image placeholder divs — structural layout, not controls.

## Constraints

- **Default spartan styling only** — no customisation of generated component files beyond what the CLI produces.
- **Layout unchanged** — existing flex/grid/padding structure is preserved; only the control markup and classes change.
- **pnpm throughout** — all install and generate commands use `pnpm`.
- **Signal forms** — no `ReactiveFormsModule`; inputs remain bound via plain signals as they are today.
