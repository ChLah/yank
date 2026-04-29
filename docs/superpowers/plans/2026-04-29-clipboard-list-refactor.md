# Clipboard List Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Break the 1300-line `ClipboardListComponent` into focused smart tab components, a shared skeleton loader, footer hint components, and a thin shell.

**Architecture:** Each tab (`ClipboardTabComponent`, `SnippetsTabComponent`) is a self-contained smart component that injects its own services, subscribes to popup events independently, owns all its state and keyboard handling, and calls `toast()` directly for notifications. The shell shrinks to ~120 lines: header, tab switcher, footer, `captureIsPaused`, window-move save, and Ctrl+Tab. The `duplicateError` signal is dead code (never set to `true`) and is removed.

**Tech Stack:** Angular 21 signals + `resource()`, CDK drag-drop, `@spartan-ng/brain/sonner` (`toast()`), `@spartan-ng/helm/*`, Vitest (pure-function unit tests only — no TestBed), pnpm, Prettier.

---

## File Map

| Status | Path | Responsibility |
|--------|------|---------------|
| NEW | `src/app/shared/ui/skeleton-list/skeleton-list.component.ts` | Animated pulse skeleton rows |
| NEW | `src/app/features/clipboard-list/keyboard.utils.ts` | `resolveEditModeAction` (shared) |
| NEW | `src/app/features/clipboard-list/keyboard.utils.spec.ts` | Tests for above |
| NEW | `src/app/features/clipboard-list/clipboard-footer-hints.component.ts` | Static clipboard keyboard hint rows |
| NEW | `src/app/features/clipboard-list/snippets-footer-hints.component.ts` | Static snippet keyboard hint row |
| NEW | `src/app/features/clipboard-list/clipboard-tab.component.ts` | Smart Recent/Pinned tab |
| NEW | `src/app/features/clipboard-list/clipboard-tab.component.spec.ts` | Tests for exported pure functions |
| NEW | `src/app/features/clipboard-list/snippets-tab.component.ts` | Smart Snippets tab |
| MODIFY | `src/app/app.ts` | Switch to `HlmToasterImports` / `<hlm-toaster />` |
| MODIFY | `src/app/features/clipboard-list/clipboard-list.component.ts` | Slim to shell |
| DELETE | `src/app/features/clipboard-list/clipboard-list.component.spec.ts` | Tests move to new files |

---

## Task 1: Switch app.ts to HlmToasterImports

**Files:**
- Modify: `src/app/app.ts`

- [ ] **Step 1: Replace the import and component**

Edit `src/app/app.ts`:

```typescript
import { ChangeDetectionStrategy, Component, inject, OnInit } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { HlmToasterImports } from '@spartan-ng/helm/sonner';
import { TauriBridgeService } from './core/services/tauri-bridge.service';

@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, HlmToasterImports],
  host: { 'class': 'block h-full' },
  template: `
    <router-outlet />
    <hlm-toaster />
  `,
})
export class App implements OnInit {
  private router = inject(Router);
  private bridge = inject(TauriBridgeService);

  ngOnInit(): void {
    this.bridge.onPopupShown(() => this.router.navigate(['/']));
  }
}
```

- [ ] **Step 2: Format**

```bash
pnpm prettier --write src/app/app.ts
```

- [ ] **Step 3: Commit**

```bash
git add src/app/app.ts
git commit -m "chore: switch to HlmToasterImports / hlm-toaster"
```

---

## Task 2: Create SkeletonListComponent

**Files:**
- Create: `src/app/shared/ui/skeleton-list/skeleton-list.component.ts`

- [ ] **Step 1: Create the component**

```typescript
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

@Component({
  selector: 'app-skeleton-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="py-1">
      @for (item of items(); track $index) {
        <div class="flex items-center gap-3 pl-5 pr-4 py-2.5 border-l-2 border-l-transparent">
          <div class="flex-1 space-y-1.5">
            <div
              class="h-3 bg-muted rounded animate-pulse"
              [style.width.%]="55 + ($index % 3) * 15"
            ></div>
            <div class="h-2 bg-muted rounded animate-pulse w-20 opacity-50"></div>
          </div>
        </div>
      }
    </div>
  `,
})
export class SkeletonListComponent {
  count = input(5);
  protected items = computed(() => Array.from({ length: this.count() }));
}
```

- [ ] **Step 2: Format**

```bash
pnpm prettier --write src/app/shared/ui/skeleton-list/skeleton-list.component.ts
```

- [ ] **Step 3: Commit**

```bash
git add src/app/shared/ui/skeleton-list/skeleton-list.component.ts
git commit -m "feat(ui): add SkeletonListComponent"
```

---

## Task 3: Extract resolveEditModeAction to keyboard.utils (TDD)

**Files:**
- Create: `src/app/features/clipboard-list/keyboard.utils.ts`
- Create: `src/app/features/clipboard-list/keyboard.utils.spec.ts`
- Modify: `src/app/features/clipboard-list/clipboard-list.component.ts` (remove function)

- [ ] **Step 1: Write the failing spec**

Create `src/app/features/clipboard-list/keyboard.utils.spec.ts`:

```typescript
import { resolveEditModeAction } from './keyboard.utils';

describe('resolveEditModeAction', () => {
  it('returns cancel-navigate for ArrowDown', () => {
    expect(resolveEditModeAction('ArrowDown')).toBe('cancel-navigate');
  });

  it('returns cancel-navigate for ArrowUp', () => {
    expect(resolveEditModeAction('ArrowUp')).toBe('cancel-navigate');
  });

  it('returns block for Enter', () => {
    expect(resolveEditModeAction('Enter')).toBe('block');
  });

  it('returns block for Escape', () => {
    expect(resolveEditModeAction('Escape')).toBe('block');
  });

  it('returns block for letter keys', () => {
    expect(resolveEditModeAction('a')).toBe('block');
    expect(resolveEditModeAction('e')).toBe('block');
  });

  it('returns block for Tab', () => {
    expect(resolveEditModeAction('Tab')).toBe('block');
  });

  it('returns block for Delete', () => {
    expect(resolveEditModeAction('Delete')).toBe('block');
  });

  it('returns block for horizontal arrows', () => {
    expect(resolveEditModeAction('ArrowLeft')).toBe('block');
    expect(resolveEditModeAction('ArrowRight')).toBe('block');
  });
});
```

- [ ] **Step 2: Run — expect failure**

```bash
pnpm test keyboard.utils
```

Expected: `Error: Failed to resolve import "./keyboard.utils"`

- [ ] **Step 3: Create keyboard.utils.ts**

```typescript
export function resolveEditModeAction(key: string): 'cancel-navigate' | 'block' {
  return key === 'ArrowDown' || key === 'ArrowUp' ? 'cancel-navigate' : 'block';
}
```

- [ ] **Step 4: Run — expect pass**

```bash
pnpm test keyboard.utils
```

Expected: `8 tests passed`

- [ ] **Step 5: Remove the duplicate from clipboard-list.component.ts**

In `src/app/features/clipboard-list/clipboard-list.component.ts`, delete the `resolveEditModeAction` function at the bottom of the file (lines ~1289–1292). The existing `clipboard-list.component.spec.ts` imports it from there — update that import to:

```typescript
import { resolveEditModeAction } from './keyboard.utils';
// keep importing the others from clipboard-list.component:
import { getQuickPasteDigit, isOcrTrigger, shouldCancelEditOnSelect } from './clipboard-list.component';
```

Then add the import inside `clipboard-list.component.ts` itself:

```typescript
import { resolveEditModeAction } from './keyboard.utils';
```

And update the two usages inside `onClipboardKeyDown` and `onSnippetKeyDown` — they already call `resolveEditModeAction(event.key)`, no change needed since it's now imported.

- [ ] **Step 6: Run tests — expect all pass**

```bash
pnpm test
```

- [ ] **Step 7: Format and commit**

```bash
pnpm prettier --write src/app/features/clipboard-list/keyboard.utils.ts src/app/features/clipboard-list/keyboard.utils.spec.ts src/app/features/clipboard-list/clipboard-list.component.ts src/app/features/clipboard-list/clipboard-list.component.spec.ts
git add src/app/features/clipboard-list/keyboard.utils.ts src/app/features/clipboard-list/keyboard.utils.spec.ts src/app/features/clipboard-list/clipboard-list.component.ts src/app/features/clipboard-list/clipboard-list.component.spec.ts
git commit -m "refactor: extract resolveEditModeAction to keyboard.utils"
```

---

## Task 4: Create ClipboardFooterHintsComponent

**Files:**
- Create: `src/app/features/clipboard-list/clipboard-footer-hints.component.ts`

- [ ] **Step 1: Create the component**

```typescript
import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { KeyboardHintComponent } from '../../shared/ui/keyboard-hint/keyboard-hint.component';

