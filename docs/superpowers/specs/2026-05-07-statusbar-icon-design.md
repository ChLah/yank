# Statusbar / App Icon Redesign — Design Spec (Superseded)

**Date:** 2026-05-07

> ⚠️ **Superseded by [2026-05-13-app-icon-design.md](2026-05-13-app-icon-design.md).**
>
> The "single bold letter Y" concept described below was abandoned after we evaluated it against Microsoft's [Windows app-icon design guidance](https://learn.microsoft.com/en-us/windows/apps/design/iconography/app-icon-design), which explicitly recommends against typography in app icons. The shipped icon is a flat geometric clipboard slip with a dog-eared corner — see the linked spec for the design that's actually in the repo.
>
> This file is kept for historical context (the concept exploration, palette discussion, and pipeline overview were useful inputs to the final design) but is no longer authoritative.

---

## Overview

Replace the current generic logo (two interlocking teal/yellow circles) with a distinctive logomark that reads clearly at every size from a 16×16 system tray glyph up to a 1024×1024 app icon. The same master image powers the Windows tray icon, the bundled `.ico`/`.icns` app icon, the favicon, and the Microsoft Store `Square*Logo` variants.

---

## Concept

A single bold letter **Y** logomark.

- Anchors to the project name (YANK).
- Carries the vim/emacs "yank = copy" lineage that the product is named after.
- A letterform has a strong silhouette at 16×16 — no narrative detail to collapse.

---

## Form

Geometric **monoline** glyph:

- Two clean V arms above a straight vertical stem.
- Even stroke weight throughout, **roughly 20% of the glyph's bounding height**, so the silhouette survives 16×16.
- **Rounded line caps** — softer, slightly playful, ties into the curl below.
- The bottom of the descending stem terminates in a **small curl that hooks to the right** — a flicked tail evoking the "yank/grab away" gesture. This is the only ornament; everything else is geometric and quiet.
- Centered, ~80% of the canvas, generous safe-area padding.

---

## Palette

Modernised continuity with today's icon — same brand colours, applied with intent.

| Element              | Colour    | Hex       |
| -------------------- | --------- | --------- |
| V arms + vertical stem | Teal    | `#1AB6C9` |
| Hook curl (tail only) | Yellow   | `#FFC72C` |
| Background           | Transparent | —      |

The yellow accent is restricted to the curl so the eye lands on the only "interesting" detail. Transparent background means no tile is needed — the mark sits cleanly on light or dark Windows taskbars and on browser favicon strips alike.

---

## Sizing & Asset Pipeline

Generate one **1024×1024 master PNG** with transparent background. Tauri's icon CLI derives every other size from that single source.

```bash
pnpm tauri icon path/to/master.png
```

This regenerates:

- `src-tauri/icons/icon.png`, `icon.ico`, `icon.icns`
- `32x32.png`, `128x128.png`, `128x128@2x.png`
- All `Square*Logo.png` Microsoft Store variants

The same master also serves as the favicon at `public/favicon.ico` — convert the master PNG to a multi-resolution `.ico` (16/32/48) and overwrite the existing file.

---

## Paused Variant

Don't regenerate — derive in post.

Take the master, **desaturate the entire mark to neutral grey `#9CA3AF`**, keep the silhouette identical, and save as `src-tauri/icons/32x32-paused.png`. This replaces today's paused tray icon, which is currently visually indistinguishable from the active one.

**Fallback** if the desaturated version doesn't read as obviously "paused" against the active icon at 32×32: drop alpha to ~60% as well.

---

## Image-Generation Prompt

The prompt below is portable across DALL-E 3 / GPT-image, Imagen, Midjourney, and Stable Diffusion / Flux. It specifies subject, exact colours, sizing constraints, and an explicit deny-list to keep the output a clean vector-style mark.

```
Modern flat vector app icon of a single bold geometric letter "Y" as a
minimal logomark. Even-weight monoline strokes with rounded line caps;
two clean V arms above a straight vertical stem; the bottom of the stem
terminates in a small curl that hooks to the right, like a flicked tail
or a vim-style "yank" gesture. Stroke weight roughly 20% of the glyph
height so it stays legible at 16x16 pixels. The Y arms and stem are
teal (#1AB6C9); only the hooked curl at the bottom is warm yellow
(#FFC72C). Centered on a fully transparent background, generous safe-area
padding, square 1:1, 1024x1024 canvas. Crisp vector edges, no gradients,
no shadows, no 3D, no outline, no text, no extra decoration. Style: clean
geometric tech-startup logomark, Linear/Vercel/Spartan design sensibility.
```

---

## Integration Steps

1. Run the generator with the prompt above; pick the cleanest result. Verify at 16×16 and 32×32 that the V/stem/hook are all distinguishable.
2. If the output has any residual background pixels, mask to true transparency before continuing.
3. Save as `src-tauri/icons/icon-source.png` (1024×1024, transparent).
4. Run `pnpm tauri icon src-tauri/icons/icon-source.png` to regenerate all derived variants.
5. Generate `32x32-paused.png` from the master: desaturate the mark to `#9CA3AF`, save at 32×32.
6. Convert the master to a multi-resolution `public/favicon.ico` (16/32/48) — overwrite the existing file.
7. Build (`pnpm tauri build`) and visually verify: tray icon (active + paused), app icon in Start menu, taskbar entry, installer, and the favicon when running `pnpm start` in a browser.

---

## Out of Scope

- Animated or motion variants (e.g. a hover bounce on the tray icon).
- Per-locale or per-theme alternate marks.
- Updating any in-app illustrations or empty-state graphics.
- A separate, more detailed app-store / hero rendering — the same flat mark is reused everywhere.
