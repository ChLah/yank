use tauri::AppHandle;
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut};

pub fn register_shortcut(
    app: &AppHandle,
    shortcut_str: &str,
) -> Result<(), Box<dyn std::error::Error>> {
    tracing::info!("Registering global shortcut: '{}'", shortcut_str);

    let shortcut = build_shortcut(shortcut_str).map_err(|e| {
        tracing::error!("Failed to parse shortcut '{}': {}", shortcut_str, e);
        e
    })?;

    // Ignore errors if nothing was registered yet
    let _ = app.global_shortcut().unregister_all();

    // Only register the key binding; the handler lives in Builder::with_handler in lib.rs
    app.global_shortcut().register(shortcut)?;

    tracing::info!("Global shortcut registered successfully");
    Ok(())
}

/// Build a `Shortcut` from a string like "Ctrl+Semicolon" or "Ctrl+Alt+V".
/// Key names use browser `event.code` format (CamelCase, e.g. "Semicolon", "KeyA").
pub fn build_shortcut(s: &str) -> Result<Shortcut, Box<dyn std::error::Error>> {
    let mut mods = Modifiers::empty();
    let mut code: Option<Code> = None;

    for part in s.split('+') {
        match part {
            "Ctrl" | "Control" | "ctrl" | "control" => mods |= Modifiers::CONTROL,
            "Alt" | "alt" => mods |= Modifiers::ALT,
            "Shift" | "shift" => mods |= Modifiers::SHIFT,
            "Super" | "Meta" | "Cmd" | "Command" | "super" | "meta" | "cmd" => {
                mods |= Modifiers::SUPER
            }
            key => {
                code = Some(map_code(key)?);
            }
        }
    }

    let code = code.ok_or("Shortcut must contain a key code (e.g. 'Ctrl+Semicolon')")?;
    Ok(Shortcut::new(if mods.is_empty() { None } else { Some(mods) }, code))
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
