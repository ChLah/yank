# GitHub Releases Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the local update-server dev harness with a real GitHub Releases-based auto-update pipeline, including CI, a pre-push version-guard hook, and user/maintainer documentation.

**Architecture:** A GitHub Actions workflow triggers on `v*` tag pushes, builds the signed NSIS installer on `windows-latest`, generates a `latest.json` manifest, and publishes all three artifacts as a GitHub Release. The Tauri updater in production points to the GitHub CDN URL for `latest.json`. A committed pre-push shell script (installed via `pnpm hooks:install`) prevents tagging a version that doesn't match `tauri.conf.json`.

**Tech Stack:** GitHub Actions, Tauri CLI 2.x, NSIS, Tauri updater plugin, bash (pre-push hook), Node.js/jq for version extraction in CI.

---

## File Map

| Action | Path | Purpose |
|--------|------|---------|
| Delete | `scripts/update-server.ts` | Local dev harness — replaced by real CI |
| Modify | `package.json` | Remove `update:local` script, add `hooks:install` |
| Modify | `src-tauri/tauri.conf.json` | Point updater at GitHub CDN, remove insecure flag |
| Create | `.github/workflows/release.yml` | CI workflow — build + sign + publish release |
| Create | `scripts/pre-push` | Shell hook — enforce tag/version match |
| Create | `README.md` | User install section + maintainer release ritual |

---

### Task 1: Remove the local update-server harness

**Files:**
- Delete: `scripts/update-server.ts`
- Modify: `package.json`

- [ ] **Step 1: Delete the script**

```bash
rm scripts/update-server.ts
```

- [ ] **Step 2: Remove `update:local` from package.json scripts**

In `package.json`, remove this line from `"scripts"`:
```json
"update:local": "tsx scripts/update-server.ts"
```

- [ ] **Step 3: Verify no remaining references**

```bash
grep -r "update:local\|update-server" --include="*.json" --include="*.ts" --include="*.md" .
```

Expected: no matches (or only matches inside `node_modules` which can be ignored).

- [ ] **Step 4: Commit**

```bash
git add scripts/update-server.ts package.json
git commit -m "chore: remove local update-server dev harness"
```

---

### Task 2: Update tauri.conf.json updater endpoint

**Files:**
- Modify: `src-tauri/tauri.conf.json`

The current config has:
```json
"updater": {
  "endpoints": ["http://localhost:8787/latest.json"],
  "pubkey": "<existing-pubkey>",
  "dangerousInsecureTransportProtocol": true
}
```

- [ ] **Step 1: Replace the updater plugin config**

Update `src-tauri/tauri.conf.json` — change the `plugins.updater` block to:
```json
"updater": {
  "endpoints": ["https://github.com/ChLah/yank/releases/latest/download/latest.json"],
  "pubkey": "dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IDIwMUM3MkRDQkREQTg0QUQKUldTdGhOcTkzSEljSU9nbWxKTEJHOWZzZitDeS9XQmxOMFVkUlg3bFd0WVRoR0JSUllLY29yU3IK"
}
```

Note: `dangerousInsecureTransportProtocol` is removed — HTTPS doesn't need it.

- [ ] **Step 2: Verify JSON is valid**

```bash
node -e "JSON.parse(require('fs').readFileSync('src-tauri/tauri.conf.json','utf8')); console.log('valid')"
```

Expected output: `valid`

- [ ] **Step 3: Commit**

```bash
git add src-tauri/tauri.conf.json
git commit -m "feat(updater): point to GitHub Releases CDN endpoint"
```

---

### Task 3: Create the GitHub Actions release workflow

**Files:**
- Create: `.github/workflows/release.yml`

This workflow:
1. Triggers on `v*` tag push
2. Checks out the repo with full history (needed to read tag annotation)
3. Installs Node + pnpm + Rust toolchain
4. Extracts the version from the tag name (`v1.2.3` → `1.2.3`)
5. Extracts the release notes from the tag annotation message
6. Runs `tauri build` with version + signing config injected
7. Generates `latest.json` from the produced `.sig` file
8. Creates a GitHub Release with the tag annotation as body
9. Uploads: NSIS installer, `.sig`, `latest.json`

