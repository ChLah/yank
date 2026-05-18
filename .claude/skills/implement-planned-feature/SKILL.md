---
name: implement-planned-feature
description: Use when the user asks which features are planned but not yet started, wants to pick a feature to work on next, or asks what specs exist without an implementation plan. Compares docs/superpowers/specs to docs/superpowers/plans and guides selection, planning, and implementation.
---

# Implement Planned Feature

## Overview

Surfaces spec documents that have no corresponding implementation plan, lets the user pick one, writes the plan, and starts implementation.

## Steps

### 1. Discover Unplanned Specs

Use Glob to collect both lists:
- `docs/superpowers/specs/*.md` — all spec files
- `docs/superpowers/plans/*.md` — all plan files

**Matching logic:** For each spec, derive its _feature slug_ by stripping the `YYYY-MM-DD-` date prefix and `-design.md` suffix (e.g. `2026-04-29-more-transforms-design.md` → `more-transforms`). Then check whether any plan filename contains that slug as a substring. Use judgment for near-matches (e.g. `pause-capture` matches `pause-capture-mode`; `yank-naming` matches `yank-rename`). When in doubt, include the spec in the unplanned list rather than silently skipping it.

**Filter out superseded specs.** A spec that has been replaced by a newer one is not actionable and must not be surfaced. Detect supersession by reading the spec's first ~30 lines and looking for either signal:

1. The phrase `Superseded by` (case-insensitive) in the body — typically inside a `> ⚠️` blockquote near the top, pointing to the replacement spec.
2. The token `(Superseded)` (case-insensitive) in the H1 title.

A `**Supersedes:** [...]` line points *outward* to the superseded spec and is a normal annotation on the authoritative one — do **not** filter on this.

If a spec is superseded, drop it before applying the matching logic above. It does not appear in the user-facing list even if no plan exists.

### 2. Extract Title and Description

For each unplanned spec, read the file and extract:
- **Title:** The first `# Heading` (H1)
- **Description:** The content of the `## Overview` section (first paragraph only — one to three sentences)

Read all unplanned specs in parallel.

### 3. Present the List

Display a numbered list:

```
Specs without an implementation plan:

1. More Text Transforms
   Extend TransformService with eight new developer-focused transforms (Base64, hashing, slug, dedup, sort).

2. Regex Search
   Add opt-in regex mode to the search bar with a .* toggle, applying to both clipboard history and snippets tabs.

3. Keyboard Command Resolvers
   Extract keyboard routing from onKeyDown() into two pure resolver functions, one per tab, to improve testability.

Which feature would you like to implement? Enter a number:
```

Wait for the user's response before continuing.

### 4. Write the Plan

After the user selects a feature:

1. Read the full spec file for the selected feature.
2. Invoke the `superpowers:write-plan` skill, providing the spec content as context. The plan file should be placed in `docs/superpowers/plans/` following the naming convention `YYYY-MM-DD-<feature-slug>.md` (use today's date).

### 5. Start Implementation

After the plan is written, immediately proceed to implement it. Use the `superpowers:executing-plans` skill to work through the plan task-by-task.

## Naming Convention Reference

| File type | Pattern | Example |
|-----------|---------|---------|
| Spec | `YYYY-MM-DD-<slug>-design.md` | `2026-04-29-regex-search-design.md` |
| Plan | `YYYY-MM-DD-<slug>.md` | `2026-04-29-regex-search.md` |

## Edge Cases

- **No unplanned specs:** Tell the user all specs have implementation plans and list the plan files.
- **Single unplanned spec:** Still show the list — don't skip the selection step.
- **Ambiguous match:** When you are not sure whether a plan covers a spec, include the spec in the list with a note like `(may already be covered by <plan-file>)`.
