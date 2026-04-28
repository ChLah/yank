# Quick-Paste Shortcut Index Indicators Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a muted 1–9 digit in a fixed-width left gutter on clipboard entries so users can see at a glance which `Ctrl+N` shortcut to press.

**Architecture:** A fixed `w-5` gutter span is prepended inside every `ClipboardEntryComponent`, rendering the digit for entries 0–8 and nothing for entries 9+. Because the span is always present, all entries share identical left indent. `ClipboardListComponent` passes the 1-based index via a new `shortcutIndex` input.

**Tech Stack:** Angular 19 signals (`input()`), Tailwind CSS 4, inline component templates.

---

## Files

| Action | Path |
|--------|------|
| Modify | `src/app/features/clipboard-list/clipboard-entry.component.ts` |
| Modify | `src/app/features/clipboard-list/clipboard-list.component.ts` |

No new files. No new tests (pure template change with no extractable logic — project test convention is to test exported pure functions only, and this feature introduces none).

---

### Task 1: Add `shortcutIndex` input and gutter span to `ClipboardEntryComponent`

**Files:**
- Modify: `src/app/features/clipboard-list/clipboard-entry.component.ts`

**Context:** The component's outer flex container currently uses `pl-3.5` for left padding. We replace it with `pl-1.5` and insert a `w-5 shrink-0` gutter span as the first child — this span is always rendered, keeping all rows at the same indent. The digit is styled to match secondary metadata text elsewhere in the entry (`text-[11px] text-muted-foreground font-mono tabular-nums`).

- [ ] **Step 1: Add the `shortcutIndex` input to the component class**

In `clipboard-entry.component.ts`, find the inputs block starting around line 170:

```typescript
  entry = input.required<ClipboardEntry>();
  selected = input(false);
  editMode = input(false);
  ocrLoading = input(false);
```

Add `shortcutIndex` after `ocrLoading`:

```typescript
  entry = input.required<ClipboardEntry>();
  selected = input(false);
  editMode = input(false);
  ocrLoading = input(false);
  shortcutIndex = input<number | null>(null);
```

- [ ] **Step 2: Update the outer flex container padding in the template**

Find this line in the template (around line 53):

```html
        class="relative flex items-center gap-2 pl-3.5 pr-3 group transition-colors border-l-2"
```

Change `pl-3.5` to `pl-1.5`:

```html
        class="relative flex items-center gap-2 pl-1.5 pr-3 group transition-colors border-l-2"
```

- [ ] **Step 3: Insert the gutter span as first child of the flex container**

Immediately after the opening `>` of the outer flex `<div>` (after the `hlmHoverCardTrigger` / `hideDelay` attributes, before the `@if (ocrLoading())` block, around line 61), insert:

```html
        <span class="w-5 shrink-0 text-[11px] text-muted-foreground font-mono tabular-nums text-right select-none leading-none">
          @if (shortcutIndex() !== null) { {{ shortcutIndex() }} }
        </span>
```

The full start of the flex div should now look like:

```html
      <div
        class="relative flex items-center gap-2 pl-1.5 pr-3 group transition-colors border-l-2"
        [class.cursor-pointer]="!editMode()"
        [class]="selected() ? 'border-l-brand bg-card' : 'border-l-transparent hover:bg-card/60'"
        (click)="onOuterClick()"
        hlmHoverCardTrigger
        [showDelay]="600"
        [hideDelay]="200"
      >
        <span class="w-5 shrink-0 text-[11px] text-muted-foreground font-mono tabular-nums text-right select-none leading-none">
          @if (shortcutIndex() !== null) { {{ shortcutIndex() }} }
        </span>
        @if (ocrLoading()) {
```

- [ ] **Step 4: Run the dev server and verify visually**

```bash
npm run tauri dev
```

Open the clipboard window. The first 9 entries should show digits `1`–`9` in a small muted column on the left. Entry 10 and beyond should have an empty column at the same left offset — no misalignment. Selected entries should look correct (brand left border still visible).

- [ ] **Step 5: Commit**

```bash
git add src/app/features/clipboard-list/clipboard-entry.component.ts
git commit -m "feat(clipboard-entry): add shortcut index gutter for quick-paste indicators"
```

---

### Task 2: Pass `shortcutIndex` from `ClipboardListComponent`

**Files:**
- Modify: `src/app/features/clipboard-list/clipboard-list.component.ts`

**Context:** The entry loop is at lines 273–295. `i` is the zero-based `$index`. Entries 0–8 map to shortcuts 1–9 (`i + 1`). Entry 9 and beyond get `null`. This is the only change in this file.

- [ ] **Step 1: Add `[shortcutIndex]` binding to `<app-clipboard-entry>`**

Find the `<app-clipboard-entry>` usage in the loop (around line 275):

```html
                  <app-clipboard-entry
                    [entry]="entry"
                    [selected]="selectedIndex() === i"
                    [editMode]="editingEntryId() === entry.id"
                    [ocrLoading]="ocrLoadingEntryId() === entry.id"
                    (select)="selectEntry(i)"
                    (delete)="deleteEntry(i)"
                    (pin)="pinEntry(i)"
                    (editConfirm)="onEditConfirm($event)"
                    (editCancel)="onEditCancel()"
                  />
```

Add `[shortcutIndex]="i < 9 ? i + 1 : null"` after `[ocrLoading]`:

```html
                  <app-clipboard-entry
                    [entry]="entry"
                    [selected]="selectedIndex() === i"
                    [editMode]="editingEntryId() === entry.id"
                    [ocrLoading]="ocrLoadingEntryId() === entry.id"
                    [shortcutIndex]="i < 9 ? i + 1 : null"
                    (select)="selectEntry(i)"
                    (delete)="deleteEntry(i)"
                    (pin)="pinEntry(i)"
                    (editConfirm)="onEditConfirm($event)"
                    (editCancel)="onEditCancel()"
                  />
```

- [ ] **Step 2: Verify in dev server**

Check that:
- Recent tab: digits 1–9 appear on first 9 entries
- Pinned tab: digits 1–9 appear on first 9 pinned entries (same loop, same `filteredEntries()` signal)
- Snippets tab: no digits (uses `SnippetItemComponent`, untouched)
- With fewer than 9 entries total, only as many digits as there are entries appear
- Pressing `Ctrl+1` pastes the entry showing `1`

- [ ] **Step 3: Commit**

```bash
git add src/app/features/clipboard-list/clipboard-list.component.ts
git commit -m "feat(clipboard-list): pass shortcut index to entry component for quick-paste indicators"
```
