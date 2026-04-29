# Pause / Incognito Capture Mode — Design Spec

**Date:** 2026-04-29

---

## Overview

A toggle that temporarily stops Yank from recording new clipboard entries. Useful when working with passwords, API keys, or any content the user does not want saved to history.

---

## Trigger Points

### 1. Header toggle (primary)

A `hlm-switch` component sits in the clipboard popup header alongside a static **"Capture"** label. The switch color communicates state at a glance:

- **Checked (recording on):** green background — override with `data-[state=checked]:bg-green-500`
- **Unchecked (paused):** red background — override with `data-[state=unchecked]:bg-red-500`

The label is static ("Capture") and never changes text. The color alone signals the current state.

### 2. Configurable hotkey (secondary)

An optional global shortcut that toggles capture without opening the popup. Default value is empty (no hotkey registered). Configured in **Settings → Privacy** group, below the existing excluded apps section, using the same shortcut-input pattern as the main popup shortcut.

---

## Behavior

- When paused, the clipboard monitor skips capture — no new entries are written to the database.
- Existing history entries are unaffected (not hidden, not deleted).
- The paused state is **not persisted**. On every app start Yank always resumes in recording mode (switch checked, green).
- If a hotkey is configured and fired while the popup is open, the header switch updates in real time.

---

## Data / State

No database changes required. The paused state is a runtime boolean in the Rust monitor (or a shared Tauri state). The frontend reads it once on popup open (via a Tauri command `get_capture_paused`) and subscribes to a `capture-paused-changed` event for live updates when the hotkey fires while the popup is visible.

---

## Settings

A new **"Pause shortcut"** field is added inside the existing Privacy settings group:

```
Privacy
├── Excluded apps          (existing)
└── Pause capture shortcut (new) — text input, default empty, same UX as main shortcut field
```

The shortcut is registered/unregistered via the same global-shortcut mechanism as the main popup shortcut. If the field is empty, no shortcut is registered.

---

## Components Affected

| Layer | Change |
|---|---|
| Rust (`monitor.rs`) | Check paused flag before writing entry; expose `toggle_capture_paused` and `get_capture_paused` Tauri commands |
| Rust (`settings` / state) | Add `capture_paused: bool` to a shared `AppState` struct (runtime only, not persisted) |
| `TauriBridgeService` | Add `toggleCapturePaused()`, `getCapturePaused()`, and `onCapturePausedChanged()` methods |
| `ClipboardListComponent` | Add `hlm-switch` + "Capture" label to header; bind to paused state; toggle on change |
| `SettingsComponent` / Privacy group | Add pause shortcut input field |
| `AppSettings` model | Add `pauseShortcut: string` (default `''`) |
| i18n (`en.ts`, `de.ts`) | Add keys for label, settings field label, and tooltip |

---

## Out of Scope

- Tray icon change when paused
- Visual banner/warning when app opens (state always resets to recording)
- Per-app pause rules (that's covered by capture exclusion rules)