@Component({
  selector: 'app-clipboard-footer-hints',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [KeyboardHintComponent, TranslatePipe],
  template: `
    <div class="flex items-center gap-2">
      <app-keyboard-hint key="↑↓" [label]="'CLIPBOARD.HINT_NAV' | translate" />
      <app-keyboard-hint key="↵" [label]="'CLIPBOARD.HINT_PASTE' | translate" />
      <app-keyboard-hint key="⇧↵" [label]="'TRANSFORM.HINT' | translate" />
      <app-keyboard-hint key="⌫" [label]="'CLIPBOARD.HINT_DELETE' | translate" />
      <span class="ml-auto text-[10px] text-muted-foreground whitespace-nowrap">
        {{ 'CLIPBOARD.HINT_SEARCH' | translate }}
      </span>
    </div>
    <div class="flex items-center gap-2">
      <app-keyboard-hint key="Ctrl+P" [label]="'CLIPBOARD.HINT_PIN' | translate" />
      <app-keyboard-hint key="Ctrl+E" [label]="'CLIPBOARD.HINT_EDIT' | translate" />
      @if (showOcrHint()) {
        <app-keyboard-hint key="Ctrl+O" [label]="'OCR.KEYBOARD_HINT' | translate" />
      }
      <app-keyboard-hint key="Ctrl+1–9" [label]="'CLIPBOARD.HINT_QUICK_PASTE' | translate" />
      <app-keyboard-hint
        key="Esc"
        [label]="'CLIPBOARD.HINT_CLOSE' | translate"
        class="ml-auto"
      />
    </div>
  `,
})
export class ClipboardFooterHintsComponent {
  showOcrHint = input(false);
}
```

- [ ] **Step 2: Format and commit**

```bash
pnpm prettier --write src/app/features/clipboard-list/clipboard-footer-hints.component.ts
git add src/app/features/clipboard-list/clipboard-footer-hints.component.ts
git commit -m "feat: add ClipboardFooterHintsComponent"
```

---

## Task 5: Create SnippetsFooterHintsComponent

**Files:**
- Create: `src/app/features/clipboard-list/snippets-footer-hints.component.ts`

- [ ] **Step 1: Create the component**

```typescript
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { KeyboardHintComponent } from '../../shared/ui/keyboard-hint/keyboard-hint.component';

@Component({
  selector: 'app-snippets-footer-hints',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [KeyboardHintComponent, TranslatePipe],
  template: `
    <div class="flex items-center gap-2">
      <app-keyboard-hint key="↑↓" [label]="'CLIPBOARD.HINT_NAV' | translate" />
      <app-keyboard-hint key="↵" [label]="'SNIPPETS.HINT_PASTE' | translate" />
      <app-keyboard-hint key="E" [label]="'SNIPPETS.HINT_EDIT' | translate" />
      <app-keyboard-hint key="⌫" [label]="'SNIPPETS.HINT_DELETE' | translate" />
      <app-keyboard-hint key="N" [label]="'SNIPPETS.HINT_NEW' | translate" />
      <app-keyboard-hint
        key="Esc"
        [label]="'CLIPBOARD.HINT_CLOSE' | translate"
        class="ml-auto"
      />
    </div>
  `,
})
export class SnippetsFooterHintsComponent {}
```

- [ ] **Step 2: Format and commit**

```bash
pnpm prettier --write src/app/features/clipboard-list/snippets-footer-hints.component.ts
git add src/app/features/clipboard-list/snippets-footer-hints.component.ts
git commit -m "feat: add SnippetsFooterHintsComponent"
```

---

## Task 6: Create ClipboardTabComponent (TDD)

**Files:**
- Create: `src/app/features/clipboard-list/clipboard-tab.component.spec.ts`
- Create: `src/app/features/clipboard-list/clipboard-tab.component.ts`

- [ ] **Step 1: Write the failing spec**

Create `src/app/features/clipboard-list/clipboard-tab.component.spec.ts`:

```typescript
import {
  ClipboardTabType,
  getQuickPasteDigit,
  isOcrTrigger,
  shouldCancelEditOnSelect,
} from './clipboard-tab.component';

describe('ClipboardTabType', () => {
  it('accepts recent and pinned as valid values', () => {
    const recent: ClipboardTabType = 'recent';
    const pinned: ClipboardTabType = 'pinned';
    expect(recent).toBe('recent');
    expect(pinned).toBe('pinned');
  });
});

describe('shouldCancelEditOnSelect', () => {
  it('returns false when clicking the entry currently in edit mode', () => {
    expect(shouldCancelEditOnSelect(42, 42)).toBe(false);
  });

  it('returns true when clicking a different entry', () => {
    expect(shouldCancelEditOnSelect(7, 42)).toBe(true);
  });

  it('returns true when clickedEntryId is undefined', () => {
    expect(shouldCancelEditOnSelect(undefined, 42)).toBe(true);
  });

  it('returns false for same ID regardless of value', () => {
    expect(shouldCancelEditOnSelect(1, 1)).toBe(false);
    expect(shouldCancelEditOnSelect(0, 0)).toBe(false);
  });
});

describe('getQuickPasteDigit', () => {
  function makeEvent(key: string, mods: Partial<KeyboardEvent> = {}): KeyboardEvent {
    return { key, ctrlKey: false, shiftKey: false, altKey: false, metaKey: false, ...mods } as KeyboardEvent;
  }

  it('returns 1–9 for Ctrl+digit keys', () => {
    for (let d = 1; d <= 9; d++) {
      expect(getQuickPasteDigit(makeEvent(String(d), { ctrlKey: true }))).toBe(d);
    }
  });

  it('returns null for Ctrl+0', () => {
    expect(getQuickPasteDigit(makeEvent('0', { ctrlKey: true }))).toBeNull();
  });

  it('returns null when Ctrl is not held', () => {
    expect(getQuickPasteDigit(makeEvent('1'))).toBeNull();
  });

  it('returns null for Ctrl+Shift+digit', () => {
    expect(getQuickPasteDigit(makeEvent('1', { ctrlKey: true, shiftKey: true }))).toBeNull();
  });

  it('returns null for Ctrl+non-digit', () => {
    expect(getQuickPasteDigit(makeEvent('a', { ctrlKey: true }))).toBeNull();
  });
});

describe('isOcrTrigger', () => {
  function makeEvent(key: string, mods: Partial<KeyboardEvent> = {}): KeyboardEvent {
    return { key, ctrlKey: false, shiftKey: false, altKey: false, metaKey: false, ...mods } as KeyboardEvent;
  }

  it('returns true for Ctrl+o', () => {
    expect(isOcrTrigger(makeEvent('o', { ctrlKey: true }))).toBe(true);
  });

  it('returns true for Ctrl+O (uppercase)', () => {
    expect(isOcrTrigger(makeEvent('O', { ctrlKey: true }))).toBe(true);
  });

  it('returns false without Ctrl', () => {
    expect(isOcrTrigger(makeEvent('o'))).toBe(false);
  });

  it('returns false with extra modifiers', () => {
    expect(isOcrTrigger(makeEvent('o', { ctrlKey: true, shiftKey: true }))).toBe(false);
  });

  it('returns false for other keys', () => {
    expect(isOcrTrigger(makeEvent('p', { ctrlKey: true }))).toBe(false);
  });
});
```

- [ ] **Step 2: Run — expect failure**

```bash
pnpm test clipboard-tab.component
```

Expected: `Error: Failed to resolve import "./clipboard-tab.component"`

- [ ] **Step 3: Create clipboard-tab.component.ts**

```typescript
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  computed,
  inject,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { Router } from '@angular/router';