- [ ] **Step 1: Create `.github/workflows/` directory and write the workflow**

Create `.github/workflows/release.yml` with this content:

```yaml
name: Release

on:
  push:
    tags:
      - 'v*'

jobs:
  release:
    runs-on: windows-latest
    permissions:
      contents: write

    steps:
      - name: Checkout
        uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Setup pnpm
        uses: pnpm/action-setup@v4
        with:
          version: 10

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm

      - name: Setup Rust
        uses: dtolnay/rust-toolchain@stable

      - name: Cache Rust build
        uses: Swatinem/rust-cache@v2
        with:
          workspaces: src-tauri

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Extract version from tag
        id: version
        shell: bash
        run: |
          TAG="${GITHUB_REF_NAME}"
          VERSION="${TAG#v}"
          echo "tag=$TAG" >> "$GITHUB_OUTPUT"
          echo "version=$VERSION" >> "$GITHUB_OUTPUT"

      - name: Extract release notes from tag annotation
        id: notes
        shell: bash
        run: |
          NOTES=$(git tag -l --format='%(contents)' "${{ steps.version.outputs.tag }}")
          # Write to a file to avoid quoting issues with multiline strings
          echo "$NOTES" > release-notes.txt

      - name: Build Tauri app
        env:
          TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}
          TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY_PASSWORD }}
        run: |
          $config = '{"version":"${{ steps.version.outputs.version }}","bundle":{"createUpdaterArtifacts":true}}'
          node node_modules/@tauri-apps/cli/tauri.js build --config $config

      - name: Locate build artifacts
        id: artifacts
        shell: bash
        run: |
          BUNDLE_DIR="src-tauri/target/release/bundle/nsis"
          EXE=$(ls "$BUNDLE_DIR"/*-setup.exe | head -1)
          SIG="${EXE}.sig"
          echo "exe=$EXE" >> "$GITHUB_OUTPUT"
          echo "sig=$SIG" >> "$GITHUB_OUTPUT"
          echo "exename=$(basename "$EXE")" >> "$GITHUB_OUTPUT"

      - name: Generate latest.json manifest
        shell: bash
        run: |
          VERSION="${{ steps.version.outputs.version }}"
          EXENAME="${{ steps.artifacts.outputs.exename }}"
          SIGNATURE=$(cat "${{ steps.artifacts.outputs.sig }}")
          cat > latest.json <<EOF
          {
            "version": "$VERSION",
            "notes": "See release notes on GitHub.",
            "pub_date": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
            "platforms": {
              "windows-x86_64": {
                "signature": "$SIGNATURE",
                "url": "https://github.com/ChLah/yank/releases/download/${{ steps.version.outputs.tag }}/${EXENAME}"
              }
            }
          }
          EOF

      - name: Create GitHub Release
        uses: softprops/action-gh-release@v2
        with:
          body_path: release-notes.txt
          files: |
            ${{ steps.artifacts.outputs.exe }}
            ${{ steps.artifacts.outputs.sig }}
            latest.json
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/release.yml
git commit -m "ci: add GitHub Actions release workflow on v* tag push"
```

---

### Task 4: Create the pre-push version-guard hook

**Files:**
- Create: `scripts/pre-push`
- Modify: `package.json`

The hook reads from stdin the list of refs being pushed (format: `<local-ref> <local-sha1> <remote-ref> <remote-sha1>`). If any ref is a `v*` tag, it compares the tag version against `tauri.conf.json`'s `version` field and aborts if they don't match.

- [ ] **Step 1: Create `scripts/pre-push`**

Create `scripts/pre-push` with this content (must be LF line endings, no BOM):

