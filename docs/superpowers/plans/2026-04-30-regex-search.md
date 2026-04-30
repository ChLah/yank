# Regex Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an opt-in `.*` toggle to the clipboard search bar that switches from plain substring matching to case-insensitive regex matching, with a red border on invalid patterns and stable results from the last valid match.

**Architecture:** Regex state lives entirely in `ClipboardTabComponent` as Angular signals — `regexMode` and `lastValidRegex`. `lastValidRegex` is updated imperatively in `onSearchInput` and `toggleRegexMode` (no `effect()` needed). `isRegexInvalid` is a computed that inline-checks whether the current query is a compilable regex. `filteredEntries` bypasses the service's plain-text filter when regex mode is active and applies the last valid `RegExp` directly via a new pure helper `filterClipboardEntriesByRegex`. An invalid pattern shows `border-destructive` on the search bar wrapper; no toast or error text.

**Note on snippets:** The spec mentions regex applying to both tabs, but `SnippetsTabComponent` has no search bar yet. This plan implements regex for the clipboard tab only, where search already exists.

**Tech Stack:** Angular 19 signals (`signal`, `computed`), Tailwind CSS utility classes, `@ngx-translate/core` pipe for aria-label i18n, Karma/Jasmine for unit tests.

---

## File Structure

| File | Change |
|---|---|
| `src/app/core/services/clipboard.service.ts` | Add exported `filterClipboardEntriesByRegex(entries, rx)` pure function |
| `src/app/core/services/clipboard.service.spec.ts` | Add tests for the new helper |
| `src/app/i18n/translation.interface.ts` | Add `SEARCH_REGEX_TOGGLE: string` to `CLIPBOARD` section |
| `src/app/i18n/en.ts` | Add English value |
| `src/app/i18n/de.ts` | Add German value |
| `src/app/features/clipboard-list/clipboard-tab.component.ts` | Add regex signals and `isRegexInvalid` computed, update `filteredEntries`, `onSearchInput`, `clearSearch`; add `toggleRegexMode` and `searchBarClass`; update template |

---

### Task 1: Pure Regex Filter Helper (TDD)

**Files:**
- Modify: `src/app/core/services/clipboard.service.spec.ts`
- Modify: `src/app/core/services/clipboard.service.ts`

- [ ] **Step 1: Write failing tests**

Update the import at the top of `clipboard.service.spec.ts` from:

```typescript
import { filterClipboardEntries } from './clipboard.service';
```

To:

```typescript
import { filterClipboardEntries, filterClipboardEntriesByRegex } from './clipboard.service';
```

Then add this describe block at the end of the file:

```typescript
describe('filterClipboardEntriesByRegex', () => {
  it('returns entries whose content matches the regex', () => {
    const entries = [
      makeEntry({ id: 1, content: 'Hello World' }),
      makeEntry({ id: 2, content: 'Foo Bar' }),
    ];
    expect(filterClipboardEntriesByRegex(entries, /hello/i)).toEqual([entries[0]]);
  });

  it('is case-insensitive when the regex has the i flag', () => {
    const entries = [makeEntry({ id: 1, content: 'HELLO' })];
    expect(filterClipboardEntriesByRegex(entries, /hello/i)).toEqual(entries);
  });

  it('excludes entries with null content', () => {
    const entries = [
      makeEntry({ id: 1, content: null }),
      makeEntry({ id: 2, content: 'hello' }),
    ];
    expect(filterClipboardEntriesByRegex(entries, /hello/i)).toEqual([entries[1]]);
  });

  it('returns empty array when no entries match', () => {
    const entries = [makeEntry({ id: 1, content: 'foo' })];
    expect(filterClipboardEntriesByRegex(entries, /bar/i)).toEqual([]);
  });

  it('supports anchored patterns', () => {
    const entries = [
      makeEntry({ id: 1, content: 'error: file not found' }),
      makeEntry({ id: 2, content: 'warning: error occurred' }),
    ];
    expect(filterClipboardEntriesByRegex(entries, /^error/i)).toEqual([entries[0]]);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```
