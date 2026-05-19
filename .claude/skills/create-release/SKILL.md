---
name: create-release
description: Use when the user wants to cut a new release, bump the version, tag a commit, or asks "what's the next version". Guides version selection, drafts release notes from git history and spec docs, and creates an annotated tag.
---

# Create Release

## Overview

Determines the next semantic version, drafts release notes from git history and spec documents, confirms with the user, and creates an annotated tag ready to push.

## Step 1 — Pre-flight checks

Run both checks before doing anything else. Abort with a clear error if either fails.

```bash
# Must be on main
git rev-parse --abbrev-ref HEAD

# Must be clean
git status --porcelain
```

**Errors to show:**

- Wrong branch: `Error: You must be on the main branch to create a release. Currently on: <branch>.`
- Dirty tree: `Error: There are uncommitted changes. Commit or stash them before releasing.\n\n<git status output>`

## Step 2 — Gather history since last tag

```bash
# Last annotated tag
git describe --tags --abbrev=0

# Commits since that tag (one-line, newest first)
git log <last-tag>..HEAD --oneline --no-decorate
```

If no tag exists yet, use the full history: `git log --oneline --no-decorate`.

Also read any spec documents that may describe the changes:

- Glob `docs/**/*.md` — look for specs or design docs whose filename slugs appear in commit messages or are dated after the last tag's commit date.

Read those spec files (in parallel) to extract feature intent beyond what commit messages convey.

## Step 3 — Recommend a version bump

Parse the commits using conventional-commit prefixes as signal:

| Signal in commits | Recommended bump |
|-------------------|-----------------|
| `BREAKING CHANGE` in body, or `!` after type | **major** |
| Any `feat:` commit | **minor** |
| Only `fix:`, `chore:`, `docs:`, `refactor:`, `perf:`, `test:`, `ci:` | **patch** |

Calculate the new version from `<last-tag>` (strip leading `v`, split on `.`, increment the appropriate component, reset lower components to 0).

## Step 4 — Draft release notes

Compose a multi-line tag annotation message using this structure:

```
v<X.Y.Z> — <one-sentence project tagline from README>

<Feature group 1 heading>
- <bullet from commit or spec>
- ...

<Feature group 2 heading (if any)>
- ...

<Bug fixes / Improvements (if any)>
- ...
```

Rules:
- Group related commits and spec items under a heading; don't list every commit hash.
- Prefer user-facing language ("You can now…") over internal jargon.
- Omit `chore:`, `ci:`, `docs:` commits unless they affect the user.
- Keep the whole message under ~40 lines.

## Step 5 — Present and confirm

Show the user a summary block:

```
Proposed release
────────────────
Version : v<X.Y.Z>  (bump type: <major|minor|patch> — <one sentence reason>)

Release notes:
<full draft message>
────────────────
Is this OK, or what would you like to change?
```

Wait for the user's response. Accept plain confirmation ("ok", "looks good", "yes", "ship it") or specific change requests ("change the version to X", "reword the second bullet", "add a note about Y").

Apply requested changes and re-display the summary. Repeat until the user confirms.

## Step 6 — Create the tag

Once confirmed:

```bash
git tag -a v<X.Y.Z> -m "<full release notes message>"
```

Then tell the user:

```
Tag v<X.Y.Z> created locally.

Push it to trigger the release pipeline:
  git push origin v<X.Y.Z>
```

Do NOT push automatically.

## Edge cases

- **No prior tag:** treat the entire history as "since last release"; recommend `0.1.0` as the version (or ask the user if there is genuinely no prior version).
- **Version already tagged:** abort with `Error: Tag v<X.Y.Z> already exists. Bump the version further or delete the existing tag first.`
- **Empty commit list:** warn the user there are no new commits since `<last-tag>` and ask whether they still want to proceed.
