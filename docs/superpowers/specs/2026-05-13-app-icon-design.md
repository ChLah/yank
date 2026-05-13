# App Icon Redesign — Design Spec

**Date:** 2026-05-13

**Supersedes:** [2026-05-07-statusbar-icon-design.md](2026-05-07-statusbar-icon-design.md)

---

## Overview

Replace the generic logo with a distinctive, flat logomark that reads clearly from a 16×16 system tray glyph up to a 1024×1024 app icon. One master SVG drives every derived asset: the Windows tray icon and its paused variant, the bundled `.ico`/`.icns` app icon, the favicon, and every Microsoft Store `Square*Logo` tile.

The earlier "single bold letter Y" concept (see superseded spec) was abandoned after we evaluated it against Microsoft's [Windows app-icon design guidance](https://learn.microsoft.com/en-us/windows/apps/design/iconography/app-icon-design), which explicitly recommends against typography in app icons.

---

## Concept

A single rounded **clipboard slip** with its **top-right corner folded inward** — a classic dog-ear, frozen mid-peel.

- One literal metaphor: the slip is the unit of clipboard history; the folded corner is the act of "yanking" an item.
- The asymmetric outline (a rounded rectangle minus a chamfered top-right corner) gives the icon a distinctive silhouette that Microsoft's tray-icon guidance demands ("prefer icons with unique outlines over square/rectangular shaped icons").
- The brand accent sits **top-right**, leaving the **bottom-right quadrant clear** for future Windows overlay icons (warning/error/paused).

---

## Form

Hand-authored SVG; flat geometry; zero gradients, shadows, or glow.

- **Slip body**: rounded rectangle, ~70% of canvas width × ~78% of canvas height, centered with a 3% downward bias.
- **Corner radius**: ~17% of the slip's own width — soft like a rounded card, not a square plate.
- **Fold**: a straight diagonal cut from the top edge (65% across) to the right edge (30% down). The cut removes a 250×250 right triangle from the slip's top-right corner.
- **Folded flap**: an isosceles right triangle, the geometric reflection of the cut-off corner over the fold diagonal. Its right-angle vertex sits inside the slip body, exposing the paper's underside.
- **Crease**: a darker-teal hairline along the fold diagonal, suggesting paper thickness.
- **Rotation**: the entire composition is rotated 3° counter-clockwise around the canvas center for a subtle in-motion feel.

---

## Palette

| Element              | Colour    | Hex       |
| -------------------- | --------- | --------- |
| Slip body            | Deep teal | `#0F8FA0` |
| Folded flap (underside) | Warm amber | `#FFC72C` |
| Fold crease (hairline) | Darker teal | `#0A6E7C` |
| Background           | Transparent | —      |

`#0F8FA0` was chosen over the brighter `#1AB6C9` used in earlier branding so that at least half the icon passes a 3.0:1 contrast ratio against both light and dark Windows taskbars — the threshold Microsoft sets for accessibility on theme-sensitive surfaces.

Yellow is confined to the flap (~10% of the canvas) so it reads as a deliberate accent rather than as a status colour. Microsoft notes that pure red/yellow/green should be reserved for status overlays; small accents like this are explicitly permitted.

---

## Master and asset pipeline

The master lives at **`src-tauri/icons/icon-source.svg`** (hand-authored vector — see the file for the exact path coordinates).

### Regenerate all variants

```bash
# 1. Rasterize SVG → 1024×1024 transparent PNG master
node -e "require('sharp')('src-tauri/icons/icon-source.svg',{density:288}).resize(1024,1024).png().toFile('src-tauri/icons/icon-source.png')"

# 2. Generate every Tauri-managed variant from that master
pnpm tauri icon src-tauri/icons/icon-source.png

# 3. Derive the paused tray variant
node scripts/generate-paused-icon.mjs

# 4. Sync the favicon
cp src-tauri/icons/icon.ico public/favicon.ico
```

Step 2 produces:

- `icon.png`, `icon.ico` (multi-resolution: 16/32/48/64/128/256), `icon.icns`
- `32x32.png`, `64x64.png`, `128x128.png`, `128x128@2x.png`
- Every `Square*Logo.png` and `StoreLogo.png`
- `android/` and `ios/` directories (ignored by the current Windows-only build target)

`sharp` is a devDependency, used both by the SVG rasterization one-liner and by `scripts/generate-paused-icon.mjs`.

---

## Paused variant

`src-tauri/icons/32x32-paused.png` is derived from the active 32×32 tray icon by replacing every non-transparent pixel with neutral grey `#9CA3AF` while preserving the alpha channel. The silhouette is identical to the active icon; only the chroma is removed, giving an unambiguous "paused" read.

The derivation script is `scripts/generate-paused-icon.mjs` — rerun any time `32x32.png` changes.

**Fallback** if the grey variant still reads as too similar to active at tray size: drop the alpha byte from `0xFF` to `0x99` in the script (~60% opacity).

---

## Tray tooltip

Set in `src-tauri/src/lib.rs` at the `TrayIconBuilder` call:

```rust
.tooltip("YANK")
```

Matches `productName` in `tauri.conf.json`.

---

## Integration outcome (2026-05-13)

All steps completed and verified:

1. ✅ `src-tauri/icons/icon-source.svg` committed (937 bytes).
2. ✅ `icon-source.png` rasterized at 1024×1024 RGBA via sharp.
3. ✅ `pnpm tauri icon` regenerated every variant.
4. ✅ Center-pixel sampling on `32x32.png` and `icon.png` confirmed `#0F8FA0`; on `32x32-paused.png` confirmed `#9CA3AF`.
5. ✅ `public/favicon.ico` synced from `icon.ico`.
6. ✅ Tray tooltip changed from "Clipboard Manager" to "YANK".
7. ⏳ Visual verification of every surface (tray active + paused, Start menu, taskbar, installer, favicon) pending a `pnpm tauri build`.

---

## Out of scope

- Animated or motion variants (e.g. a hover bounce on the tray icon).
- Per-locale or per-theme alternate marks. A separate light-theme PNG would only be needed if the deep teal still reads as washed-out against very-light Windows accent colours — punt until observed.
- A hand-tuned 16×16 frame for the tray. If the auto-downsampled frame in `icon.ico` looks muddy in the notification area, author a bespoke 16-px PNG and inject it into the ICO; flag separately.
- Updating in-app illustrations or empty-state graphics.
