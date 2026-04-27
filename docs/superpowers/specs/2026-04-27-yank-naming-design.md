# YANK — Naming & Branding Design

## Summary

Rename the product from "clipboard-manager" to **YANK** (Yet Another Nifty Keeper).

## Identity

| Field | Value |
|---|---|
| Name | YANK |
| Full form | Yet Another Nifty Keeper |
| Tagline | "Your clipboard history, kept." |
| Casing (headings/titles) | `YANK` (uppercase) |
| Casing (code/packages) | `yank` (lowercase) |

## Rationale

The name follows the "Yet Another..." hacker tradition (YAML, YAGNI) beloved by the developer audience this tool targets. The acronym spells `yank` — a Vim keybinding for copy — which is immediately recognizable to power users. "Keeper" describes the product's core value proposition precisely.

The tagline "Your clipboard history, kept." is concise, action-oriented, and works for both the developer and knowledge-worker segments.

## Target Audience

Primary: developers and power users (keyboard-driven workflows, Vim/CLI familiarity)
Secondary: knowledge workers (writers, analysts, PMs)

## Complete Change List

| File | Field / Location | Old value | New value |
|---|---|---|---|
| `package.json` | `name` | `clipboard-manager` | `yank` |
| `package.json` | `description` (add) | *(absent)* | `YANK — Yet Another Nifty Keeper. Your clipboard history, kept.` |
| `src-tauri/Cargo.toml` | `[package] name` | `clipboard-manager` | `yank` |
| `src-tauri/Cargo.toml` | `[package] description` | `A clipboard history manager` | `YANK — Yet Another Nifty Keeper. Your clipboard history, kept.` |
| `src-tauri/Cargo.toml` | `[lib] name` | `clipboard_manager_lib` | `yank_lib` |
| `src-tauri/tauri.conf.json` | `productName` | `Clipboard Manager` | `YANK` |
| `src-tauri/tauri.conf.json` | `identifier` | `com.clipboardmanager.app` | `com.yank.app` |
| `src-tauri/tauri.conf.json` | `app.windows[0].title` | `Clipboard Manager` | `YANK` |
| `src-tauri/tauri.conf.json` | `build.frontendDist` | `../dist/clipboard-manager/browser` | `../dist/yank/browser` |
| `angular.json` | project key | `clipboard-manager` | `yank` |
| `angular.json` | `buildTarget` references | `clipboard-manager:build:*` | `yank:build:*` |
| `src-tauri/src/main.rs` | lib import | `clipboard_manager_lib::run()` | `yank_lib::run()` |
| `src-tauri/src/lib.rs` | log filter string | `"clipboard_manager=debug"` | `"yank=debug"` |
| `README.md` | Header & intro | *(current)* | Rewrite with YANK name, full form, tagline |

## Folder Rename

The project root folder `D:\Projects\clipboard-manager` should be renamed to `D:\Projects\yank`.

Notes:
- Git history is preserved — the `.git` directory moves with the folder
- The memory path and any IDE workspace files referencing the old path will need to be updated manually or via the IDE after the rename
- The rename should happen **last**, after all in-tree file edits are applied, so the working directory stays valid throughout

## Out of Scope

- Icon/logo visual design (requires a designer)
- Feature names, keyboard shortcuts, UI copy, settings labels — these are product features, not branding
- Domain name / distribution channel decisions