import { UnlistenFn } from '@tauri-apps/api/event';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideSearch, lucideX } from '@ng-icons/lucide';
import { TranslatePipe } from '@ngx-translate/core';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmIcon } from '@spartan-ng/helm/icon';
import { toast } from '@spartan-ng/brain/sonner';
import { ClipboardEntryComponent } from './clipboard-entry.component';
import { TransformPickerComponent } from './transform-picker.component';
import { SkeletonListComponent } from '../../shared/ui/skeleton-list/skeleton-list.component';
import { EmptyStateComponent } from '../../shared/ui/empty-state/empty-state.component';
import { ClipboardService } from '../../core/services/clipboard.service';
import { TauriBridgeService } from '../../core/services/tauri-bridge.service';
import { ClipboardEntry } from '../../core/models/clipboard-entry.model';
import { resolveEditModeAction } from './keyboard.utils';
import { input } from '@angular/core';

export type ClipboardTabType = 'recent' | 'pinned';
type Filter = 'all' | 'text' | 'image';

@Component({
  selector: 'app-clipboard-tab',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ClipboardEntryComponent,
    TransformPickerComponent,
    SkeletonListComponent,
    EmptyStateComponent,
    NgIcon,
    HlmIcon,
    HlmButton,
    TranslatePipe,
  ],
  providers: [provideIcons({ lucideSearch, lucideX })],
  host: {
    '(keydown)': 'onKeyDown($event)',
    '(click)': 'onHostClick()',
    tabindex: '-1',
    class: 'flex flex-col overflow-hidden outline-none',
  },
  template: `
    <!-- Filter row -->
    <div
      class="flex items-center justify-end px-3.5 h-[34px] shrink-0 bg-card/50 border-b border-border"
    >
      <div class="flex items-center gap-1">
        @for (f of filters; track f.value) {
          <button
            class="text-[11px] px-2 py-0.5 rounded-full border transition-colors"
            [class]="
              activeFilter() === f.value
                ? 'bg-brand/20 text-brand-300 border-brand/30'
                : 'text-muted-foreground border-transparent hover:text-foreground'
            "
            (click)="setFilter(f.value)"
          >
            {{ f.labelKey | translate }}
          </button>
        }
      </div>
    </div>

    <!-- Search bar (animated slide-in) -->
    <div
      class="overflow-hidden transition-all duration-150 ease-out shrink-0"
      [class]="
        isSearching() ? 'max-h-10 opacity-100 border-b border-border' : 'max-h-0 opacity-0'
      "
    >
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
        @if (searchQuery()) {
          <button
            class="text-muted-foreground hover:text-foreground transition-colors"
            (click)="clearSearch()"
          >
            <ng-icon hlm size="sm" name="lucideX" />
          </button>
        }
      </div>
    </div>

    <!-- Content -->
    <div class="relative flex-1 overflow-y-auto scrollbar-thin" #listContainer>
      @if (clipboard.entries.isLoading()) {
        <app-skeleton-list />
      } @else if (clipboard.entries.error()) {
        <app-empty-state
          icon="lucideAlertCircle"
          [title]="'CLIPBOARD.ERROR_LOAD' | translate"
          variant="destructive"
        >
          <button hlmBtn variant="link" size="sm" (click)="clipboard.entries.reload()">
            {{ 'CLIPBOARD.TRY_AGAIN' | translate }}
          </button>
        </app-empty-state>
      } @else if (filteredEntries().length === 0) {
        @if (tab() === 'pinned') {
          <app-empty-state
            icon="lucideBookmark"
            [title]="'CLIPBOARD.EMPTY_PINNED' | translate"
            [hint]="'CLIPBOARD.EMPTY_PINNED_HINT' | translate"
          />
        } @else if (searchQuery()) {
          <app-empty-state
            icon="lucideClipboard"
            [title]="'CLIPBOARD.EMPTY_NO_MATCHES' | translate: { term: searchQuery() }"
          />
        } @else {
          <app-empty-state
            icon="lucideClipboard"
            [title]="'CLIPBOARD.EMPTY_NOTHING' | translate"
          />
        }
      } @else {
        <div class="py-1">
          @for (entry of filteredEntries(); track entry.id; let i = $index) {
            <div class="entry-item relative">
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
              @if (showTransformPicker() && selectedIndex() === i && entry.kind === 'text') {
                <app-transform-picker
                  [content]="entry.content ?? ''"
                  (applied)="onTransformApplied($event)"
                  (cancelled)="onTransformCancelled()"
                  (click)="$event.stopPropagation()"
                />
              }
            </div>
          }
        </div>
      }
    </div>
  `,
})
export class ClipboardTabComponent implements OnInit, OnDestroy {
  tab = input.required<ClipboardTabType>();
  selectedEntry = output<ClipboardEntry | null>();

  protected clipboard = inject(ClipboardService);
  private bridge = inject(TauriBridgeService);
  private router = inject(Router);
  private hostEl = inject(ElementRef);
  private unlistenPopupShown?: UnlistenFn;

  protected selectedIndex = signal(0);
  protected editingEntryId = signal<number | null>(null);
  protected ocrLoadingEntryId = signal<number | null>(null);
  protected activeFilter = signal<Filter>('all');
  protected searchQuery = signal('');
  protected isSearching = signal(false);
  protected showTransformPicker = signal(false);

  protected readonly filters = [
    { labelKey: 'CLIPBOARD.FILTER_ALL', value: 'all' as Filter },
    { labelKey: 'CLIPBOARD.FILTER_TEXT', value: 'text' as Filter },
    { labelKey: 'CLIPBOARD.FILTER_IMAGE', value: 'image' as Filter },
  ];

  protected allEntries = computed(() => this.clipboard.entries.value() ?? []);

  protected filteredEntries = computed(() => {
    let list = this.allEntries();
    if (this.tab() === 'pinned') list = list.filter((e) => e.pinned);
    if (this.activeFilter() !== 'all') list = list.filter((e) => e.kind === this.activeFilter());
    const q = this.searchQuery().toLowerCase().trim();
    if (q) list = list.filter((e) => e.content?.toLowerCase().includes(q));
    return list;
  });

  protected selectedEntryIsImage = computed(() => {
    const entry = this.filteredEntries()[this.selectedIndex()];
    return entry != null && entry.kind === 'image';
  });

  private listContainer = viewChild.required<ElementRef<HTMLElement>>('listContainer');
  private searchInput = viewChild<ElementRef<HTMLInputElement>>('searchInput');

  ngOnInit(): void {
    this.bridge.onPopupShown(() => this.resetState()).then((fn) => {
      this.unlistenPopupShown = fn;
    });
  }

  ngOnDestroy(): void {
    this.unlistenPopupShown?.();
  }

  private resetState(): void {
    this.editingEntryId.set(null);
    this.activeFilter.set('all');
    this.clearSearch();
    this.selectedIndex.set(0);
    this.showTransformPicker.set(false);
    this.ocrLoadingEntryId.set(null);
    this.emitSelectedEntry();
    this.hostEl.nativeElement.focus();
  }

  private emitSelectedEntry(): void {
    this.selectedEntry.emit(this.filteredEntries()[this.selectedIndex()] ?? null);
  }

  protected setFilter(filter: Filter): void {
    this.editingEntryId.set(null);
    this.activeFilter.set(filter);
    this.selectedIndex.set(0);
    this.emitSelectedEntry();
  }

  protected selectEntry(index: number): void {
    if (this.editingEntryId() !== null) {
      const clickedEntry = this.filteredEntries()[index];
      if (!shouldCancelEditOnSelect(clickedEntry?.id, this.editingEntryId()!)) return;
      this.editingEntryId.set(null);
      this.selectedIndex.set(index);
      this.emitSelectedEntry();
      return;
    }
    this.selectedIndex.set(index);
    this.emitSelectedEntry();
    const entry = this.filteredEntries()[index];
    if (!entry) return;
    if (entry.kind === 'image') {
      this.router.navigate(['/preview'], { queryParams: { id: entry.id } });
    } else {
      this.clipboard.setClipboard(entry.id);
    }
  }

  protected deleteEntry(index: number): void {
    const entry = this.filteredEntries()[index];
    if (!entry) return;
    const newLen = this.filteredEntries().length - 1;
    this.clipboard.deleteEntry(entry.id);
    if (newLen <= 0) {
      this.selectedIndex.set(0);
    } else if (this.selectedIndex() >= newLen) {
      this.selectedIndex.set(newLen - 1);
    }
    this.emitSelectedEntry();
  }

  protected pinEntry(index: number): void {
    const entry = this.filteredEntries()[index];
    if (!entry) return;
    this.clipboard.togglePin(entry.id);
  }

