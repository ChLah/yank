# GitHub Releases Deployment

**Date:** 2026-05-19
**Status:** Planned

## Problem

YANK's auto-updater was wired to `http://localhost:8787/latest.json` — a local
dev harness (`scripts/update-server.ts`) that manually built a signed installer
and served it for manual update testing. This was never a real deployment
strategy. The app needed a real CI pipeline that builds, signs, and distributes
updates to end users via a public channel.

## Goal

Replace the local update-server harness with a GitHub Releases-based pipeline:
CI builds the signed NSIS installer on every version tag, publishes it as a
GitHub Release, and the shipped app auto-updates from there.

## Decisions (from brainstorm)

| Topic | Decision |
|---|---|
| Repo visibility | Public — private repos block the Tauri updater (no auth on asset fetch) |
| Release trigger | `v*` annotated git tag push |
| Version source of truth | Git tag — CI extracts version from tag name at build time |
| `tauri.conf.json` version | Kept manually in sync with the tag; enforced by pre-push hook |
| CI runner | `windows-latest` (GitHub-hosted) — app is Windows-only (NSIS target) |
| Signing keys in CI | GitHub Actions repository secrets (`TAURI_SIGNING_PRIVATE_KEY` + `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`) |
| Update manifest URL | `https://github.com/ChLah/yank/releases/latest/download/latest.json` attached as a release asset |
| Release notes | Tag annotation message (`git tag -a vX.Y.Z -m "..."`) |
| Pre-push hook mechanism | Committed `scripts/pre-push` shell script, installed via `pnpm hooks:install` |
| README | Both user-facing (install from Releases page) and maintainer-facing (release ritual) |

## Architecture

**CI pipeline.** `.github/workflows/release.yml` triggers on `v*` tag push.
It runs on `windows-latest`, installs the Node + pnpm + Rust toolchain, builds
the Tauri app with `--config '{"version":"X.Y.Z","bundle":{"createUpdaterArtifacts":true}}'`
(version extracted from the tag, signing enabled via secrets), generates
`latest.json` from the produced `.sig` file, then creates a GitHub Release
using the tag annotation as the body and uploads the installer, `.sig`, and
`latest.json` as release assets.

**Updater endpoint.** `tauri.conf.json` points to
`https://github.com/ChLah/yank/releases/latest/download/latest.json`. GitHub
automatically redirects `/releases/latest/download/<file>` to the most recent
release that has an asset with that name — no extra infra needed.

**Version guard.** `scripts/pre-push` is a bash script (committed to the
repo, installed once via `pnpm hooks:install` as `.git/hooks/pre-push`). If any
ref being pushed is a `v*` tag, it extracts the version from `tauri.conf.json`
via Node and compares it to the tag. A mismatch aborts the push with a clear
error message directing the developer to update `tauri.conf.json` first.

## Release ritual

1. Update `"version"` in `src-tauri/tauri.conf.json`
2. Commit the bump
3. `git tag -a vX.Y.Z -m "Release notes here"`
4. `git push && git push --tags`

The pre-push hook enforces step 1 before step 4 can succeed. CI (~10 min) handles the rest.

## Future: agentic release notes

The tag annotation message is intentionally the release notes source (not
auto-generated from git log). A future agentic worker can generate the message
from the spec documents + commit history between tags before the human runs
`git tag -a`.

## Touchpoints

| File | Change |
|---|---|
| `scripts/update-server.ts` | Deleted — replaced by real CI |
| `package.json` | Remove `update:local` script, add `hooks:install` |
| `src-tauri/tauri.conf.json` | Updater endpoint → GitHub CDN; remove `dangerousInsecureTransportProtocol` |
| `.github/workflows/release.yml` | New — CI build + sign + publish |
| `scripts/pre-push` | New — version-guard hook |
| `README.md` | New — user install + maintainer release ritual |

## Out of scope

- macOS / Linux builds (YANK is Windows-only)
- Automated version bumping (version in `tauri.conf.json` is bumped manually)
- A separate update server or proxy (GitHub CDN is sufficient for a public repo)
- Release note generation (future agentic task)
