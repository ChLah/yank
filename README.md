# YANK

**Yet Another Nifty Keeper** — Your clipboard history, kept.

A keyboard-driven clipboard history manager for Windows, built as a lightweight system tray application. It captures everything you copy, lets you search and filter your history, pin important items, and paste with a single keypress — without leaving your current workflow.

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
| `P` | Pin / unpin entry |
| `Delete` | Delete entry |
| Any character | Start searching (types directly into search) |
| `Esc` | Close window / clear search |

### Text Transformations
- Apply presets from a transform picker overlay (`Shift+Enter`)
- Transforms include operations like UPPERCASE, lowercase, trim, and more
- Save transformed content back to clipboard history

### Settings
- **Global shortcut**: Customise the hotkey that opens the window (default: `Ctrl+;`)
- **History limits**: Max entries, auto-delete on overflow, auto-delete entries older than N days
- **Appearance**: Dark, Light, or System theme; English or German interface language
- **Window behaviour**: Remember last position or always open at cursor; launch at login

### Image Support
- Captures image clipboard entries with auto-generated thumbnails (200×200 px)
- Full-size image preview in a dedicated window

### System Tray
- Runs silently in the background with a tray icon
- Tray menu: Open, Settings, Quit
- Click the tray icon to toggle the popup window

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop shell | [Tauri 2](https://tauri.app/) |
| Backend | Rust (edition 2021, minimum 1.77.2) |
| Database | SQLite via `rusqlite` (bundled) |
| Clipboard access | `arboard` 3 |
| Image processing | `image` crate 0.25 |
| Global shortcut | `tauri-plugin-global-shortcut` |
| Autostart | `tauri-plugin-autostart` |
| Frontend framework | [Angular 21](https://angular.dev/) (standalone components, signals) |
| Language | TypeScript 5.9 |
| Styling | [Tailwind CSS 4](https://tailwindcss.com/) |
| UI components | [Spartan-ng](https://www.spartan.ng/) (headless + Tailwind helm) |
| Icons | Lucide via `@ng-icons/lucide` |
| i18n | `@ngx-translate/core` |
| Fonts | DM Sans, JetBrains Mono via `@fontsource-variable` |
| Testing | [Vitest 4](https://vitest.dev/) + jsdom |
| Package manager | pnpm 10 |

---

## Prerequisites

- **Node.js** 20+ and **pnpm** 10+
- **Rust** toolchain (stable, 1.77.2+) — install via [rustup](https://rustup.rs/)
- **Tauri CLI** v2 — install with `cargo install tauri-cli --version "^2"`
- **Windows** — clipboard monitoring uses Windows-specific APIs (`winapi`/`windows` crate)

---

## Getting Started

### Install dependencies

```bash
pnpm install
```

### Run in development mode

```bash
pnpm tauri dev
```

This starts the Angular dev server (`localhost:4200`) and launches the Tauri window with hot reload. Changes to Angular files rebuild automatically; changes to Rust files recompile the backend.

### Run the Angular dev server only (UI work)

```bash
pnpm start
```

Navigate to `http://localhost:4200/` in your browser. Note: Tauri APIs are not available in this mode.

---

## Building for Production

```bash
pnpm tauri build
```

This compiles the Angular frontend (`pnpm ng build`) and bundles it with the Rust backend into a Windows installer. Output artefacts are placed in `src-tauri/target/release/bundle/`.

To build only the Angular frontend:

```bash
pnpm build
```

Output is placed in `dist/yank/browser/`.

---

## Testing

Run the Vitest unit test suite:

```bash
pnpm test
```

Tests live alongside source files (`*.spec.ts`). Vitest is configured in `vitest.config.ts` with jsdom as the browser environment.

---

## Project Structure

```
yank/
├── src/                          # Angular frontend
│   ├── app/
│   │   ├── core/
│   │   │   ├── models/           # Shared TypeScript interfaces (entry, settings)
│   │   │   └── services/         # Business logic (clipboard, settings, theme, i18n, transforms)
│   │   ├── features/
│   │   │   ├── clipboard-list/   # Main list UI, entry component, transform picker
│   │   │   ├── settings/         # Settings page and field components
│   │   │   └── image-preview/    # Full-size image preview window
│   │   ├── shared/ui/            # Reusable UI components (empty state, keyboard hint, spinner)
│   │   └── i18n/                 # Translation strings (en.ts, de.ts)
│   └── libs/ui/                  # Project-local Spartan-ng component library
├── src-tauri/                    # Rust / Tauri backend
│   ├── src/
│   │   ├── lib.rs                # App setup, tray, plugins, event wiring
│   │   ├── commands.rs           # IPC command handlers (called from Angular)
│   │   ├── models.rs             # Rust data models
│   │   ├── shortcuts.rs          # Global shortcut management
│   │   ├── windows.rs            # Window lifecycle (popup, settings, preview)
│   │   ├── platform/windows/     # Windows clipboard monitor (WinAPI)
│   │   └── store/                # SQLite persistence layer
│   ├── capabilities/             # Tauri security capability definitions
│   ├── icons/                    # Application icons
│   └── tauri.conf.json           # Tauri configuration (window, plugins, bundle)
├── docs/superpowers/             # Design specs and implementation plans
├── angular.json                  # Angular workspace configuration
├── vitest.config.ts              # Test runner configuration
└── package.json                  # Scripts and frontend dependencies
```

---

## Architecture Notes

- **TauriBridgeService** is the single seam between Angular and Rust — all `invoke` and `listen` calls go through it, keeping components decoupled from the IPC layer.
- **Angular signals** are used throughout for reactive state; no RxJS Observables in the application code.
- **Deduplication** happens at the SQLite layer via SHA-256 hashes — inserting a duplicate updates the `last_used_at` timestamp instead of creating a new row.
- **Window behaviour**: the popup is a non-resizable overlay (480×680) that floats on top and hides on focus loss with a short debounce to tolerate drag operations.