  protected onSearchInput(event: Event): void {
    this.searchQuery.set((event.target as HTMLInputElement).value);
    this.selectedIndex.set(0);
    this.emitSelectedEntry();
  }

  protected clearSearch(): void {
    this.searchQuery.set('');
    this.isSearching.set(false);
    this.selectedIndex.set(0);
    this.emitSelectedEntry();
    this.hostEl.nativeElement.focus();
  }

  protected onHostClick(): void {
    if (this.showTransformPicker()) {
      this.showTransformPicker.set(false);
      this.hostEl.nativeElement.focus();
    }
  }

  protected async onEditConfirm(text: string): Promise<void> {
    this.editingEntryId.set(null);
    try {
      await this.bridge.setClipboardText(text);
      this.bridge.hidePopup();
    } catch {
      toast.error('CLIPBOARD.EDIT_COPY_FAILED');
    }
  }

  protected onEditCancel(): void {
    this.editingEntryId.set(null);
    this.hostEl.nativeElement.focus();
  }

  protected async onTransformApplied(event: { transformedContent: string }): Promise<void> {
    this.showTransformPicker.set(false);
    try {
      await this.bridge.setClipboardText(event.transformedContent);
    } finally {
      this.bridge.hidePopup();
    }
  }

  protected onTransformCancelled(): void {
    this.showTransformPicker.set(false);
    this.hostEl.nativeElement.focus();
  }

  protected onKeyDown(event: KeyboardEvent): void {
    if (event.ctrlKey && event.key === 'Tab') return; // let bubble to shell

    if (this.showTransformPicker()) return;

    if (this.editingEntryId() !== null) {
      if (resolveEditModeAction(event.key) === 'cancel-navigate') {
        this.editingEntryId.set(null);
      } else {
        event.stopPropagation();
        return;
      }
    }

    const quickPasteDigit = getQuickPasteDigit(event);
    if (quickPasteDigit !== null) {
      event.preventDefault();
      event.stopPropagation();
      const idx = quickPasteDigit - 1;
      if (idx < this.filteredEntries().length) this.selectEntry(idx);
      return;
    }

    if (this.isSearching()) {
      switch (event.key) {
        case 'ArrowDown':
          event.preventDefault();
          event.stopPropagation();
          this.moveSelection(1);
          break;
        case 'ArrowUp':
          event.preventDefault();
          event.stopPropagation();
          this.moveSelection(-1);
          break;
        case 'Enter':
          event.preventDefault();
          event.stopPropagation();
          if (event.shiftKey) this.openTransformPicker();
          else this.copySelected();
          break;
        case 'Escape':
          event.preventDefault();
          event.stopPropagation();
          this.clearSearch();
          break;
      }
      return;
    }

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        event.stopPropagation();
        this.moveSelection(1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        event.stopPropagation();
        this.moveSelection(-1);
        break;
      case 'Enter':
        event.preventDefault();
        event.stopPropagation();
        if (event.shiftKey) this.openTransformPicker();
        else this.copySelected();
        break;
      case 'Delete':
        event.preventDefault();
        event.stopPropagation();
        this.deleteEntry(this.selectedIndex());
        break;
      case 'Escape':
        event.preventDefault();
        event.stopPropagation();
        this.bridge.hidePopup();
        break;
      default:
        if (event.ctrlKey && !event.shiftKey && !event.altKey && !event.metaKey) {
          if (event.key.toLowerCase() === 'p') {
            event.preventDefault();
            event.stopPropagation();
            this.pinSelected();
          } else if (event.key.toLowerCase() === 'e') {
            event.preventDefault();
            event.stopPropagation();
            this.enterEditMode();
          } else if (isOcrTrigger(event)) {
            event.preventDefault();
            event.stopPropagation();
            this.triggerOcr();
          }
        } else if (event.key.length === 1 && !event.ctrlKey && !event.altKey && !event.metaKey) {
          this.isSearching.set(true);
          this.searchQuery.set(event.key);
          setTimeout(() => {
            const input = this.searchInput()?.nativeElement;
            if (input) {
              input.value = this.searchQuery();
              input.focus();
              input.setSelectionRange(input.value.length, input.value.length);
            }
          }, 0);
        }
    }
  }

  private moveSelection(delta: number): void {
    const len = this.filteredEntries().length;
    if (len === 0) return;
    const next = Math.max(0, Math.min(len - 1, this.selectedIndex() + delta));
    this.selectedIndex.set(next);
    this.emitSelectedEntry();
    this.scrollSelectedIntoView();
  }

  private copySelected(): void {
    this.selectEntry(this.selectedIndex());
  }

  private pinSelected(): void {
    const entry = this.filteredEntries()[this.selectedIndex()];
    if (!entry) return;
    this.clipboard.togglePin(entry.id);
  }

  private enterEditMode(): void {
    const entry = this.filteredEntries()[this.selectedIndex()];
    if (!entry || entry.kind !== 'text') return;
    this.editingEntryId.set(entry.id);
  }

  private openTransformPicker(): void {
    const entry = this.filteredEntries()[this.selectedIndex()];
    if (!entry || entry.kind !== 'text') return;
    this.showTransformPicker.set(true);
  }

  private async triggerOcr(): Promise<void> {
    const entry = this.filteredEntries()[this.selectedIndex()];
    if (!entry || entry.kind !== 'image') return;
    if (this.ocrLoadingEntryId() !== null) return;

    this.ocrLoadingEntryId.set(entry.id);
    try {
      const text = await this.bridge.ocrImage(entry.id);
      if (text === '') {
        toast('' /* OCR.NO_TEXT resolved below */);
        // Note: toast() accepts a string key but not a translate pipe; use the raw key
        // and rely on app-level i18n if needed, or pass the translated string via inject(TranslateService)
        toast.error('No text found in image');
      } else {
        this.clipboard.entries.reload();
        this.selectedIndex.set(0);
        this.emitSelectedEntry();
        toast.success(`OCR extracted ${text.length} characters`);
      }
    } catch (err: unknown) {
      const error = typeof err === 'string' ? err : 'Unknown error';
      toast.error(`OCR failed: ${error}`);
    } finally {
      this.ocrLoadingEntryId.set(null);
    }
  }

  private scrollSelectedIntoView(): void {
    const items =
      this.listContainer().nativeElement.querySelectorAll<HTMLElement>('.entry-item');
    items[this.selectedIndex()]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
}

export function shouldCancelEditOnSelect(
  clickedEntryId: number | undefined,
  editingEntryId: number,
): boolean {
  return clickedEntryId !== editingEntryId;
}

export function getQuickPasteDigit(event: KeyboardEvent): number | null {
  if (!event.ctrlKey || event.shiftKey || event.altKey || event.metaKey) return null;
  const digit = parseInt(event.key, 10);
  return digit >= 1 && digit <= 9 ? digit : null;
}

export function isOcrTrigger(event: KeyboardEvent): boolean {
  return (
    event.key.toLowerCase() === 'o' &&
    event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey &&
    !event.metaKey
  );
}
```

**Note on OCR toast messages:** The current code uses translation keys (`'OCR.NO_TEXT'`, `'OCR.SUCCESS'`). Sonner's `toast()` takes a plain string, not a translation key. Inject `TranslateService` from `@ngx-translate/core` and call `this.translate.instant('OCR.NO_TEXT')` to get the translated string before passing it to `toast()`. Add `private translate = inject(TranslateService)` and replace the hardcoded English strings in `triggerOcr()` accordingly:

```typescript
// add to imports at top of component file:
import { TranslateService } from '@ngx-translate/core';

// add to class fields:
private translate = inject(TranslateService);

// in triggerOcr(), replace the toast calls with:
toast.error(this.translate.instant('OCR.NO_TEXT'));
// ...
toast.success(this.translate.instant('OCR.SUCCESS', { count: text.length }));
// ...
toast.error(this.translate.instant('OCR.ERROR', { error }));
```

Same fix for the edit confirm failure — replace `toast.error('CLIPBOARD.EDIT_COPY_FAILED')` with:

```typescript
toast.error(this.translate.instant('CLIPBOARD.EDIT_COPY_FAILED'));
```

- [ ] **Step 4: Run tests — expect pass**

```bash
pnpm test clipboard-tab.component
```

Expected: `7 tests passed`

- [ ] **Step 5: Format and commit**

```bash
pnpm prettier --write src/app/features/clipboard-list/clipboard-tab.component.ts src/app/features/clipboard-list/clipboard-tab.component.spec.ts
git add src/app/features/clipboard-list/clipboard-tab.component.ts src/app/features/clipboard-list/clipboard-tab.component.spec.ts
git commit -m "feat: add ClipboardTabComponent"
```

---

## Task 7: Create SnippetsTabComponent

**Files:**
- Create: `src/app/features/clipboard-list/snippets-tab.component.ts`

- [ ] **Step 1: Create the component**

```typescript
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  OnDestroy,
  OnInit,
  afterNextRender,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { UnlistenFn } from '@tauri-apps/api/event';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideGripVertical } from '@ng-icons/lucide';
