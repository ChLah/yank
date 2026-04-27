# Inline Edit Before Paste — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow users to press `E` on a selected text entry, edit the content in an inline textarea, and paste the edited version with `Enter` — without modifying the original history entry.

**Architecture:** Edit mode is owned by `ClipboardEntryComponent` (renders the textarea, emits confirm/cancel), coordinated by `ClipboardListComponent` via an `editingEntryId` signal that enforces single-entry-at-a-time invariant. The Tauri `set_clipboard_text` command (already implemented) is used to paste the edited content.

**Tech Stack:** Angular 19 signals, `viewChild` signal API, `afterNextRender`, `effect`, `@if` control flow, `TauriBridgeService.setClipboardText()`.

---

## File Map

| Action  | Path |
|---------|------|
| Modify  | `src/app/i18n/translation.interface.ts` — add `HINT_EDIT`, `EDIT_HINT` to `CLIPBOARD` |
| Modify  | `src/app/i18n/en.ts` — add English strings |
| Modify  | `src/app/i18n/de.ts` — add German strings |
| Modify  | `src/app/features/clipboard-list/clipboard-entry.component.ts` — add `editMode` input, `editConfirm`/`editCancel` outputs, textarea block, focus/select effect |
| Modify  | `src/app/features/clipboard-list/clipboard-list.component.ts` — add `editingEntryId` signal, `E` key handler, edit confirm/cancel handlers, footer hint, error handling, reset on popup shown |

---

## Task 1: Add i18n translation keys

**Files:**
- Modify: `src/app/i18n/translation.interface.ts`
- Modify: `src/app/i18n/en.ts`
- Modify: `src/app/i18n/de.ts`

- [ ] **Step 1: Add keys to the Translation interface**

In `src/app/i18n/translation.interface.ts`, extend the `CLIPBOARD` interface block (after `HINT_CLOSE: string;`):

```typescript
    HINT_EDIT: string;
    EDIT_HINT: string;
    EDIT_COPY_FAILED: string;
```

The full updated `CLIPBOARD` block in the interface:
```typescript
  CLIPBOARD: {
    TITLE: string;
    TAB_RECENT: string;
    TAB_PINNED: string;
    FILTER_ALL: string;
    FILTER_TEXT: string;
    FILTER_IMAGE: string;
    SEARCH_PLACEHOLDER: string;
    ERROR_LOAD: string;
    TRY_AGAIN: string;
    EMPTY_PINNED: string;
    EMPTY_PINNED_HINT: string;
    EMPTY_NO_MATCHES: string;
    EMPTY_NOTHING: string;
    HINT_NAV: string;
    HINT_PASTE: string;
    HINT_DELETE: string;
    HINT_PIN: string;
    HINT_SEARCH: string;
    HINT_CLOSE: string;
    HINT_EDIT: string;
    EDIT_HINT: string;
    EDIT_COPY_FAILED: string;
  };
```

- [ ] **Step 2: Add English strings to en.ts**

In `src/app/i18n/en.ts`, add after `HINT_CLOSE: 'close',`:
```typescript
    HINT_EDIT: 'edit',
    EDIT_HINT: 'Enter to paste · Esc to cancel',
    EDIT_COPY_FAILED: 'Failed to copy to clipboard.',
```

- [ ] **Step 3: Add German strings to de.ts**