```bash
#!/usr/bin/env bash
# Enforces: if pushing a v* tag, tauri.conf.json version must match.

TAURI_CONF="src-tauri/tauri.conf.json"

while read local_ref local_sha remote_ref remote_sha; do
  # Only care about tag refs
  if [[ "$local_ref" == refs/tags/v* ]]; then
    TAG="${local_ref#refs/tags/}"
    TAG_VERSION="${TAG#v}"

    # Extract version from tauri.conf.json using node (always available in this project)
    CONF_VERSION=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$TAURI_CONF','utf8')).version)")

    if [[ "$TAG_VERSION" != "$CONF_VERSION" ]]; then
      echo ""
      echo "ERROR: Tag version mismatch!"
      echo "  Tag:              $TAG ($TAG_VERSION)"
      echo "  tauri.conf.json:  $CONF_VERSION"
      echo ""
      echo "Update tauri.conf.json to version $TAG_VERSION before pushing this tag."
      echo ""
      exit 1
    fi
  fi
done

exit 0
```

- [ ] **Step 2: Add `hooks:install` script to package.json**

In `package.json`, add to the `"scripts"` block:
```json
"hooks:install": "node -e \"const{symlinkSync,existsSync,mkdirSync}=require('fs');mkdirSync('.git/hooks',{recursive:true});const t='.git/hooks/pre-push';if(existsSync(t))require('fs').unlinkSync(t);symlinkSync(require('path').resolve('scripts/pre-push'),t);\""
```

- [ ] **Step 3: Make the hook executable (Linux/macOS) and verify on Windows**

On Windows, git hooks don't need the executable bit — the shebang line is enough because Git for Windows ships with bash. No `chmod` needed.

Verify the script parses correctly:
```bash
bash -n scripts/pre-push && echo "syntax ok"
```

Expected: `syntax ok`

- [ ] **Step 4: Install the hook locally**

```bash
pnpm hooks:install
```

Expected: no error. Verify:
```bash
ls .git/hooks/pre-push
```

Expected: symlink exists.

- [ ] **Step 5: Smoke-test the hook**

Simulate a push with a mismatched tag (current `tauri.conf.json` version is `0.1.0`):
```bash
echo "refs/tags/v9.9.9 abc123 refs/tags/v9.9.9 0000000" | bash scripts/pre-push
```

Expected: exits with code 1 and prints the mismatch error.

Simulate a matching push:
```bash
echo "refs/tags/v0.1.0 abc123 refs/tags/v0.1.0 0000000" | bash scripts/pre-push
```

Expected: exits with code 0 (no output).

- [ ] **Step 6: Commit**

```bash
git add scripts/pre-push package.json
git commit -m "chore: add pre-push hook to enforce tag/tauri.conf.json version match"
```

---

### Task 5: Write the README

**Files:**
- Create: `README.md`

Two sections: user-facing (install) and maintainer-facing (release ritual).

- [ ] **Step 1: Create `README.md`**

Create `README.md` at the repo root:

```markdown
# YANK — Yet Another Nifty Keeper

Your clipboard history, kept. A lightweight Windows tray app that captures everything you copy and lets you paste it back instantly.

## Install

Download the latest installer from the [Releases page](https://github.com/ChLah/yank/releases/latest) and run `yank_*-setup.exe`.

YANK checks for updates automatically in the background and installs them on next launch.

## Development

```bash
pnpm install
pnpm hooks:install   # one-time: installs the pre-push version guard
pnpm start           # dev server (Tauri + Angular)
pnpm test            # unit tests
```

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
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add README with install and release instructions"
```

---

## Self-Review

**Spec coverage check:**

| Requirement | Task |
|-------------|------|
| Remove local update-server | Task 1 |
| Update tauri.conf.json endpoint | Task 2 |
| GitHub Actions CI on v* tag | Task 3 |
| Version extracted from tag at build time | Task 3 (Extract version step) |
| Signing keys via GitHub secrets | Task 3 (Build step env vars) |
| latest.json as release asset on GitHub CDN | Task 3 (Generate + upload) |
| Tag annotation as release notes | Task 3 (Extract notes step) |
| Pre-push hook enforces tag/version match | Task 4 |
| pnpm hooks:install for one-time setup | Task 4 |
| README: user install section | Task 5 |
| README: maintainer release ritual | Task 5 |

**Placeholder scan:** No TBDs, no "implement later" — all steps contain complete content.

**Type/name consistency:** No shared types between tasks; all bash variable names are consistent within their scripts.