import { TranslatePipe } from '@ngx-translate/core';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmIcon } from '@spartan-ng/helm/icon';
import {
  CdkDropList,
  CdkDrag,
  CdkDragDrop,
  CdkDragHandle,
  CdkDragPlaceholder,
  moveItemInArray,
} from '@angular/cdk/drag-drop';
import { SnippetItemComponent } from './snippet-item.component';
import { SnippetFolderHeaderComponent } from './snippet-folder-header.component';
import { PlaceholderOverlayComponent, extractPlaceholders } from './placeholder-overlay.component';
import { NewSnippetFormComponent } from './new-snippet-form.component';
import { SkeletonListComponent } from '../../shared/ui/skeleton-list/skeleton-list.component';
import { EmptyStateComponent } from '../../shared/ui/empty-state/empty-state.component';
import { SnippetsService } from '../../core/services/snippets.service';
import { TauriBridgeService } from '../../core/services/tauri-bridge.service';
import { Snippet } from '../../core/models/snippet.model';
import { SnippetFolder } from '../../core/models/snippet-folder.model';
import { resolveEditModeAction } from './keyboard.utils';

@Component({
  selector: 'app-snippets-tab',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CdkDropList,
    CdkDrag,
    CdkDragHandle,
    CdkDragPlaceholder,
    SnippetItemComponent,
    SnippetFolderHeaderComponent,
    PlaceholderOverlayComponent,
    NewSnippetFormComponent,
    SkeletonListComponent,
    EmptyStateComponent,
    NgIcon,
    HlmIcon,
    HlmButton,
    TranslatePipe,
  ],
  providers: [provideIcons({ lucideGripVertical })],
  host: {
    '(keydown)': 'onKeyDown($event)',
    tabindex: '-1',
    class: 'relative flex-1 overflow-y-auto scrollbar-thin outline-none',
  },
  template: `
    <!-- Placeholder fill-in overlay -->
    @if (showPlaceholderOverlay() && placeholderSnippet()) {
      <app-placeholder-overlay
        [content]="placeholderSnippet()!.content"
        (confirmed)="onPlaceholderConfirmed($event)"
        (cancelled)="onPlaceholderCancelled()"
      />
    }

    @if (snippetsService.snippets.isLoading()) {
      <app-skeleton-list />
    } @else if (snippetsService.snippets.error()) {
      <app-empty-state
        icon="lucideAlertCircle"
        [title]="'CLIPBOARD.ERROR_LOAD' | translate"
        variant="destructive"
      >
        <button hlmBtn variant="link" size="sm" (click)="snippetsService.snippets.reload()">
          {{ 'CLIPBOARD.TRY_AGAIN' | translate }}
        </button>
      </app-empty-state>
    } @else if (allSnippets().length === 0 && !showNewSnippetForm()) {
      <app-empty-state
        icon="lucideClipboard"
        [title]="'SNIPPETS.EMPTY' | translate"
        [hint]="'SNIPPETS.EMPTY_HINT' | translate"
      />
    } @else {
      <div class="py-1">
        <!-- General folder section -->
        <div class="folder-section relative group/folder border-b border-border/20">
          <div
            class="relative"
            cdkDropList
            id="folder-header-general"
            [cdkDropListConnectedTo]="snippetBodyIds()"
            [cdkDropListSortingDisabled]="true"
            (cdkDropListDropped)="onSnippetDroppedOnFolderHeader($event, null)"
          >
            <div class="flex items-center">
              <span aria-hidden="true" class="shrink-0 pl-1 opacity-0 pointer-events-none">
                <ng-icon hlm size="xs" name="lucideGripVertical" />
              </span>
              <app-snippet-folder-header
                class="flex-1 min-w-0"
                [folder]="generalFolder"
                [isGeneral]="true"
                [isExpanded]="isFolderExpanded('general')"
                [count]="generalSnippets().length"
                (toggleCollapse)="toggleFolder('general')"
              />
            </div>
          </div>
          @if (isFolderExpanded('general')) {
            <div
              cdkDropList
              id="folder-body-general"
              class="pl-3"
              [cdkDropListConnectedTo]="allSnippetTargetIds()"
              [cdkDropListData]="null"
              (cdkDropListDropped)="onSnippetDrop($any($event))"
            >
              @if (showNewSnippetForm()) {
                <app-new-snippet-form
                  (saved)="onSnippetCreated($event)"
                  (cancelled)="onSnippetFormCancelled()"
                />
              }
              @for (snippet of generalSnippets(); track snippet.id) {
                <div
                  class="snippet-item"
                  cdkDrag
                  [cdkDragData]="snippet"
                  [cdkDragDisabled]="editingSnippetId() !== null || showNewSnippetForm()"
                >
                  <app-snippet-item
                    [snippet]="snippet"
                    [selected]="snippetSelectedIndex() === allSnippets().indexOf(snippet)"
                    [editMode]="editingSnippetId() === snippet.id"
                    (select)="selectSnippet(allSnippets().indexOf(snippet))"
                    (delete)="deleteSnippetByIndex(allSnippets().indexOf(snippet))"
                    (editConfirm)="onSnippetEditConfirm($event)"
                    (editCancel)="onSnippetEditCancel()"
                  />
                </div>
              }
            </div>
          }
        </div>

        <!-- User folder sections (reorderable) -->
        <div cdkDropList id="folder-reorder" (cdkDropListDropped)="onFolderDrop($event)">
          @for (folder of userFolders(); track folder.id) {
            <div
              cdkDrag
              [cdkDragData]="folder"
              class="folder-section group/folder border-b border-border/20"
            >
              <div
                *cdkDragPlaceholder
                class="h-7 mx-2 my-0.5 rounded border border-dashed border-border/50 bg-muted/20"
              ></div>
              <div
                class="relative flex items-center"
                cdkDropList
                [id]="'folder-header-' + folder.id"
                [cdkDropListConnectedTo]="snippetBodyIds()"
                [cdkDropListSortingDisabled]="true"
                (cdkDropListDropped)="onSnippetDroppedOnFolderHeader($event, folder.id)"
              >
                <span
                  cdkDragHandle
                  class="opacity-0 group-hover/folder:opacity-100 cursor-grab active:cursor-grabbing shrink-0 text-muted-foreground transition-opacity pl-1"
                >
                  <ng-icon hlm size="xs" name="lucideGripVertical" />
                </span>
                <app-snippet-folder-header
                  class="flex-1 min-w-0"
                  [folder]="folder"
                  [isGeneral]="false"
                  [isExpanded]="isFolderExpanded(folder.id)"
                  [count]="getSnippetsByFolder(folder.id).length"
                  (toggleCollapse)="toggleFolder(folder.id)"
                  (rename)="onFolderRename(folder.id, $event)"
                  (delete)="onFolderDelete(folder.id)"
                />
              </div>
              @if (isFolderExpanded(folder.id)) {
                <div
                  cdkDropList
                  [id]="'folder-body-' + folder.id"
                  class="pl-3"
                  [cdkDropListConnectedTo]="allSnippetTargetIds()"
                  [cdkDropListData]="folder.id"
                  (cdkDropListDropped)="onSnippetDrop($any($event))"
                >
                  @for (snippet of getSnippetsByFolder(folder.id); track snippet.id) {
                    <div
                      class="snippet-item"
                      cdkDrag
                      [cdkDragData]="snippet"
                      [cdkDragDisabled]="editingSnippetId() !== null || showNewSnippetForm()"
                    >
                      <app-snippet-item
                        [snippet]="snippet"
                        [selected]="snippetSelectedIndex() === allSnippets().indexOf(snippet)"
                        [editMode]="editingSnippetId() === snippet.id"
                        (select)="selectSnippet(allSnippets().indexOf(snippet))"
                        (delete)="deleteSnippetByIndex(allSnippets().indexOf(snippet))"
                        (editConfirm)="onSnippetEditConfirm($event)"
                        (editCancel)="onSnippetEditCancel()"
                      />
                    </div>
                  }
                </div>
              }
            </div>
          }
        </div>

        <!-- Add folder button / inline new folder input -->
        @if (addingFolder()) {
          <div class="flex items-center gap-1.5 px-3 py-1">
            <input
              #newFolderInput
              type="text"
              [value]="newFolderName()"
              (input)="newFolderName.set($any($event.target).value)"
              (keydown)="onNewFolderKeyDown($event)"
              (blur)="saveNewFolder()"
              [placeholder]="'SNIPPETS.FOLDER_NAME_PLACEHOLDER' | translate"
              class="flex-1 min-w-0 bg-muted/50 text-[12px] text-foreground rounded px-2 py-1 outline-none focus:ring-1 focus:ring-brand/50"
            />
          </div>
        } @else {
          <button
            class="w-full text-left px-3 py-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
            (click)="startAddFolder()"
          >
            {{ 'SNIPPETS.FOLDER_ADD' | translate }}
          </button>
        }
      </div>
    }
  `,
})
export class SnippetsTabComponent implements OnInit, OnDestroy {
  protected snippetsService = inject(SnippetsService);
  private bridge = inject(TauriBridgeService);
  private hostEl = inject(ElementRef);
  private injector = inject(Injector);
  private unlistenPopupShown?: UnlistenFn;

