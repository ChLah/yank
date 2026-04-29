use std::sync::Mutex;
use tauri::AppHandle;
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut};

pub fn register_shortcuts(
    app: &AppHandle,
    popup_str: &str,
    pause_str: &str,
    pause_shortcut_store: &Mutex<String>,
) -> Result<(), Box<dyn std::error::Error>> {
    tracing::info!("Registering shortcuts: popup='{}' pause='{}'", popup_str, pause_str);

    let popup_sc = build_shortcut(popup_str).map_err(|e| {
        tracing::error!("Failed to parse popup shortcut '{}': {}", popup_str, e);
        e
    })?;

    let _ = app.global_shortcut().unregister_all();
    app.global_shortcut().register(popup_sc)?;

    if !pause_str.is_empty() {
        match build_shortcut(pause_str) {
            Ok(pause_sc) => {
                if let Err(e) = app.global_shortcut().register(pause_sc) {
                    tracing::warn!("Failed to register pause shortcut '{}': {}", pause_str, e);
                }
            }
            Err(e) => tracing::warn!("Invalid pause shortcut '{}': {}", pause_str, e),
        }
    }

    *pause_shortcut_store.lock().unwrap() = pause_str.to_string();
    tracing::info!("Shortcuts registered successfully");
    Ok(())
}

/// Build a `Shortcut` from a string like "Ctrl+Semicolon" or "Ctrl+Alt+V".
/// Key names use browser `event.code` format (CamelCase, e.g. "Semicolon", "KeyA").
///
/// On Windows, OEM key virtual-key codes are keyboard-layout-dependent.
/// `global-hotkey` uses a US-layout-centric static mapping (e.g. Code::Semicolon →
/// VK_OEM_1), but many German keyboards place Ö at VK_OEM_3. We correct this by
/// converting the code name to its physical scan code and then calling
/// MapVirtualKeyExW with the current HKL to get the true VK for this layout.
pub fn build_shortcut(s: &str) -> Result<Shortcut, Box<dyn std::error::Error>> {
    let mut mods = Modifiers::empty();
    let mut key_part = "";

    for part in s.split('+') {
        match part {
            "Ctrl" | "Control" | "ctrl" | "control" => mods |= Modifiers::CONTROL,
            "Alt" | "alt" => mods |= Modifiers::ALT,
            "Shift" | "shift" => mods |= Modifiers::SHIFT,
            "Super" | "Meta" | "Cmd" | "Command" | "super" | "meta" | "cmd" => {
                mods |= Modifiers::SUPER
            }
            k => key_part = k,
        }
    }

    let mods_opt = if mods.is_empty() { None } else { Some(mods) };

    // On Windows: use the physical scan code + current HKL to find the layout-correct Code.
    #[cfg(target_os = "windows")]
    if let Some(code) = layout_code_for_key(key_part) {
        tracing::debug!("Layout-corrected code for '{}': {:?}", key_part, code);
        return Ok(Shortcut::new(mods_opt, code));
    }

    let code = map_code(key_part)?;
    Ok(Shortcut::new(mods_opt, code))
}

/// On Windows: look up the physical scan code for `key_name`, call
/// `MapVirtualKeyExW` to get the layout-specific VK, then reverse-map to a `Code`.
/// Returns `None` if the key has no scan-code entry or the VK is not in our table.
#[cfg(target_os = "windows")]
fn layout_code_for_key(key_name: &str) -> Option<Code> {
    let scan = key_name_to_scan(key_name)?;

    use windows::Win32::UI::Input::KeyboardAndMouse::{
        GetKeyboardLayout, MapVirtualKeyExW, MAPVK_VSC_TO_VK_EX,
    };
    let vk = unsafe {
        let hkl = GetKeyboardLayout(0);
        MapVirtualKeyExW(scan, MAPVK_VSC_TO_VK_EX, hkl)
    };

    vk_to_code(vk as u16)
}