In `src/app/i18n/de.ts`, add after `HINT_CLOSE: 'schließen',`:
```typescript
    HINT_EDIT: 'bearbeiten',
    EDIT_HINT: 'Enter zum Einfügen · Esc zum Abbrechen',
    EDIT_COPY_FAILED: 'Kopieren fehlgeschlagen.',
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `pnpm tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add src/app/i18n/translation.interface.ts src/app/i18n/en.ts src/app/i18n/de.ts
git commit -m "feat(i18n): add inline-edit translation keys"
```

---

## Task 2: Add edit mode to ClipboardEntryComponent

**Files:**
- Modify: `src/app/features/clipboard-list/clipboard-entry.component.ts`

The entry component owns the textarea rendering and keyboard handling. The parent passes `editMode` as an input and listens for `editConfirm(text)` and `editCancel()` outputs.

- [ ] **Step 1: Update imports and add new API surface**

Replace the entire component file with the updated version below. Key changes:
- Add `Injector`, `afterNextRender`, `effect`, `viewChild`, `ElementRef` to the Angular imports
- Add `editMode = input(false)` input
- Add `editConfirm = output<string>()` and `editCancel = output<void>()` outputs
- Add `viewChild` ref for textarea
- Add constructor with `effect` + `afterNextRender` for auto-focus
- Add `onTextareaKeyDown` method
- Update template to add the `@if (editMode())` textarea block and hide timestamp/buttons in edit mode

Full updated file:

```typescript
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  input,
  output,
  viewChild,
} from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideBookmark, lucideImage, lucideX } from '@ng-icons/lucide';
import { TranslatePipe } from '@ngx-translate/core';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmIcon } from '@spartan-ng/helm/icon';
import { ClipboardEntry } from '../../core/models/clipboard-entry.model';

interface TimeTranslation {
  key: string;
  params: Record<string, number>;
}

@Component({
  selector: 'app-clipboard-entry',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgIcon, HlmIcon, HlmButton, TranslatePipe],
  providers: [provideIcons({ lucideImage, lucideBookmark, lucideX })],
  template: `
    <div
      class="flex items-center gap-2 pl-3.5 pr-3 cursor-pointer group transition-colors border-l-2"
      [class]="selected() ? 'border-l-indigo-500 bg-card' : 'border-l-transparent hover:bg-card/60'"
      (click)="select.emit()"
    >
      @if (editMode()) {
        <div class="flex-1 min-w-0 py-2" (click)="$event.stopPropagation()">
          <textarea
            #editTextarea
            class="w-full bg-muted/50 text-[13px] text-foreground rounded-md px-2 py-1.5 resize-none outline-none focus:ring-1 focus:ring-indigo-500/50 min-h-[60px]"
            rows="3"
            [value]="entry().content ?? ''"
            (keydown)="onTextareaKeyDown($event)"
          ></textarea>
          <p class="text-[11px] text-muted-foreground mt-1">{{ 'CLIPBOARD.EDIT_HINT' | translate }}</p>
        </div>
      } @else {
        @if (entry().kind === 'image') {
          <div class="shrink-0 w-8 h-8 rounded-md overflow-hidden bg-muted flex items-center justify-center my-2">
            @if (entry().thumbnail) {
              <img [src]="entry().thumbnail!" alt="Clipboard image" class="w-full h-full object-cover" />
            } @else {
              <ng-icon hlm size="sm" name="lucideImage" class="text-muted-foreground" />
            }
          </div>
          <div class="flex-1 min-w-0 py-2">
            <p class="text-[13px] font-medium text-foreground leading-snug">{{ 'ENTRY.IMAGE' | translate }}</p>
            @if (imageDimensions()) {
              <p class="text-[11px] text-muted-foreground mt-0.5">{{ imageDimensions() }}</p>
            }
          </div>
        } @else {
          <div class="flex-1 min-w-0 py-2.5">
            <p class="text-[13px] text-foreground truncate leading-snug">{{ entry().content }}</p>
          </div>
        }

        <div class="flex items-center gap-1 shrink-0">
          <span class="text-[11px] text-muted-foreground tabular-nums">
            {{ relativeTimeTranslation().key | translate:relativeTimeTranslation().params }}
          </span>

          <!-- Pin button -->
          <button
            hlmBtn variant="ghost" size="icon"
            [class]="pinButtonClass()"
            [title]="'ENTRY.TOGGLE_PIN' | translate"
            (click)="$event.stopPropagation(); pin.emit()"
          >
            <ng-icon hlm size="sm" name="lucideBookmark" />
          </button>

          <!-- Delete button -->
          <button
            hlmBtn variant="ghost" size="icon"
            class="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-red-400 hover:bg-red-500/10"
            [class.opacity-100]="selected()"
            [title]="'ENTRY.DELETE' | translate"
            (click)="$event.stopPropagation(); delete.emit()"
          >
            <ng-icon hlm size="sm" name="lucideX" />
          </button>
        </div>
      }
    </div>
  `,
})
export class ClipboardEntryComponent {
  entry    = input.required<ClipboardEntry>();
  selected = input(false);
  editMode = input(false);

