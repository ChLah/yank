# Contributing to yank

Thanks for your interest in contributing! Here's what you need to know.

## Prerequisites

- Windows (yank is a Windows-only desktop app)
- Node.js 22+, pnpm 10+
- Rust (stable toolchain)
- [Tauri prerequisites](https://tauri.app/start/prerequisites/)

## Development setup

```sh
pnpm install
pnpm tauri dev
```

## Making changes

1. Fork the repo and create a branch off `main`.
2. Make your changes. Run `pnpm test` before committing.
3. Open a pull request — fill in the PR template.
4. A maintainer will review and merge.

**Direct pushes to `main` are not allowed.** All changes go through PRs.

## Releases

Releases are managed exclusively by maintainers. Do not push `v*` tags.

## Code style

- TypeScript is formatted with Prettier (`pnpm format`).
- Rust follows the default `rustfmt` style (`cargo fmt`).

## Reporting bugs / requesting features

Use [GitHub Issues](https://github.com/ChLah/yank/issues). Search first — it may already exist.
