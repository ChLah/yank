# YANK — Yet Another Nifty Keeper

**Your clipboard history, kept.**

A keyboard-driven clipboard history manager for Windows, built as a lightweight system tray application. It captures everything you copy, lets you search and filter your history, pin important items, merge multiple entries, and paste with a single keypress — without leaving your current workflow.

---

## Features

### Clipboard History
- Automatically records all text and image clipboard entries in real time
- SHA-256 deduplication prevents storing the same content twice
- Configurable history limit (5–999 entries) with optional age-based auto-cleanup

### Search & Filtering
- Live search across all clipboard entries as you type
- Filter by content type: All, Text, Image
- Two tabs: **Recent** (chronological) and **Pinned** (your saved favourites)

### Keyboard-Driven Workflow

| Key | Action |
|-----|--------|
| `↑` / `↓` | Navigate entries |
| `Enter` | Paste selected entry |
| `E` | Edit entry inline before pasting |
| `Shift+Enter` | Open transform picker |
| `Space` | Mark / unmark entry for merge |
| `P` | Pin / unpin entry |
| `Delete` | Delete entry |
| Any character | Start searching (types directly into search) |
| `Esc` | Close window / clear search |

### Merge Entries
- Mark two or more entries with `Space`, then press `Enter` to open the merge picker
- Choose a separator: newline, space, or none
- The merged result is pasted and saved back to history

### Text Transformations
- Apply presets from a transform picker overlay (`Shift+Enter`)
- **Case:** Uppercase, Lowercase, Title Case
- **Encoding:** URL encode/decode, Base64 encode/decode
- **Hashing:** MD5, SHA-1, SHA-256
- **Text cleanup:** Strip whitespace, Strip HTML, Remove duplicate lines, Sort lines A→Z, Slugify
- **Formatting:** JSON pretty-print
- Transformed result is pasted and saved back to history

### Clipboard Statistics
- Total entries captured, entries pinned, images stored
- Install date and database size
- Danger-zone reset to wipe history and start fresh

### Settings
- **Global shortcut**: Customise the hotkey that opens the window (default: `Ctrl+;`)
- **History limits**: Max entries, auto-delete on overflow, auto-delete entries older than N days
- **Appearance**: Dark, Light, or System theme; English or German interface language
- **Window behaviour**: Remember last position or always open at cursor; launch at login
- **Updates**: Check for updates manually or enable automatic background checks
- Sidebar navigation — jump directly to any settings section

### Image Support
- Captures image clipboard entries with auto-generated thumbnails (200×200 px)
- Full-size image preview in a dedicated window

### System Tray
- Runs silently in the background with a tray icon
- Tray menu: Open, Settings, Quit
- Click the tray icon to toggle the popup window

### Auto-Updates
- Checks for new releases automatically in the background
- Downloads and installs signed updates; prompts to restart
- Manual check available under Settings → Updates

---

## Install

Download the latest installer from the [Releases page](https://github.com/ChLah/yank/releases/latest) and run `yank_*-setup.exe`.

YANK checks for updates automatically in the background and installs them on next launch.

---

## Development

**Prerequisites:** Node.js 20+, pnpm 10+, Rust stable (via [rustup](https://rustup.rs/))

```bash
pnpm install
pnpm hooks:install   # one-time: installs the pre-push version guard
pnpm start           # Angular dev server only (no Tauri APIs)
pnpm tauri dev       # full Tauri + Angular dev mode with hot reload
pnpm test            # unit tests (Vitest)
pnpm tauri build     # production build → src-tauri/target/release/bundle/
```

---

## Cutting a Release

1. **Update the version** in `src-tauri/tauri.conf.json` (`"version"` field).
2. **Commit** the version bump:
   ```bash
   git add src-tauri/tauri.conf.json
   git commit -m "chore: bump version to X.Y.Z"
   ```
3. **Tag** with an annotated tag — the tag message becomes the GitHub Release notes:
   ```bash
   git tag -a vX.Y.Z -m "Summary of changes in this release."
   ```
4. **Push** the commit and the tag:
   ```bash
   git push && git push --tags
   ```

The pre-push hook will abort if the tag version doesn't match `tauri.conf.json`. GitHub Actions picks up the tag, builds the signed installer, and publishes the GitHub Release automatically (~10 minutes).