  select       = output<void>();
  delete       = output<void>();
  pin          = output<void>();
  editConfirm  = output<string>();
  editCancel   = output<void>();

  private textareaRef = viewChild<ElementRef<HTMLTextAreaElement>>('editTextarea');
  private injector    = inject(Injector);

  constructor() {
    effect(() => {
      if (this.editMode()) {
        afterNextRender(() => {
          const el = this.textareaRef()?.nativeElement;
          if (el) { el.focus(); el.select(); }
        }, { injector: this.injector });
      }
    });
  }

  protected onTextareaKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.editCancel.emit();
    } else if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      event.stopPropagation();
      const el = this.textareaRef()?.nativeElement;
      this.editConfirm.emit(el?.value ?? '');
    } else if (event.key === 'Tab') {
      event.preventDefault();
      event.stopPropagation();
      this.editCancel.emit();
    }
    // Shift+Enter: allow default (inserts newline in textarea)
  }

  relativeTimeTranslation = computed<TimeTranslation>(() =>
    buildRelativeTimeTranslation(this.entry().lastUsedAt)
  );

  imageDimensions = computed(() => {
    const e = this.entry();
    if (e.width && e.height) return `${e.width} × ${e.height}`;
    return null;
  });

  protected pinButtonClass = computed(() => {
    const alwaysVisible = this.selected() || this.entry().pinned;
    const visibility = alwaysVisible ? 'opacity-100' : 'opacity-0 group-hover:opacity-100';
    const color = this.entry().pinned
      ? 'text-indigo-400 hover:text-indigo-300'
      : 'text-muted-foreground hover:text-foreground';
    return `${visibility} transition-opacity ${color}`;
  });
}

