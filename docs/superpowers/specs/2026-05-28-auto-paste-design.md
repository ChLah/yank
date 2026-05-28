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

### Shared state: previous window handle

A new `Arc<AtomicUsize>` is added to app state under the type alias `PreviousHwnd`. It stores the raw HWND (Windows window handle) of the application that was focused immediately before Yank's popup appeared.

```rust
pub type PreviousHwnd = AtomicUsize;
```

It is managed via `app.manage(Arc::new(AtomicUsize::new(0)))` in `lib.rs`. In `show_popup()` it is retrieved via `app.state::<Arc<PreviousHwnd>>()` — no signature change needed.

In `windows.rs` → `show_popup()`, **before** calling `window.show()`:
```rust
#[cfg(target_os = "windows")]
{
    use windows::Win32::UI::WindowsAndMessaging::GetForegroundWindow;
    let hwnd = unsafe { GetForegroundWindow() };
    app.state::<Arc<PreviousHwnd>>().store(hwnd.0 as usize, Ordering::Relaxed);
}
```

### Shared paste-and-close helper (Windows-only)

A private async Rust function `do_paste_and_close` in `commands.rs` (or a new `paste.rs` module). Uses `tokio::time::sleep` so the delay is non-blocking:

```rust
async fn do_paste_and_close(app_handle: &AppHandle, prev_hwnd: usize, auto_paste: bool) {
    // 1. Hide the popup
    if let Some(window) = app_handle.get_webview_window("main") {
        let _ = window.hide();
    }
    if !auto_paste || prev_hwnd == 0 {
        return;
    }
    // 2. Restore focus and send Ctrl+V (Windows only)
    #[cfg(target_os = "windows")]
    {
        use windows::Win32::Foundation::HWND;
        use windows::Win32::UI::WindowsAndMessaging::SetForegroundWindow;
        use windows::Win32::UI::Input::KeyboardAndMouse::{
            SendInput, INPUT, KEYEVENTF_KEYUP, VK_CONTROL, VK_V,
        };
        unsafe {
            SetForegroundWindow(HWND(prev_hwnd as isize));
        }
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

If `prev_hwnd` is 0 (e.g. popup opened via tray icon with no prior window), the paste step is silently skipped.

### New Tauri commands

Both are `async fn` so the 150 ms sleep does not block the Tauri event loop:

```rust
#[tauri::command]
pub async fn paste_entry_and_close(
    id: i64,
    store: StoreState<'_>,
    session_stats: SessionStatsState<'_>,
    prev_hwnd: State<'_, Arc<PreviousHwnd>>,
    app_handle: AppHandle,
) -> Result<(), String> {
    store.restore_to_clipboard(id).map_err(|e| e.to_string())?;
    session_stats.pastes.fetch_add(1, Ordering::Relaxed);
    let auto_paste = store.get_settings()
        .map(|s| s.auto_paste)
        .unwrap_or(false);
    let hwnd = prev_hwnd.load(Ordering::Relaxed);
    do_paste_and_close(&app_handle, hwnd, auto_paste).await;
    Ok(())
}

#[tauri::command]
pub async fn paste_text_and_close(
    text: String,
    prev_hwnd: State<'_, Arc<PreviousHwnd>>,
    store: StoreState<'_>,
    app_handle: AppHandle,
) -> Result<(), String> {
    let mut clipboard = arboard::Clipboard::new().map_err(|e| e.to_string())?;
    clipboard.set_text(text).map_err(|e| e.to_string())?;
    let auto_paste = store.get_settings()
        .map(|s| s.auto_paste)
        .unwrap_or(false);
    let hwnd = prev_hwnd.load(Ordering::Relaxed);
    do_paste_and_close(&app_handle, hwnd, auto_paste).await;
    Ok(())
}
```

Both commands are registered in `lib.rs` → `invoke_handler`.

---

## Angular Frontend

### `TauriBridgeService`
Two new methods replacing the old scattered `setClipboard`/`setClipboardText` + `hidePopup` combinations:

```ts
pasteEntryAndClose(id: number): Promise<void> {
  return invoke('paste_entry_and_close', { id });
}

pasteTextAndClose(text: string): Promise<void> {
  return invoke('paste_text_and_close', { text });
}
```

Existing `setClipboard`, `setClipboardText`, and `hidePopup` methods remain for callers that still need them (Escape-to-close, etc.).

### Updated call sites

| File | Old call | New call |
|------|----------|----------|
| `clipboard.service.ts` → `setClipboard()` | `bridge.setClipboard(id)` + `bridge.hidePopup()` | `bridge.pasteEntryAndClose(id)` |
| `clipboard-tab.component.ts` → `onEditConfirm()` | `bridge.setClipboardText(text)` + `bridge.hidePopup()` | `bridge.pasteTextAndClose(text)` |
| `clipboard-tab.component.ts` → `onTransformApplied()` | `bridge.setClipboardText(text)` + `bridge.hidePopup()` | `bridge.pasteTextAndClose(text)` |
| `clipboard-tab.component.ts` → `onMergeApplied()` | `bridge.setClipboardText(merged)` + `bridge.hidePopup()` | `bridge.pasteTextAndClose(merged)` |
| `image-preview.component.ts` → `copyToClipboard()` | `bridge.setClipboard(id)` + `bridge.hidePopup()` | `bridge.pasteEntryAndClose(id)` |
| `snippets-tab.component.ts` → snippet paste | `bridge.setClipboardText(text)` + `bridge.hidePopup()` | `bridge.pasteTextAndClose(text)` |

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

- **HWND is 0**: popup opened via tray icon with no prior app focused. `do_paste_and_close` skips the paste silently.
- **Escape to close**: calls `bridge.hidePopup()` directly — never calls `pasteEntryAndClose` or `pasteTextAndClose`, so auto-paste is not triggered.
- **Image paste**: uses `pasteEntryAndClose(id)` — works in any application that accepts image paste (browsers, chat apps, image editors); silently ignored elsewhere.
- **Cross-platform**: `SetForegroundWindow` and `SendInput` are behind `#[cfg(target_os = "windows")]`. The `do_paste_and_close` function compiles on all platforms; the paste step is simply omitted on non-Windows.
- **Invalid/stale HWND**: `SetForegroundWindow` returns a bool; failure is non-fatal and logged as a warning. The clipboard content is already set before the paste attempt.
