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