function buildRelativeTimeTranslation(unixSeconds: number): TimeTranslation {
  const diffMs = Date.now() - unixSeconds * 1000;
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return { key: 'ENTRY.TIME_JUST_NOW', params: {} };
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return { key: 'ENTRY.TIME_MINUTES', params: { n: diffMin } };
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return { key: 'ENTRY.TIME_HOURS', params: { n: diffHr } };
  return { key: 'ENTRY.TIME_DAYS', params: { n: Math.floor(diffHr / 24) } };
}
```

Note: `inject(Injector)` requires adding `inject` to the Angular core imports.

- [ ] **Step 2: Verify TypeScript compiles**

Run: `pnpm tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/app/features/clipboard-list/clipboard-entry.component.ts
git commit -m "feat(clipboard-entry): add inline edit mode with textarea and keyboard handling"
```

---

## Task 3: Wire edit mode into ClipboardListComponent

**Files:**
- Modify: `src/app/features/clipboard-list/clipboard-list.component.ts`

This task adds the coordinator signal, keyboard handling for `E`, error/cancel/confirm handlers, and updates the template.

- [ ] **Step 1: Add `editingEntryId` signal and `editCopyFailed` error signal**

In the signals block (around line 219, after `protected selectedIndex = signal(0);`), add:

```typescript
protected editingEntryId   = signal<number | null>(null);
protected editCopyFailed   = signal(false);
private editCopyFailedTimer: ReturnType<typeof setTimeout> | null = null;
```

- [ ] **Step 2: Reset `editingEntryId` when popup is shown**

In `ngOnInit()`, inside the `onPopupShown` callback (around line 259), add a reset before `this.activeTab.set('recent')`:

```typescript
this.bridge.onPopupShown(() => {
  this.editingEntryId.set(null);          // ← add this line
  this.activeTab.set('recent');
  // ... rest unchanged
```

- [ ] **Step 3: Clear the editCopyFailed timer in ngOnDestroy**

After `if (this.duplicateErrorTimer) clearTimeout(this.duplicateErrorTimer);` in `ngOnDestroy()`, add:

```typescript
if (this.editCopyFailedTimer) clearTimeout(this.editCopyFailedTimer);
```

- [ ] **Step 4: Update `selectEntry()` to cancel edit on click**

Replace the existing `selectEntry` method:

```typescript
protected selectEntry(index: number): void {
  if (this.editingEntryId() !== null) {
    this.editingEntryId.set(null);
    this.selectedIndex.set(index);
    return;
  }
  this.selectedIndex.set(index);
  const entry = this.filteredEntries()[index];
  if (!entry) return;
  if (entry.kind === 'image') {
    this.router.navigate(['/preview'], { queryParams: { id: entry.id } });
  } else {
    this.clipboard.setClipboard(entry.id);
  }
}
```

- [ ] **Step 5: Add `enterEditMode()`, `onEditConfirm()`, and `onEditCancel()` methods**

Add these three methods before `ngOnDestroy` (or at the end of the class, before the closing `}`):

```typescript
private enterEditMode(): void {
  const entry = this.filteredEntries()[this.selectedIndex()];
  if (!entry || entry.kind !== 'text') return;
  this.editingEntryId.set(entry.id);
}

protected async onEditConfirm(text: string): Promise<void> {
  this.editingEntryId.set(null);
  try {
    await this.bridge.setClipboardText(text);
    this.bridge.hidePopup();
  } catch {
    this.editCopyFailed.set(true);
    this.editCopyFailedTimer = setTimeout(() => {
      this.editCopyFailed.set(false);
    }, 2000);
  }
}

protected onEditCancel(): void {
  this.editingEntryId.set(null);
  this.hostEl.nativeElement.focus();
}
```

- [ ] **Step 6: Update `onKeyDown()` to handle edit mode and `E` key**

Replace the `onKeyDown` method in full:

```typescript
protected onKeyDown(event: KeyboardEvent): void {
  if (this.showTransformPicker()) return;

  // While in edit mode, only allow arrow keys (to cancel+navigate); all others blocked
  if (this.editingEntryId() !== null) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      this.editingEntryId.set(null); // cancel edit, then fall through to navigation
    } else {
      return;
    }
  }

  if (this.isSearching()) {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.moveSelection(1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.moveSelection(-1);
        break;
      case 'Enter':
        event.preventDefault();
        if (event.shiftKey) {
          this.openTransformPicker();
        } else {
          this.copySelected();
        }
        break;
      case 'Escape':
        event.preventDefault();
        this.clearSearch();
        break;
    }
    return;
  }

  switch (event.key) {
    case 'ArrowDown':
      event.preventDefault();
      this.moveSelection(1);
      break;
    case 'ArrowUp':
      event.preventDefault();
      this.moveSelection(-1);
      break;
    case 'Enter':
      event.preventDefault();
      if (event.shiftKey) {
        this.openTransformPicker();
      } else {
        this.copySelected();
      }
      break;
    case 'Delete':
      event.preventDefault();
      this.deleteEntry(this.selectedIndex());
      break;
    case 'Escape':
      event.preventDefault();
      this.bridge.hidePopup();
      break;
    default:
      if (event.key.length === 1 && !event.ctrlKey && !event.altKey && !event.metaKey) {
        if (event.key.toLowerCase() === 'p') {
          event.preventDefault();
          this.pinSelected();
        } else if (event.key.toLowerCase() === 'e') {
          event.preventDefault();
          this.enterEditMode();
        } else {
          this.isSearching.set(true);
          this.searchQuery.set(event.key);
          setTimeout(() => {
            const input = this.searchInput?.nativeElement;
            if (input) {
              input.value = this.searchQuery();
              input.focus();
              input.setSelectionRange(input.value.length, input.value.length);
            }
          }, 0);
        }
      }
  }
}
```

- [ ] **Step 7: Update the template — entry bindings**

Find the `<app-clipboard-entry>` element in the template (around line 161) and add the three new bindings:

Before (current):
```html
<app-clipboard-entry
  [entry]="entry"
  [selected]="selectedIndex() === i"
  (select)="selectEntry(i)"
  (delete)="deleteEntry(i)"
  (pin)="pinEntry(i)"
