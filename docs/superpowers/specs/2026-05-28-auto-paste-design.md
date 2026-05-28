# Auto-Paste Feature Design

**Date:** 2026-05-28  
**Status:** Approved

## Overview

When the user selects an item from any paste path in Yank, the content is currently placed on the clipboard and the popup closes — the user then manually presses Ctrl+V. Auto-Paste eliminates that step by automatically sending Ctrl+V to the previously-focused application after the popup closes.

A toggle in Settings → History (Verlauf) enables/disables the feature. It defaults to on.

---

## Settings Model

### TypeScript (`src/app/core/models/settings.model.ts`)
- Add `autoPaste: boolean` to `AppSettings`
- Default `true` in `DEFAULT_SETTINGS`
- Add `autoPaste` to the `HistorySettings` pick type in `history.component.ts`
- Include `autoPaste` in the `historySlice` computed in `settings.component.ts`

### Rust (`src-tauri/src/models.rs`)
- Add `auto_paste: bool` to `AppSettings`
- Default `true` in `AppSettings::default()`
- The SQLite store already serializes settings as a key-value table; the new field follows the same path as existing fields (e.g. `auto_check_updates`)

---

## Rust Backend

### No stored window handle needed

When `window.hide()` is called, Windows automatically deactivates our window and restores focus to the previously-active application — standard Win32 behaviour (same as dismissing a context menu with Escape). There is no need to capture or store the previous HWND, and no `SetForegroundWindow` call is required.

### Shared paste-and-close helper

A private async function `do_paste_and_close` in `commands.rs`. Uses `tokio::time::sleep` so the delay is non-blocking:

```rust
async fn do_paste_and_close(app_handle: &AppHandle, auto_paste: bool) {
    // 1. Hide the popup — Windows restores focus to the previous app automatically
    if let Some(window) = app_handle.get_webview_window("main") {
        let _ = window.hide();
    }
    if !auto_paste {
        return;
    }
    // 2. Wait for focus transition, then send Ctrl+V to whichever window now has focus
    #[cfg(target_os = "windows")]
    {
        use windows::Win32::UI::Input::KeyboardAndMouse::{
            SendInput, INPUT, KEYEVENTF_KEYUP, VK_CONTROL, VK_V,
        };
        tokio::time::sleep(std::time::Duration::from_millis(150)).await;
        let inputs = [
            make_key_input(VK_CONTROL.0, 0),
            make_key_input(VK_V.0, 0),
            make_key_input(VK_V.0, KEYEVENTF_KEYUP.0),
            make_key_input(VK_CONTROL.0, KEYEVENTF_KEYUP.0),
        ];
        unsafe { SendInput(&inputs, std::mem::size_of::<INPUT>() as i32) };
    }
}
```

### New Tauri commands

Both are `async fn` so the 150 ms sleep does not block the Tauri event loop:

```rust
#[tauri::command]
pub async fn paste_entry_and_close(
    id: i64,
    store: StoreState<'_>,
    session_stats: SessionStatsState<'_>,
    app_handle: AppHandle,
) -> Result<(), String> {
    store.restore_to_clipboard(id).map_err(|e| e.to_string())?;
    session_stats.pastes.fetch_add(1, Ordering::Relaxed);
    let auto_paste = store.get_settings()
        .map(|s| s.auto_paste)
        .unwrap_or(false);
    do_paste_and_close(&app_handle, auto_paste).await;
    Ok(())
}

#[tauri::command]
pub async fn paste_text_and_close(
    text: String,
    store: StoreState<'_>,
    app_handle: AppHandle,
) -> Result<(), String> {
    let mut clipboard = arboard::Clipboard::new().map_err(|e| e.to_string())?;
    clipboard.set_text(text).map_err(|e| e.to_string())?;
    let auto_paste = store.get_settings()
        .map(|s| s.auto_paste)
        .unwrap_or(false);
    do_paste_and_close(&app_handle, auto_paste).await;
    Ok(())
}
```

