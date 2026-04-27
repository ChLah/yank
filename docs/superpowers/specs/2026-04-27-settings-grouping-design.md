# Settings Grouping Design

**Date:** 2026-04-27
**Status:** Approved

## Problem

The settings page has grown to 7 items in a flat list (shortcut, autostart, window position, limit history by count, limit history by age, language, theme). The flat layout reads as cluttered and gives no visual hierarchy to guide the user.

## Goal

Group settings into thematic sections with section headers and dividers, making the page easier to scan without adding visual bulk or breaking the compact popup window size.

## Groups

| Group | Settings |
|---|---|
| General | Global Shortcut, Start at Login (autostart), Window Position |
| Appearance | Language, Theme |
| History | Limit history size (deleteAfterMaxEntries + maxEntries), Auto-delete old entries (deleteAfterDays + maxDays) |

## Visual Design

**Section header:** `<p>` element with `text-[11px] font-semibold uppercase tracking-widest text-muted-foreground`. Consistent with the existing field-label style used throughout the component.

**Divider:** `<hr class="border-border">` between groups (not before the first group).

**Spacing:** The outer scroll container keeps `gap-5` between top-level items. Each group becomes one top-level item — a `<div>` with `space-y-3` inside (slightly tighter than the current `gap-5` per field, reinforcing that items inside a group belong together).

**No new components.** All changes are inline in `settings.component.ts`.

## i18n Changes

Three new keys added to both `en.ts` and `de.ts`:

| Key | English | German |
|---|---|---|
| `SETTINGS.GROUP_GENERAL` | `General` | `Allgemein` |
| `SETTINGS.GROUP_APPEARANCE` | `Appearance` | `Darstellung` |
| `SETTINGS.GROUP_HISTORY` | `History` | `Verlauf` |

The `translation.interface.ts` must also be updated to include these three keys.

## Out of Scope

- No new Angular components (no `SettingsSectionComponent` or similar).
- No accordion/collapsible behavior.
- No card-style elevation per group.
- No changes to settings logic, persistence, or data model.