/// Map a browser `event.code` key name to its PC/AT scan code (Set 1).
/// Only covers keys where the VK→physical-key mapping is layout-dependent.
#[cfg(target_os = "windows")]
fn key_name_to_scan(name: &str) -> Option<u32> {
    Some(match name {
        // OEM / punctuation keys — layout-dependent VK assignments
        "Backquote"    => 0x29,
        "Minus"        => 0x0C,
        "Equal"        => 0x0D,
        "BracketLeft"  => 0x1A,
        "BracketRight" => 0x1B,
        "Semicolon"    => 0x27,
        "Quote"        => 0x28,
        "Backslash"    => 0x2B,
        "Comma"        => 0x33,
        "Period"       => 0x34,
        "Slash"        => 0x35,
        // Letter keys — Y/Z are swapped on QWERTZ keyboards
        "A" => 0x1E, "B" => 0x30, "C" => 0x2E, "D" => 0x20,
        "E" => 0x12, "F" => 0x21, "G" => 0x22, "H" => 0x23,
        "I" => 0x17, "J" => 0x24, "K" => 0x25, "L" => 0x26,
        "M" => 0x32, "N" => 0x31, "O" => 0x18, "P" => 0x19,
        "Q" => 0x10, "R" => 0x13, "S" => 0x1F, "T" => 0x14,
        "U" => 0x16, "V" => 0x2F, "W" => 0x11, "X" => 0x2D,
        "Y" => 0x15, "Z" => 0x2C,
        // Digits — layout-independent but included for completeness
        "0" => 0x0B, "1" => 0x02, "2" => 0x03, "3" => 0x04,
        "4" => 0x05, "5" => 0x06, "6" => 0x07, "7" => 0x08,
        "8" => 0x09, "9" => 0x0A,
        _ => return None,
    })
}

/// Reverse map: Windows virtual-key code → `keyboard-types` `Code`.
/// Covers the subset of VK codes that `global-hotkey` knows about.
#[cfg(target_os = "windows")]
fn vk_to_code(vk: u16) -> Option<Code> {
    Some(match vk {
        // Letters VK_A..VK_Z
        0x41 => Code::KeyA, 0x42 => Code::KeyB, 0x43 => Code::KeyC, 0x44 => Code::KeyD,
        0x45 => Code::KeyE, 0x46 => Code::KeyF, 0x47 => Code::KeyG, 0x48 => Code::KeyH,
        0x49 => Code::KeyI, 0x4A => Code::KeyJ, 0x4B => Code::KeyK, 0x4C => Code::KeyL,
        0x4D => Code::KeyM, 0x4E => Code::KeyN, 0x4F => Code::KeyO, 0x50 => Code::KeyP,
        0x51 => Code::KeyQ, 0x52 => Code::KeyR, 0x53 => Code::KeyS, 0x54 => Code::KeyT,
        0x55 => Code::KeyU, 0x56 => Code::KeyV, 0x57 => Code::KeyW, 0x58 => Code::KeyX,
        0x59 => Code::KeyY, 0x5A => Code::KeyZ,
        // Digits VK_0..VK_9
        0x30 => Code::Digit0, 0x31 => Code::Digit1, 0x32 => Code::Digit2, 0x33 => Code::Digit3,
        0x34 => Code::Digit4, 0x35 => Code::Digit5, 0x36 => Code::Digit6, 0x37 => Code::Digit7,
        0x38 => Code::Digit8, 0x39 => Code::Digit9,
        // OEM keys
        0xBA => Code::Semicolon,    // VK_OEM_1
        0xBB => Code::Equal,        // VK_OEM_PLUS
        0xBC => Code::Comma,        // VK_OEM_COMMA
        0xBD => Code::Minus,        // VK_OEM_MINUS
        0xBE => Code::Period,       // VK_OEM_PERIOD
        0xBF => Code::Slash,        // VK_OEM_2
        0xC0 => Code::Backquote,    // VK_OEM_3
        0xDB => Code::BracketLeft,  // VK_OEM_4
        0xDC => Code::Backslash,    // VK_OEM_5
        0xDD => Code::BracketRight, // VK_OEM_6
        0xDE => Code::Quote,        // VK_OEM_7
        _ => return None,
    })
}