Both commands are registered in `lib.rs` → `invoke_handler`. The old `set_clipboard` and `set_clipboard_text` commands are removed.

---

## Angular Frontend

### `TauriBridgeService`
Two new methods replace the old `setClipboard`/`setClipboardText` + `hidePopup` combinations:

```ts
pasteEntryAndClose(id: number): Promise<void> {
  return invoke('paste_entry_and_close', { id });
}

pasteTextAndClose(text: string): Promise<void> {
  return invoke('paste_text_and_close', { text });
}
```

`setClipboard` and `setClipboardText` are **removed** from `TauriBridgeService` — all their callers are migrated to the new methods. `ClipboardService.setClipboard()` (which wrapped `bridge.setClipboard` + `bridge.hidePopup`) is removed too; its call site in `clipboard-tab.component.ts` calls `bridge.pasteEntryAndClose` directly.

`hidePopup()` is **kept** — it is still used by non-paste close paths:
- Escape to close in `clipboard-tab` and `snippets-tab`
- `onEscape()` in image preview
- `onOpenSettingsClick()` in `clipboard-list.component.ts` (hides popup before opening settings window)

### Updated call sites

| File | Old call | New call |
|------|----------|----------|
| `clipboard.service.ts` → `setClipboard()` | `bridge.setClipboard(id)` + `bridge.hidePopup()` | `bridge.pasteEntryAndClose(id)` |
| `clipboard-tab.component.ts` → `onEditConfirm()` | `bridge.setClipboardText(text)` + `bridge.hidePopup()` | `bridge.pasteTextAndClose(text)` |
| `clipboard-tab.component.ts` → `onTransformApplied()` | `bridge.setClipboardText(text)` + `bridge.hidePopup()` | `bridge.pasteTextAndClose(text)` |
| `clipboard-tab.component.ts` → `onMergeApplied()` | `bridge.setClipboardText(merged)` + `bridge.hidePopup()` | `bridge.pasteTextAndClose(merged)` |
| `image-preview.component.ts` → `copyToClipboard()` | `bridge.setClipboard(id)` + `bridge.hidePopup()` | `bridge.pasteEntryAndClose(id)` |
| `snippets-tab.component.ts` → snippet paste (×2) | `bridge.setClipboardText(text)` + `bridge.hidePopup()` | `bridge.pasteTextAndClose(text)` |

`SettingsService` is **not** injected into any of these — the backend reads `auto_paste` from the settings store itself, keeping the frontend call sites free of that concern.

### Settings UI (`history.component.ts`)

A new row is added at the bottom of the History section, following the exact same layout as the existing switches:

```html
<div class="flex items-center justify-between gap-4 py-3.5">
  <label class="text-[13px] text-foreground" for="auto-paste-switch">
    {{ 'SETTINGS.AUTO_PASTE_LABEL' | translate }}
  </label>
  <hlm-switch
    id="auto-paste-switch"
    [checked]="settings().autoPaste"
    (checkedChange)="onAutoPasteChange($event)"
  />
</div>
```

### i18n

**`en.ts`:**
```ts
AUTO_PASTE_LABEL: 'Auto-Paste',
```

**`de.ts`:**
```ts
AUTO_PASTE_LABEL: 'Auto-Einfügen',
```

---

## Edge Cases

- **No prior focused window** (popup opened from tray): after `window.hide()`, Windows will focus the desktop or taskbar. `SendInput(Ctrl+V)` targets whatever has focus — likely a no-op. Acceptable behaviour.
- **Escape to close**: calls `bridge.hidePopup()` directly — never calls `pasteEntryAndClose` or `pasteTextAndClose`, so auto-paste is not triggered.
- **Image paste**: uses `pasteEntryAndClose(id)` — works in any application that accepts image paste (browsers, chat apps, image editors); silently ignored elsewhere.
- **Cross-platform**: `SendInput` is behind `#[cfg(target_os = "windows")]`. `do_paste_and_close` compiles on all platforms; the paste step is simply omitted on non-Windows.
