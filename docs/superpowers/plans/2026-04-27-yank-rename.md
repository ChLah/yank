# YANK Naming & Branding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename the product from "clipboard-manager" to "YANK" across all project files, then rename the root folder last.

**Architecture:** Pure rename — no logic changes. Update metadata fields in config files, update Rust source references to the renamed lib crate, rewrite the README header, verify the build, then rename the root folder as the final step.

**Tech Stack:** Angular 21 (`@angular/build`), Tauri 2, Rust 2021, pnpm 10

---

### Task 1: Update package.json

**Files:**
- Modify: `package.json` (lines 2, add description after line 2)

- [ ] **Step 1: Edit name and add description**

In `package.json`, change line 2 and add a description field directly after it:
```json
{
  "name": "yank",
  "description": "YANK — Yet Another Nifty Keeper. Your clipboard history, kept.",
  "version": "0.0.0",
```

- [ ] **Step 2: Verify no old name remains**

Run: `grep -n "clipboard-manager" package.json`
Expected: no output

- [ ] **Step 3: Commit**

```bash
git add package.json
git commit -m "chore: rename npm package to yank"
```

---

### Task 2: Update angular.json

**Files:**
- Modify: `angular.json`

The Angular project name drives the build output path. Renaming `"clipboard-manager"` → `"yank"` here changes the output directory from `dist/clipboard-manager/browser` to `dist/yank/browser`. The `tauri.conf.json` `frontendDist` path is updated in Task 4 to match.

- [ ] **Step 1: Rename the project key**

In `angular.json`, change the project object key from `"clipboard-manager"` to `"yank"`. It appears at approximately line 9:
```json
{
  "$schema": "./node_modules/@angular/cli/lib/config/schema.json",
  "version": 1,
  "projects": {
    "yank": {
```

- [ ] **Step 2: Update buildTarget references**

Still in `angular.json`, find all `buildTarget` strings containing `"clipboard-manager:build:"` and rename them:
- `"clipboard-manager:build:production"` → `"yank:build:production"`
- `"clipboard-manager:build:development"` → `"yank:build:development"`

These appear around lines 57 and 60.

- [ ] **Step 3: Verify no old name remains**

Run: `grep -n "clipboard-manager" angular.json`
Expected: no output

- [ ] **Step 4: Commit**

```bash
git add angular.json
git commit -m "chore: rename Angular project to yank"
```

---

### Task 3: Update Rust source files

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/src/main.rs` (line 5)
- Modify: `src-tauri/src/lib.rs` (line 33)

The Cargo `[lib] name` is the Rust identifier used in `main.rs` to call the library entry point, and in `lib.rs` as a log filter prefix.

- [ ] **Step 1: Update Cargo.toml package name, description, and lib name**

In `src-tauri/Cargo.toml`, change the `[package]` and `[lib]` sections:
```toml
[package]
name = "yank"
version = "0.1.0"
description = "YANK — Yet Another Nifty Keeper. Your clipboard history, kept."
authors = []
license = ""
repository = ""
edition = "2021"
rust-version = "1.77.2"

[lib]
name = "yank_lib"
crate-type = ["staticlib", "cdylib", "rlib"]
```

- [ ] **Step 2: Update main.rs lib call**

In `src-tauri/src/main.rs`, line 5, change:
```rust
clipboard_manager_lib::run();
```
to:
```rust
yank_lib::run();
```

- [ ] **Step 3: Update lib.rs log filter string**

In `src-tauri/src/lib.rs`, line 33, change:
```rust
.unwrap_or_else(|_| "clipboard_manager=debug".parse().unwrap()),
```
to:
```rust
.unwrap_or_else(|_| "yank=debug".parse().unwrap()),
```

- [ ] **Step 4: Verify no old references remain in Rust files**

Run: `grep -rn "clipboard.manager" src-tauri/`
Expected: no output

- [ ] **Step 5: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/src/main.rs src-tauri/src/lib.rs
git commit -m "chore: rename Rust crate to yank"
```

---

### Task 4: Update tauri.conf.json

**Files:**
- Modify: `src-tauri/tauri.conf.json`

- [ ] **Step 1: Update productName**

Change line 3: `"productName": "YANK"`

- [ ] **Step 2: Update identifier**

Change line 5: `"identifier": "com.yank.app"`

- [ ] **Step 3: Update frontendDist**

Change `build.frontendDist` to match the new Angular output path: `"../dist/yank/browser"`

- [ ] **Step 4: Update window title**

In `app.windows[0]`, change: `"title": "YANK"`

- [ ] **Step 5: Verify no old references remain**

Run: `grep -in "clipboard" src-tauri/tauri.conf.json`
Expected: no output

- [ ] **Step 6: Commit**

```bash
git add src-tauri/tauri.conf.json
git commit -m "chore: update Tauri config to YANK branding"
```

---

### Task 5: Rewrite README.md header

**Files:**
- Modify: `README.md` (lines 1–3 only)

- [ ] **Step 1: Replace title and intro paragraph**

Replace lines 1–3 of `README.md`:
```markdown
# YANK

**Yet Another Nifty Keeper** — Your clipboard history, kept.

A keyboard-driven clipboard history manager for Windows, built as a lightweight system tray application. It captures everything you copy, lets you search and filter your history, pin important items, and paste with a single keypress — without leaving your current workflow.
```

Everything from line 5 onward (`---`, `## Features`, etc.) stays unchanged.

- [ ] **Step 2: Verify the header**

Run: `head -5 README.md`
Expected: first line is `# YANK`

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: update README header for YANK branding"
```

---

### Task 6: Verify the build

Before renaming the folder, confirm the project builds cleanly with all renamed references in place.

- [ ] **Step 1: Install/sync dependencies**

Run: `pnpm install`
Expected: exits cleanly (no errors)

- [ ] **Step 2: Verify Angular build succeeds**

Run: `pnpm ng build --configuration development`
Expected: build succeeds; output appears at `dist/yank/browser/`

Confirm: `ls dist/yank/browser/`
Expected: `index.html` and bundled JS/CSS files are present

- [ ] **Step 3: Verify Rust compiles**

Run (from repo root): `cd src-tauri && cargo check && cd ..`
Expected: `Finished` line with no `error[E...]` lines

---

### Task 7: Rename root folder

This step must be **last**. After this, any absolute paths referencing `D:\Projects\clipboard-manager` (IDE workspace files, shell history, Claude Code memory) will be stale and must be updated manually by reopening the project from the new path.

- [ ] **Step 1: Rename the folder**

Run this in a terminal (PowerShell):
```powershell
Rename-Item -Path "D:\Projects\clipboard-manager" -NewName "yank"
```

- [ ] **Step 2: Reopen the project at the new path**

Open a new terminal or IDE window pointing to:
```
D:\Projects\yank
```

- [ ] **Step 3: Verify git history is intact**

```bash
git -C D:/Projects/yank log --oneline -6
```
Expected: shows all commits from Tasks 1–5 plus all prior history

- [ ] **Step 4: Smoke test — run the dev server**

```bash
cd D:/Projects/yank && pnpm tauri dev
```
Expected: Tauri window opens titled `YANK`, system tray tooltip shows `YANK`