npx karma start karma.conf.js --single-run 2>&1 | grep -A3 "filterClipboardEntriesByRegex"
```

Expected: import error — `filterClipboardEntriesByRegex is not exported`.

- [ ] **Step 3: Add the helper function to `clipboard.service.ts`**

After the closing `}` of `filterClipboardEntries` (line 63), add:

```typescript
export function filterClipboardEntriesByRegex(
  entries: ClipboardEntry[],
  rx: RegExp,
): ClipboardEntry[] {
  return entries.filter((e) => e.content != null && rx.test(e.content));
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```
npx karma start karma.conf.js --single-run 2>&1 | tail -10
```

Expected: all tests pass, `TOTAL: X SUCCESS`.

- [ ] **Step 5: Commit**

```bash
git add src/app/core/services/clipboard.service.ts src/app/core/services/clipboard.service.spec.ts
git commit -m "feat: add filterClipboardEntriesByRegex helper"
```

---

### Task 2: i18n Key for Regex Toggle

**Files:**
- Modify: `src/app/i18n/translation.interface.ts`
- Modify: `src/app/i18n/en.ts`
- Modify: `src/app/i18n/de.ts`

- [ ] **Step 1: Add key to the Translation interface**

In `translation.interface.ts`, inside the `CLIPBOARD` block, add after `EDIT_COPY_FAILED: string;` (line 61):

```typescript
    SEARCH_REGEX_TOGGLE: string;
```

- [ ] **Step 2: Add English value**

In `en.ts`, inside `CLIPBOARD`, add after `EDIT_COPY_FAILED: 'Failed to copy to clipboard.',` (line 62):

```typescript
    SEARCH_REGEX_TOGGLE: 'Toggle regex search',
```

- [ ] **Step 3: Add German value**

In `de.ts`, inside `CLIPBOARD`, add after `EDIT_COPY_FAILED: 'Kopieren fehlgeschlagen.',` (line 62):

```typescript
    SEARCH_REGEX_TOGGLE: 'Regulären Ausdruck umschalten',
```

- [ ] **Step 4: Verify TypeScript compiles with no errors**

```
npx tsc --noEmit 2>&1 | head -20
```

Expected: no output (no errors).

- [ ] **Step 5: Commit**

```bash
git add src/app/i18n/translation.interface.ts src/app/i18n/en.ts src/app/i18n/de.ts
git commit -m "feat: add CLIPBOARD.SEARCH_REGEX_TOGGLE i18n key"
```

---

### Task 3: Regex State, Logic, and Helper Computed in ClipboardTabComponent

**Files:**
- Modify: `src/app/features/clipboard-list/clipboard-tab.component.ts`

- [ ] **Step 1: Update the clipboard service import to include `filterClipboardEntriesByRegex`**

Change line 24:

```typescript
import { ClipboardKindFilter, ClipboardService } from '../../core/services/clipboard.service';
```

To:

```typescript
import {
  ClipboardKindFilter,
  ClipboardService,
  filterClipboardEntriesByRegex,
} from '../../core/services/clipboard.service';
```

- [ ] **Step 2: Add `regexMode`, `lastValidRegex`, `isRegexInvalid`, and `searchBarClass` signals/computed**

After the existing `protected showTransformPicker = signal(false);` (line 184), add:

```typescript
  protected regexMode = signal(false);
  private lastValidRegex = signal<RegExp | null>(null);

  protected isRegexInvalid = computed(() => {
    if (!this.regexMode() || !this.searchQuery()) return false;
    try {
      new RegExp(this.searchQuery(), 'i');
      return false;
    } catch {
      return true;
    }
  });

  protected searchBarClass = computed(() => {
    if (!this.isSearching()) return 'max-h-0 opacity-0';
    const border = this.isRegexInvalid() ? 'border-destructive' : 'border-border';
    return `max-h-10 opacity-100 border-b ${border}`;
  });
```

- [ ] **Step 3: Update `filteredEntries` to use regex when active**

Replace the current `filteredEntries` computed (lines 192–194):

```typescript
  protected filteredEntries = computed(() =>
    this.clipboard.filterEntries(this.tab() === 'pinned', this.activeFilter(), this.searchQuery()),
  );
```

With:

```typescript
  protected filteredEntries = computed(() => {
    const q = this.searchQuery();
    const pinnedOnly = this.tab() === 'pinned';
    const kind = this.activeFilter();

    if (!this.regexMode() || !q) {
      return this.clipboard.filterEntries(pinnedOnly, kind, q);
    }

    const base = this.clipboard.filterEntries(pinnedOnly, kind, '');
    const rx = this.lastValidRegex();
    return rx ? filterClipboardEntriesByRegex(base, rx) : base;
  });
```

- [ ] **Step 4: Update `onSearchInput` to track the last valid regex**

Replace the current `onSearchInput` (lines 266–269):

```typescript
  protected onSearchInput(event: Event): void {
    this.searchQuery.set((event.target as HTMLInputElement).value);
    this.emitSelectedEntry();
  }
```

With:

```typescript
  protected onSearchInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.searchQuery.set(value);
    if (this.regexMode() && value) {
      try {
        this.lastValidRegex.set(new RegExp(value, 'i'));
      } catch {
        // keep previous lastValidRegex so results stay stable
      }
    }
    this.emitSelectedEntry();
  }
```

- [ ] **Step 5: Add `toggleRegexMode` method**

Add after `clearSearch()` (currently ending at line 275):

```typescript
  protected toggleRegexMode(): void {
    const next = !this.regexMode();
    this.regexMode.set(next);
    this.lastValidRegex.set(null);
    if (next && this.searchQuery()) {
      try {
        this.lastValidRegex.set(new RegExp(this.searchQuery(), 'i'));
      } catch {
        // current query is invalid; lastValidRegex stays null
      }
    }
  }
```

- [ ] **Step 6: Update `clearSearch` to reset regex state**

Replace the current `clearSearch` (lines 271–275):

```typescript
  protected clearSearch(): void {
    this.searchQuery.set('');
    this.isSearching.set(false);
    this.emitSelectedEntry();
  }
```

With:

```typescript
  protected clearSearch(): void {
    this.searchQuery.set('');
    this.isSearching.set(false);
    this.regexMode.set(false);
    this.lastValidRegex.set(null);
    this.emitSelectedEntry();
  }
```

- [ ] **Step 7: Verify TypeScript compiles with no errors**

```
npx tsc --noEmit 2>&1 | head -20
```

Expected: no output.

- [ ] **Step 8: Commit**

```bash
git add src/app/features/clipboard-list/clipboard-tab.component.ts
git commit -m "feat: add regex mode state, filteredEntries logic, and clearSearch reset"
```

---

### Task 4: Template — `.*` Button and Invalid Border

**Files:**
- Modify: `src/app/features/clipboard-list/clipboard-tab.component.ts` (template section)

- [ ] **Step 1: Switch the search bar wrapper to use `searchBarClass()`**

In the template, find the search bar outer `<div>` (lines 82–85):

```html
    <!-- Search bar (animated slide-in) -->
    <div
      class="overflow-hidden transition-all duration-150 ease-out shrink-0"
      [class]="isSearching() ? 'max-h-10 opacity-100 border-b border-border' : 'max-h-0 opacity-0'"
    >
```

Change to:

```html
    <!-- Search bar (animated slide-in) -->
    <div
      class="overflow-hidden transition-all duration-150 ease-out shrink-0"
      [class]="searchBarClass()"
    >
```

- [ ] **Step 2: Add the `.*` toggle button inside the search input row**

Find the inner `<div class="flex items-center gap-2 px-3.5 h-9">` block (lines 86–104) and replace it entirely with:

```html
      <div class="flex items-center gap-2 px-3.5 h-9">
        <ng-icon hlm size="sm" name="lucideSearch" class="text-muted-foreground shrink-0" />
        <input
          #searchInput
          type="text"
          [value]="searchQuery()"
          (input)="onSearchInput($event)"
          [placeholder]="'CLIPBOARD.SEARCH_PLACEHOLDER' | translate"
          class="flex-1 bg-transparent text-[13px] text-foreground placeholder:text-muted-foreground outline-none"
        />
        <button
          (click)="toggleRegexMode()"
          [attr.aria-label]="'CLIPBOARD.SEARCH_REGEX_TOGGLE' | translate"
          class="text-[11px] font-mono transition-colors shrink-0 rounded px-1"
          [class]="
            regexMode()
              ? 'text-brand-300 bg-brand/20'
              : 'text-muted-foreground hover:text-foreground'
          "
        >
          .*
        </button>
        @if (searchQuery()) {
          <button
            class="text-muted-foreground hover:text-foreground transition-colors"
            (click)="clearSearch()"
          >
            <ng-icon hlm size="sm" name="lucideX" />
          </button>
        }
      </div>
```

- [ ] **Step 3: Verify TypeScript compiles with no errors**

```
npx tsc --noEmit 2>&1 | head -20
```

Expected: no output.

- [ ] **Step 4: Run the full test suite**

```
npx karma start karma.conf.js --single-run 2>&1 | tail -10
```

Expected: `TOTAL: X SUCCESS`, no failures.

- [ ] **Step 5: Commit**

```bash
git add src/app/features/clipboard-list/clipboard-tab.component.ts
git commit -m "feat: add .* regex toggle button and border-destructive feedback to search bar"
```