  protected snippetSelectedIndex = signal(0);
  protected editingSnippetId = signal<number | null>(null);
  protected showNewSnippetForm = signal(false);
  protected showPlaceholderOverlay = signal(false);
  protected placeholderSnippet = signal<Snippet | null>(null);
  protected expandedFolderIds = signal<Set<string>>(new Set(['general']));
  protected addingFolder = signal(false);
  protected newFolderName = signal('');

  protected readonly generalFolder: SnippetFolder = { id: -1, name: '', sortOrder: -1 };

  private newFolderInputRef = viewChild<ElementRef>('newFolderInput');

  protected allSnippets = computed(() => {
    const snippets = this.snippetsService.snippets.value() ?? [];
    const folders = this.snippetsService.folders.value() ?? [];
    const general = snippets
      .filter((s) => s.folderId === null)
      .sort((a, b) => a.sortOrder - b.sortOrder);
    const folderSnippets = folders
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .flatMap((f) =>
        snippets.filter((s) => s.folderId === f.id).sort((a, b) => a.sortOrder - b.sortOrder),
      );
    return [...general, ...folderSnippets];
  });

  protected userFolders = computed(() =>
    (this.snippetsService.folders.value() ?? [])
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder),
  );

  protected generalSnippets = computed(() =>
    (this.snippetsService.snippets.value() ?? [])
      .filter((s) => s.folderId === null)
      .sort((a, b) => a.sortOrder - b.sortOrder),
  );

  protected snippetBodyIds = computed(() => [
    'folder-body-general',
    ...this.userFolders().map((f) => 'folder-body-' + f.id),
  ]);

  protected allSnippetTargetIds = computed(() => [
    ...this.snippetBodyIds(),
    'folder-header-general',
    ...this.userFolders().map((f) => 'folder-header-' + f.id),
  ]);

  protected getSnippetsByFolder(folderId: number): Snippet[] {
    return (this.snippetsService.snippets.value() ?? [])
      .filter((s) => s.folderId === folderId)
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }

  protected isFolderExpanded(key: string | number): boolean {
    return this.expandedFolderIds().has(String(key));
  }

  protected toggleFolder(key: string | number): void {
    const id = String(key);
    const set = new Set(this.expandedFolderIds());
    if (set.has(id)) set.delete(id);
    else set.add(id);
    this.expandedFolderIds.set(set);
  }

  ngOnInit(): void {
    this.snippetsService.folders.reload();
    this.bridge.onPopupShown(() => this.resetState()).then((fn) => {
      this.unlistenPopupShown = fn;
    });
  }

  ngOnDestroy(): void {
    this.unlistenPopupShown?.();
  }

  private resetState(): void {
    this.editingSnippetId.set(null);
    this.showNewSnippetForm.set(false);
    this.showPlaceholderOverlay.set(false);
    this.placeholderSnippet.set(null);
    this.snippetSelectedIndex.set(0);
    this.addingFolder.set(false);
    this.newFolderName.set('');
    this.expandedFolderIds.set(new Set(['general']));
    this.snippetsService.folders.reload();
    this.hostEl.nativeElement.focus();
  }

  protected selectSnippet(index: number): void {
    this.snippetSelectedIndex.set(index);
  }

  protected deleteSnippetByIndex(index: number): void {
    const snippet = this.allSnippets()[index];
    if (!snippet) return;
    const newLen = this.allSnippets().length - 1;
    this.snippetsService.deleteSnippet(snippet.id);
    if (newLen <= 0) {
      this.snippetSelectedIndex.set(0);
    } else if (this.snippetSelectedIndex() >= newLen) {
      this.snippetSelectedIndex.set(newLen - 1);
    }
  }

  protected async onSnippetCreated(data: { title: string; content: string }): Promise<void> {
    this.showNewSnippetForm.set(false);
    const newIndex = this.allSnippets().length;
    await this.snippetsService.createSnippet(data.title, data.content);
    this.snippetSelectedIndex.set(newIndex);
  }

  protected onSnippetFormCancelled(): void {
    this.showNewSnippetForm.set(false);
    this.hostEl.nativeElement.focus();
  }

  protected async onSnippetEditConfirm(data: { title: string; content: string }): Promise<void> {
    const id = this.editingSnippetId();
    if (id === null) return;
    this.editingSnippetId.set(null);
    await this.snippetsService.updateSnippet(id, data.title, data.content);
  }

  protected onSnippetEditCancel(): void {
    this.editingSnippetId.set(null);
    this.hostEl.nativeElement.focus();
  }

  protected onSnippetDrop(event: CdkDragDrop<number | null>): void {
    if (
      event.previousIndex === event.currentIndex &&
      event.container.id === event.previousContainer.id
    )
      return;
    const snippet = event.item.data as Snippet;
    const targetFolderId = event.container.data as number | null;
    const sourceFolderId = event.previousContainer.data as number | null;
    const all = this.snippetsService.snippets.value() ?? [];

    if (sourceFolderId === targetFolderId) {
      const folderItems =
        sourceFolderId === null
          ? all.filter((s) => s.folderId === null).sort((a, b) => a.sortOrder - b.sortOrder)
          : all
              .filter((s) => s.folderId === sourceFolderId)
              .sort((a, b) => a.sortOrder - b.sortOrder);
      const reordered = [...folderItems];
      moveItemInArray(reordered, event.previousIndex, event.currentIndex);
      const updated = all.map((s) => {
        const idx = reordered.findIndex((r) => r.id === s.id);
        return idx !== -1 ? { ...s, sortOrder: idx } : s;
      });
      this.snippetSelectedIndex.set(this.allSnippets().findIndex((s) => s.id === snippet.id));
      this.snippetsService.reorderSnippet(updated, snippet.id, event.currentIndex);
    } else {
      const updated = all
        .filter((s) => s.id !== snippet.id)
        .concat([{ ...snippet, folderId: targetFolderId }]);
      this.snippetsService.moveAndReorderSnippet(
        updated,
        snippet.id,
        targetFolderId,
        event.currentIndex,
      );
    }
  }

  protected onSnippetDroppedOnFolderHeader(
    event: CdkDragDrop<number | null>,
    targetFolderId: number | null,
  ): void {
    const snippet = event.item.data as Snippet;
    if (snippet.folderId === targetFolderId) return;
    const all = this.snippetsService.snippets.value() ?? [];
    const updated = all.map((s) =>
      s.id === snippet.id ? { ...s, folderId: targetFolderId } : s,
    );
    this.snippetsService.moveSnippetToFolder(updated, snippet.id, targetFolderId);
  }

  protected onFolderDrop(event: CdkDragDrop<SnippetFolder[]>): void {
    if (event.previousIndex === event.currentIndex) return;
    const folder = event.item.data as SnippetFolder;
    const folders = [...this.userFolders()];
    moveItemInArray(folders, event.previousIndex, event.currentIndex);
    this.snippetsService.reorderFolder(folders, folder.id, event.currentIndex);
  }

  protected onFolderRename(id: number, name: string): void {
    this.snippetsService.renameFolder(id, name);
  }

  protected onFolderDelete(id: number): void {
    this.snippetsService.deleteFolder(id);
  }

  protected startAddFolder(): void {
    this.newFolderName.set('');
    this.addingFolder.set(true);
    afterNextRender(() => this.newFolderInputRef()?.nativeElement?.focus(), {
      injector: this.injector,
    });
  }

  protected saveNewFolder(): void {
    const name = this.newFolderName().trim();
    this.addingFolder.set(false);
    if (name) {
      this.snippetsService.createFolder(name).then(() => {
        const folders = this.snippetsService.folders.value() ?? [];
        if (folders.length > 0) this.toggleFolder(folders[folders.length - 1].id);
      });
    }
  }

  protected onNewFolderKeyDown(event: KeyboardEvent): void {
    event.stopPropagation();
    if (event.key === 'Enter') {
      event.preventDefault();
      (event.target as HTMLInputElement).blur();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      this.addingFolder.set(false);
    }
  }

  protected async onPlaceholderConfirmed(text: string): Promise<void> {
    this.showPlaceholderOverlay.set(false);
    this.placeholderSnippet.set(null);
    await this.bridge.setClipboardText(text);
    this.bridge.hidePopup();
  }

  protected onPlaceholderCancelled(): void {
    this.showPlaceholderOverlay.set(false);
    this.placeholderSnippet.set(null);
    this.hostEl.nativeElement.focus();
  }

  protected onKeyDown(event: KeyboardEvent): void {
    if (event.ctrlKey && event.key === 'Tab') return; // bubble to shell

    if (this.showNewSnippetForm()) return;
    if (this.showPlaceholderOverlay()) return;

    if (this.editingSnippetId() !== null) {
      if (resolveEditModeAction(event.key) === 'cancel-navigate') {
        this.editingSnippetId.set(null);
      } else {
        event.stopPropagation();
        return;
      }
    }

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        event.stopPropagation();
        this.moveSnippetSelection(1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        event.stopPropagation();
        this.moveSnippetSelection(-1);
        break;
      case 'Enter':
        event.preventDefault();
        event.stopPropagation();
        this.pasteOrOverlaySnippet();
        break;
      case 'Delete':
        event.preventDefault();
        event.stopPropagation();
        this.deleteSnippetByIndex(this.snippetSelectedIndex());
        break;
      case 'Escape':
        event.preventDefault();
        event.stopPropagation();
        this.bridge.hidePopup();
        break;
      default:
        if (event.key.length === 1 && !event.ctrlKey && !event.altKey && !event.metaKey) {
          if (event.key.toLowerCase() === 'e') {
            event.preventDefault();
            event.stopPropagation();
            this.enterSnippetEditMode();
          } else if (event.key.toLowerCase() === 'n') {
            event.preventDefault();
            event.stopPropagation();
            this.showNewSnippetForm.set(true);
          }
        }
    }
  }

  private moveSnippetSelection(delta: number): void {
    const len = this.allSnippets().length;
    if (len === 0) return;
    const next = Math.max(0, Math.min(len - 1, this.snippetSelectedIndex() + delta));
    this.snippetSelectedIndex.set(next);
    this.scrollSnippetSelectedIntoView();
  }

  private pasteOrOverlaySnippet(): void {
    const snippet = this.allSnippets()[this.snippetSelectedIndex()];
    if (!snippet) return;
    if (extractPlaceholders(snippet.content).length > 0) {
      this.placeholderSnippet.set(snippet);
      this.showPlaceholderOverlay.set(true);
    } else {
      this.bridge.setClipboardText(snippet.content).then(() => this.bridge.hidePopup());
    }
  }

  private enterSnippetEditMode(): void {
    const snippet = this.allSnippets()[this.snippetSelectedIndex()];
    if (!snippet) return;
    this.editingSnippetId.set(snippet.id);
  }

  private scrollSnippetSelectedIntoView(): void {
    const items = this.hostEl.nativeElement.querySelectorAll<HTMLElement>('.snippet-item');
    items[this.snippetSelectedIndex()]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
}
```

- [ ] **Step 2: Format and commit**

```bash
pnpm prettier --write src/app/features/clipboard-list/snippets-tab.component.ts
git add src/app/features/clipboard-list/snippets-tab.component.ts
git commit -m "feat: add SnippetsTabComponent"
```

---

## Task 8: Slim down ClipboardListComponent shell

**Files:**
- Modify: `src/app/features/clipboard-list/clipboard-list.component.ts`

Replace the entire file content with the slimmed shell:

- [ ] **Step 1: Replace clipboard-list.component.ts**

```typescript
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { UnlistenFn } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideClipboard, lucideSettings } from '@ng-icons/lucide';
import { TranslatePipe } from '@ngx-translate/core';
import { HlmIcon } from '@spartan-ng/helm/icon';
import { HlmBadge } from '@spartan-ng/helm/badge';
import { HlmTabs, HlmTabsList, HlmTabsTrigger } from '@spartan-ng/helm/tabs';
import { HlmSwitchImports } from '@spartan-ng/helm/switch';
import { ClipboardTabComponent, ClipboardTabType } from './clipboard-tab.component';
import { SnippetsTabComponent } from './snippets-tab.component';
import { ClipboardFooterHintsComponent } from './clipboard-footer-hints.component';
import { SnippetsFooterHintsComponent } from './snippets-footer-hints.component';
import { PageHeaderComponent } from '../../shared/ui/page-header/page-header.component';
import { ClipboardService } from '../../core/services/clipboard.service';
import { TauriBridgeService } from '../../core/services/tauri-bridge.service';
import { SettingsService } from '../../core/services/settings.service';
import { ClipboardEntry } from '../../core/models/clipboard-entry.model';