/// Map a browser `event.code` value (CamelCase) to a `keyboard-types` `Code`.
fn map_code(s: &str) -> Result<Code, Box<dyn std::error::Error>> {
    let code = match s {
        // Punctuation / symbols
        "Semicolon"    => Code::Semicolon,
        "Comma"        => Code::Comma,
        "Period"       => Code::Period,
        "Slash"        => Code::Slash,
        "Backslash"    => Code::Backslash,
        "BracketLeft"  => Code::BracketLeft,
        "BracketRight" => Code::BracketRight,
        "Quote"        => Code::Quote,
        "Backquote"    => Code::Backquote,
        "Minus"        => Code::Minus,
        "Equal"        => Code::Equal,
        // Control keys
        "Space"        => Code::Space,
        "Enter"        => Code::Enter,
        "Escape"       => Code::Escape,
        "Backspace"    => Code::Backspace,
        "Tab"          => Code::Tab,
        "CapsLock"     => Code::CapsLock,
        "Insert"       => Code::Insert,
        "Delete"       => Code::Delete,
        "Home"         => Code::Home,
        "End"          => Code::End,
        "PageUp"       => Code::PageUp,
        "PageDown"     => Code::PageDown,
        // Arrows
        "ArrowLeft"    => Code::ArrowLeft,
        "ArrowRight"   => Code::ArrowRight,
        "ArrowUp"      => Code::ArrowUp,
        "ArrowDown"    => Code::ArrowDown,
        // Function keys
        "F1"  => Code::F1,  "F2"  => Code::F2,  "F3"  => Code::F3,  "F4"  => Code::F4,
        "F5"  => Code::F5,  "F6"  => Code::F6,  "F7"  => Code::F7,  "F8"  => Code::F8,
        "F9"  => Code::F9,  "F10" => Code::F10, "F11" => Code::F11, "F12" => Code::F12,
        // Digits (bare "0".."9" from settings recorder after stripping "Digit" prefix)
        "Digit0" | "0" => Code::Digit0, "Digit1" | "1" => Code::Digit1,
        "Digit2" | "2" => Code::Digit2, "Digit3" | "3" => Code::Digit3,
        "Digit4" | "4" => Code::Digit4, "Digit5" | "5" => Code::Digit5,
        "Digit6" | "6" => Code::Digit6, "Digit7" | "7" => Code::Digit7,
        "Digit8" | "8" => Code::Digit8, "Digit9" | "9" => Code::Digit9,
        // Letter keys — single uppercase letter (after "Key" prefix is stripped by Angular)
        "A" => Code::KeyA, "B" => Code::KeyB, "C" => Code::KeyC, "D" => Code::KeyD,
        "E" => Code::KeyE, "F" => Code::KeyF, "G" => Code::KeyG, "H" => Code::KeyH,
        "I" => Code::KeyI, "J" => Code::KeyJ, "K" => Code::KeyK, "L" => Code::KeyL,
        "M" => Code::KeyM, "N" => Code::KeyN, "O" => Code::KeyO, "P" => Code::KeyP,
        "Q" => Code::KeyQ, "R" => Code::KeyR, "S" => Code::KeyS, "T" => Code::KeyT,
        "U" => Code::KeyU, "V" => Code::KeyV, "W" => Code::KeyW, "X" => Code::KeyX,
        "Y" => Code::KeyY, "Z" => Code::KeyZ,
        other => return Err(format!("Unrecognized key code: '{other}'").into()),
    };
    Ok(code)
}