/>
```

After:
```html
<app-clipboard-entry
  [entry]="entry"
  [selected]="selectedIndex() === i"
  [editMode]="editingEntryId() === entry.id"
  (select)="selectEntry(i)"
  (delete)="deleteEntry(i)"
  (pin)="pinEntry(i)"
  (editConfirm)="onEditConfirm($event)"
  (editCancel)="onEditCancel()"
/>
```

- [ ] **Step 8: Update the template — add editCopyFailed error banner**

Find the `@if (duplicateError())` block (around line 182):
```html
@if (duplicateError()) {
  <div class="px-3.5 py-1.5 bg-destructive/10 border-t border-destructive/20 text-[11px] text-destructive shrink-0">
    {{ 'TRANSFORM.DUPLICATE_ERROR' | translate }}
  </div>
}
```

Add the editCopyFailed banner directly after it:
```html
@if (editCopyFailed()) {
  <div class="px-3.5 py-1.5 bg-destructive/10 border-t border-destructive/20 text-[11px] text-destructive shrink-0">
    {{ 'CLIPBOARD.EDIT_COPY_FAILED' | translate }}
  </div>
}
```

- [ ] **Step 9: Update the template — add E hint to footer second row**

Find the second footer row (around line 198):
```html
<div class="flex items-center gap-2">
  <app-keyboard-hint key="⌫" [label]="'CLIPBOARD.HINT_DELETE' | translate" />
  <app-keyboard-hint key="P" [label]="'CLIPBOARD.HINT_PIN' | translate" />
  <app-keyboard-hint key="Esc" [label]="'CLIPBOARD.HINT_CLOSE' | translate" class="ml-auto" />
</div>
```

Replace with:
```html
<div class="flex items-center gap-2">
  <app-keyboard-hint key="⌫" [label]="'CLIPBOARD.HINT_DELETE' | translate" />
  <app-keyboard-hint key="P" [label]="'CLIPBOARD.HINT_PIN' | translate" />
  <app-keyboard-hint key="E" [label]="'CLIPBOARD.HINT_EDIT' | translate" />
  <app-keyboard-hint key="Esc" [label]="'CLIPBOARD.HINT_CLOSE' | translate" class="ml-auto" />
</div>
```

- [ ] **Step 10: Verify TypeScript compiles**

Run: `pnpm tsc --noEmit`
Expected: No errors

- [ ] **Step 11: Commit**

```bash
git add src/app/features/clipboard-list/clipboard-list.component.ts
git commit -m "feat(clipboard-list): wire inline edit mode — E key, confirm/cancel handlers, footer hint"
```

---

## Task 4: Manual verification

- [ ] **Step 1: Start dev server**

Run: `pnpm tauri dev`

- [ ] **Step 2: Verify happy path**

1. Open popup, select a text entry
2. Press `E` — entry expands into textarea, all text selected
3. Edit the text
4. Press `Enter` — popup closes, edited text is in clipboard (paste to verify)
5. Reopen popup — original entry is unchanged in history

- [ ] **Step 3: Verify cancel**

1. Press `E`, edit something, press `Escape` — textarea collapses, no paste, original entry unchanged
2. Press `E`, edit something, click a different entry — edit cancelled, selection moves to clicked entry, no paste

- [ ] **Step 4: Verify Shift+Enter newline**

1. Press `E`, position cursor, press `Shift+Enter` — newline inserted in textarea, popup stays open

- [ ] **Step 5: Verify navigation cancel**

1. Press `E` on an entry, then press `ArrowDown` — edit is cancelled, selection moves to next entry

- [ ] **Step 6: Verify image entries are unaffected**

1. Navigate to an image entry, press `E` — nothing happens (no edit mode)

- [ ] **Step 7: Verify footer hint**

Footer second row now shows `E edit` hint alongside `⌫ del`, `P pin`, `Esc close`

- [ ] **Step 8: Final commit if any fixups were needed**

```bash
git add -p
git commit -m "fix(inline-edit): address issues found during manual verification"
```