type TabType = 'snippets' | ClipboardTabType;

@Component({
  selector: 'app-clipboard-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ClipboardTabComponent,
    SnippetsTabComponent,
    ClipboardFooterHintsComponent,
    SnippetsFooterHintsComponent,
    RouterLink,
    NgIcon,
    HlmIcon,
    HlmBadge,
    HlmTabs,
    HlmTabsList,
    HlmTabsTrigger,
    TranslatePipe,
    PageHeaderComponent,
    ...HlmSwitchImports,
  ],
  providers: [provideIcons({ lucideClipboard, lucideSettings })],
  host: {
    '(keydown)': 'onKeyDown($event)',
    tabindex: '0',
    class: 'block outline-none h-full',
  },
  template: `
    <div
      class="flex flex-col h-full bg-background rounded-xl overflow-hidden border border-border shadow-2xl"
    >
      <!-- Header -->
      <app-page-header>
        <ng-container start>
          <ng-icon hlm size="sm" name="lucideClipboard" class="text-muted-foreground shrink-0" />
          <span class="text-[13px] font-semibold text-foreground tracking-tight">{{
            'CLIPBOARD.TITLE' | translate
          }}</span>
          @if (activeTab() !== 'snippets' && entryCount() > 0) {
            <span hlmBadge variant="secondary">{{ entryCount() }}</span>
          }
        </ng-container>
        <ng-container end>
          <span class="text-[11px] text-muted-foreground select-none">{{
            'CLIPBOARD.CAPTURE_LABEL' | translate
          }}</span>
          <hlm-switch
            [checked]="!captureIsPaused()"
            (checkedChange)="onCaptureSwitchChange($event)"
          />
          <a
            routerLink="/settings"
            class="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <ng-icon hlm size="sm" name="lucideSettings" />
          </a>
        </ng-container>
      </app-page-header>

      <!-- Tab switcher row -->
      <div
        class="flex items-center px-3.5 h-[34px] shrink-0 bg-card/50 border-b border-border"
      >
        <div hlmTabs [tab]="activeTab()" (tabActivated)="setTab($event)">
          <div hlmTabsList variant="line" class="h-8 rounded-none bg-transparent p-0">
            @for (tab of tabs; track tab.value) {
              <button [hlmTabsTrigger]="tab.value" class="text-[12px] gap-1.5 px-1">
                {{ tab.labelKey | translate }}
                @if (tab.value === 'pinned' && pinnedCount() > 0) {
                  <span hlmBadge variant="secondary" class="text-[10px] h-4 min-w-0 px-1">{{
                    pinnedCount()
                  }}</span>
                }
              </button>
            }
          </div>
        </div>
      </div>

      <!-- Active tab -->
      @if (activeTab() === 'snippets') {
        <app-snippets-tab #activeTabEl class="flex-1 min-h-0" />
      } @else {
        <app-clipboard-tab
          #activeTabEl
          [tab]="activeTab()"
          class="flex-1 min-h-0"
          (selectedEntry)="onSelectedEntry($event)"
        />
      }

      <!-- Footer -->
      <div class="px-3.5 py-1.5 flex flex-col gap-1 shrink-0 bg-card border-t border-border">
        @if (activeTab() === 'snippets') {
          <app-snippets-footer-hints />
        } @else {
          <app-clipboard-footer-hints [showOcrHint]="showOcrHint()" />
        }
      </div>
    </div>
  `,
})
export class ClipboardListComponent implements OnInit, OnDestroy {
  private clipboard = inject(ClipboardService);
  private bridge = inject(TauriBridgeService);
  private settings = inject(SettingsService);
  private hostEl = inject(ElementRef);
  private unlistenPopupShown?: UnlistenFn;
  private unlistenWindowMoved?: UnlistenFn;
  private unlistenCapturePaused?: UnlistenFn;
  private moveDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private suppressPositionSave = false;

  protected activeTab = signal<TabType>('recent');
  protected captureIsPaused = signal(false);

  private selectedEntrySignal = signal<ClipboardEntry | null>(null);
  protected showOcrHint = computed(() => this.selectedEntrySignal()?.kind === 'image');

  private allEntries = computed(() => this.clipboard.entries.value() ?? []);
  protected entryCount = computed(() => this.allEntries().length);
  protected pinnedCount = computed(() => this.allEntries().filter((e) => e.pinned).length);

  private activeTabRef = viewChild<ElementRef>('activeTabEl', { read: ElementRef });

  protected readonly tabs = [
    { labelKey: 'CLIPBOARD.TAB_RECENT', value: 'recent' as TabType },
    { labelKey: 'CLIPBOARD.TAB_PINNED', value: 'pinned' as TabType },
    { labelKey: 'SNIPPETS.TAB', value: 'snippets' as TabType },
  ];

  ngOnInit(): void {
    this.bridge
      .onPopupShown(() => {
        this.activeTab.set('recent');
        this.selectedEntrySignal.set(null);
        this.bridge.getCapturePaused().then((paused) => this.captureIsPaused.set(paused));
        this.suppressPositionSave = true;
        setTimeout(() => (this.suppressPositionSave = false), 600);
        setTimeout(() => this.focusActiveTab());
      })
      .then((fn) => (this.unlistenPopupShown = fn));

    this.bridge
      .onCapturePausedChanged((paused) => this.captureIsPaused.set(paused))
      .then((fn) => (this.unlistenCapturePaused = fn));

    getCurrentWindow()
      .onMoved(({ payload }) => {
        if (this.suppressPositionSave) return;
        if (this.moveDebounceTimer) clearTimeout(this.moveDebounceTimer);
        this.moveDebounceTimer = setTimeout(() => {
          if (this.settings.settings.value()?.windowPosition === 'last') {
            this.bridge.saveWindowPosition(payload.x, payload.y);
          }
        }, 300);
      })
      .then((fn) => (this.unlistenWindowMoved = fn));

    this.bridge.getCapturePaused().then((paused) => this.captureIsPaused.set(paused));
    this.focusActiveTab();
  }

  ngOnDestroy(): void {
    this.unlistenPopupShown?.();
    this.unlistenWindowMoved?.();
    this.unlistenCapturePaused?.();
    if (this.moveDebounceTimer) clearTimeout(this.moveDebounceTimer);
  }

  protected setTab(tab: string): void {
    this.activeTab.set(tab as TabType);
    this.selectedEntrySignal.set(null);
    setTimeout(() => this.focusActiveTab());
  }

  protected onSelectedEntry(entry: ClipboardEntry | null): void {
    this.selectedEntrySignal.set(entry);
  }

  protected onKeyDown(event: KeyboardEvent): void {
    if (event.ctrlKey && event.key === 'Tab') {
      event.preventDefault();
      event.stopPropagation();
      this.cycleTab(event.shiftKey ? -1 : 1);
    }
  }

  protected async onCaptureSwitchChange(checked: boolean): Promise<void> {
    this.captureIsPaused.set(!checked);
    try {
      await this.bridge.toggleCapturePaused();
    } catch {
      this.captureIsPaused.set(!this.captureIsPaused());
    }
  }

  private cycleTab(direction: 1 | -1): void {
    const allTabs: TabType[] = ['recent', 'pinned', 'snippets'];
    const idx = allTabs.indexOf(this.activeTab());
    this.setTab(allTabs[(idx + direction + allTabs.length) % allTabs.length]);
  }

  private focusActiveTab(): void {
    this.activeTabRef()?.nativeElement.focus();
  }
}
```

- [ ] **Step 2: Run all tests**

```bash
pnpm test
```

Expected: all existing tests pass (only pure-function tests exist — no TestBed)

- [ ] **Step 3: Format and commit**

```bash
pnpm prettier --write src/app/features/clipboard-list/clipboard-list.component.ts
git add src/app/features/clipboard-list/clipboard-list.component.ts
git commit -m "refactor: slim clipboard-list shell, wire tab components"
```

---

## Task 9: Clean up old spec and moved utilities

**Files:**
- Delete: `src/app/features/clipboard-list/clipboard-list.component.spec.ts`
- Modify: `src/app/features/clipboard-list/clipboard-list.component.ts` (remove now-unused exported functions)

- [ ] **Step 1: Delete the old spec**

```bash
rm src/app/features/clipboard-list/clipboard-list.component.spec.ts
```

- [ ] **Step 2: Remove the three remaining exported functions from clipboard-list.component.ts**

In `src/app/features/clipboard-list/clipboard-list.component.ts`, confirm that `shouldCancelEditOnSelect`, `getQuickPasteDigit`, and `isOcrTrigger` no longer appear (they were not included in the new shell file from Task 8). If any remain from an earlier step, delete them now.

- [ ] **Step 3: Run all tests — confirm nothing broken**

```bash
pnpm test
```

Expected: all tests pass

- [ ] **Step 4: Format and commit**

```bash
git add -A src/app/features/clipboard-list/
git commit -m "chore: remove old clipboard-list spec, cleanup moved utilities"
```

---

## Self-Review Checklist

- [x] **spec → keyboard.utils.ts** `resolveEditModeAction` covered in Task 3
- [x] **spec → clipboard-tab.component.ts** `getQuickPasteDigit`, `isOcrTrigger`, `shouldCancelEditOnSelect` covered in Task 6
- [x] **`ClipboardTabType` export** defined and exported in Task 6; used as `'snippets' | ClipboardTabType` in shell (Task 8)
- [x] **`selectedEntry` output** implemented in Task 6; shell stores it via `onSelectedEntry()` and derives `showOcrHint` (Task 8)
- [x] **Toasts via sonner** `toast.error()` / `toast.success()` used in Task 6; `TranslateService` injection called out
- [x] **`HlmToasterImports`** covered in Task 1
- [x] **`SkeletonListComponent`** created in Task 2; used in both tab components (Tasks 6 and 7)
- [x] **`ClipboardFooterHintsComponent`** Task 4; used in shell Task 8
- [x] **`SnippetsFooterHintsComponent`** Task 5; used in shell Task 8
- [x] **`keyboard.utils.ts`** Task 3; imported in both tab components
- [x] **`duplicateError` dead code** not included in any new file — confirmed removed
- [x] **Filter row visual change** filter row now lives inside `ClipboardTabComponent` (Task 6) — accepted change per spec
- [x] **Tab keyboard isolation** each tab calls `stopPropagation()` for its keys; Ctrl+Tab bubbles to shell
- [x] **`suppressPositionSave` / window-move** stays in shell (Task 8)
- [x] **`snippetsService.folders.reload()` on init** called in `SnippetsTabComponent.ngOnInit()` (Task 7)
- [x] **Old spec deleted** Task 9
