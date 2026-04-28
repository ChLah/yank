# Entry Hover Tooltip Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a rich hover card with extended content preview and metadata when the user hovers over a clipboard entry.

**Architecture:** Each `ClipboardEntryComponent` wraps its row in `[hlmHoverCard]`, which provides `BrnHoverCardContentService`. The row div carries `[hlmHoverCardTrigger]`. A `<ng-template hlmHoverCardPortal>` holds the card; `[hlmHoverCardContent]` on the div inside the template provides state tokens so animations work. `ClipboardEntryTooltipComponent` is a plain content component — no hover-card coupling — that renders the card body rows.

**Tech Stack:** Angular 21 (signals, OnPush), spartan-ng `BrnHoverCard` / `HlmHoverCard` (CDK overlay), `HlmHoverCardPortal` (token provider for animations), Tailwind CSS, `@ng-icons/lucide`, `@ngx-translate/core`

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Move (restructure) | `src/libs/ui/hover-card/src/index.ts` | Barrel export for hover-card helm lib |
| Move | `src/libs/ui/hover-card/src/lib/hlm-hover-card.ts` | HlmHoverCard directive |
| Move | `src/libs/ui/hover-card/src/lib/hlm-hover-card-content.ts` | HlmHoverCardContent styling + state tokens |
| Move | `src/libs/ui/hover-card/src/lib/hlm-hover-card-portal.ts` | HlmHoverCardPortal (wraps BrnHoverCardContent) |
| Move | `src/libs/ui/hover-card/src/lib/hlm-hover-card-trigger.ts` | HlmHoverCardTrigger directive |
| Modify | `tsconfig.json` | Update path alias to new location |
| Modify | `src/app/i18n/translation.interface.ts` | Add `TOOLTIP` group to `Translation` |
| Modify | `src/app/i18n/en.ts` | English TOOLTIP strings |
| Modify | `src/app/i18n/de.ts` | German TOOLTIP strings |
| Create | `src/app/features/clipboard-list/clipboard-entry-tooltip.component.spec.ts` | Unit tests for `formatAbsoluteDate` |
| Create | `src/app/features/clipboard-list/clipboard-entry-tooltip.component.ts` | Tooltip content rows component |
| Modify | `src/app/features/clipboard-list/clipboard-entry.component.ts` | Add hover card wrapper + trigger + portal template |

---

### Task 1: Restructure hover-card lib to standard path

The spartan CLI generated files at `src/libs/ui/hover-card/hover-card/src/` (double-nested). Move them one level up to match every other lib in `src/libs/ui/`.

**Files:**
- Create: `src/libs/ui/hover-card/src/index.ts`
- Create: `src/libs/ui/hover-card/src/lib/hlm-hover-card.ts`
- Create: `src/libs/ui/hover-card/src/lib/hlm-hover-card-content.ts`
- Create: `src/libs/ui/hover-card/src/lib/hlm-hover-card-portal.ts`
- Create: `src/libs/ui/hover-card/src/lib/hlm-hover-card-trigger.ts`
- Delete: `src/libs/ui/hover-card/hover-card/` (entire directory)
- Modify: `tsconfig.json`

- [ ] **Step 1: Create `src/libs/ui/hover-card/src/lib/hlm-hover-card.ts`**

```typescript
import { Directive } from '@angular/core';
import { BrnHoverCard } from '@spartan-ng/brain/hover-card';

@Directive({
  selector: '[hlmHoverCard],hlm-hover-card',
  hostDirectives: [BrnHoverCard],
  host: {
    'data-slot': 'hover-card',
  },
})
export class HlmHoverCard {}
```

- [ ] **Step 2: Create `src/libs/ui/hover-card/src/lib/hlm-hover-card-content.ts`**

```typescript
import { Directive, ElementRef, Renderer2, effect, inject, signal } from '@angular/core';
import { injectExposedSideProvider, injectExposesStateProvider } from '@spartan-ng/brain/core';
import { classes } from '@spartan-ng/helm/utils';

@Directive({
  selector: '[hlmHoverCardContent],hlm-hover-card-content',
  host: {
    'data-slot': 'hover-card-content',
  },
})
export class HlmHoverCardContent {
  private readonly _renderer = inject(Renderer2);
  private readonly _element = inject(ElementRef);

  public readonly state =
    injectExposesStateProvider({ host: true }).state ?? signal('closed').asReadonly();
  public readonly side =
    injectExposedSideProvider({ host: true }).side ?? signal('bottom').asReadonly();

  constructor() {
    effect(() => {
      this._renderer.setAttribute(this._element.nativeElement, 'data-state', this.state());
      this._renderer.setAttribute(this._element.nativeElement, 'data-side', this.side());
    });

    classes(() => [
      'border-border bg-popover text-popover-foreground z-50 w-64 rounded-md border p-4 shadow-md outline-none',
      'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2',
    ]);
  }
}
```

- [ ] **Step 3: Create `src/libs/ui/hover-card/src/lib/hlm-hover-card-portal.ts`**

```typescript
import { Directive } from '@angular/core';
import { BrnHoverCardContent } from '@spartan-ng/brain/hover-card';

@Directive({
  selector: '[hlmHoverCardPortal],hlm-hover-card-portal',
  hostDirectives: [BrnHoverCardContent],
})
export class HlmHoverCardPortal {}
```

- [ ] **Step 4: Create `src/libs/ui/hover-card/src/lib/hlm-hover-card-trigger.ts`**

```typescript
import { Directive } from '@angular/core';
import { BrnHoverCardTrigger } from '@spartan-ng/brain/hover-card';

@Directive({
  selector: '[hlmHoverCardTrigger]',
  hostDirectives: [
    {
      directive: BrnHoverCardTrigger,
      inputs: [
        'showDelay',
        'hideDelay',
        'animationDelay',
        'sideOffset',
        'align',
        'brnHoverCardTriggerFor: hlmHoverCardTriggerFor',
      ],
    },
  ],
  host: {
    'data-slot': 'hover-card-trigger',
  },
})
export class HlmHoverCardTrigger {}
```

- [ ] **Step 5: Create `src/libs/ui/hover-card/src/index.ts`**

```typescript
import { HlmHoverCard } from './lib/hlm-hover-card';
import { HlmHoverCardContent } from './lib/hlm-hover-card-content';
import { HlmHoverCardPortal } from './lib/hlm-hover-card-portal';
import { HlmHoverCardTrigger } from './lib/hlm-hover-card-trigger';

export { HlmHoverCard } from './lib/hlm-hover-card';
export { HlmHoverCardContent } from './lib/hlm-hover-card-content';
export { HlmHoverCardPortal } from './lib/hlm-hover-card-portal';
export { HlmHoverCardTrigger } from './lib/hlm-hover-card-trigger';

export const HlmHoverCardImports = [
  HlmHoverCardContent,
  HlmHoverCardPortal,
  HlmHoverCard,
  HlmHoverCardTrigger,
] as const;
```

- [ ] **Step 6: Update tsconfig.json path alias**

In `tsconfig.json`, find:
```json
"@spartan-ng/helm/hover-card": ["./src/libs/ui/hover-card/hover-card/src/index.ts"]
```

Replace with:
```json
"@spartan-ng/helm/hover-card": ["./src/libs/ui/hover-card/src/index.ts"]
```

- [ ] **Step 7: Delete the old double-nested directory**

Run:
```bash
rm -rf src/libs/ui/hover-card/hover-card
```

- [ ] **Step 8: Run build check**

Run: `pnpm ng build --configuration development 2>&1 | tail -5`

Expected: no errors mentioning `hover-card`.

- [ ] **Step 9: Commit**

```bash
git add src/libs/ui/hover-card/src/ tsconfig.json
git rm -r src/libs/ui/hover-card/hover-card/
git commit -m "refactor(hover-card): move helm lib to standard src/ path"
```

---

### Task 2: Add TOOLTIP i18n keys

**Files:**
- Modify: `src/app/i18n/translation.interface.ts`
- Modify: `src/app/i18n/en.ts`
- Modify: `src/app/i18n/de.ts`

- [ ] **Step 1: Add `TOOLTIP` group to `translation.interface.ts`**

In `src/app/i18n/translation.interface.ts`, add the group before the closing `}` of the interface:

```typescript
  TOOLTIP: {
    PINNED: string;
    CHARACTERS: string;
    LAST_USED: string;
    ADDED: string;
  };
```

- [ ] **Step 2: Add English values to `en.ts`**

In `src/app/i18n/en.ts`, add before the closing `};`:

```typescript
  TOOLTIP: {
    PINNED: 'Pinned',
    CHARACTERS: '{{n}} characters',
    LAST_USED: 'Last used',
    ADDED: 'Added',
  },
```

- [ ] **Step 3: Add German values to `de.ts`**

In `src/app/i18n/de.ts`, add before the closing `};`:

```typescript
  TOOLTIP: {
    PINNED: 'Angepinnt',
    CHARACTERS: '{{n}} Zeichen',
    LAST_USED: 'Zuletzt verwendet',
    ADDED: 'Hinzugefügt',
  },
```

- [ ] **Step 4: Run tests to confirm no type errors**

Run: `pnpm test 2>&1 | tail -10`

Expected: all existing tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/app/i18n/
git commit -m "feat(i18n): add TOOLTIP translation keys (en + de)"
```

---

### Task 3: Create ClipboardEntryTooltipComponent (TDD)

This component renders the tooltip body — metadata rows and content preview. It has no knowledge of hover-card mechanics; it is a plain component that accepts an entry and renders information.

**Files:**
- Create: `src/app/features/clipboard-list/clipboard-entry-tooltip.component.spec.ts`
- Create: `src/app/features/clipboard-list/clipboard-entry-tooltip.component.ts`

- [ ] **Step 1: Write failing tests for `formatAbsoluteDate`**

Create `src/app/features/clipboard-list/clipboard-entry-tooltip.component.spec.ts`:

```typescript
import { formatAbsoluteDate } from './clipboard-entry-tooltip.component';

describe('formatAbsoluteDate', () => {
  it('returns a non-empty string', () => {
    expect(formatAbsoluteDate(0)).toBeTruthy();
  });

  it('includes the correct year', () => {
    // 2026-04-28 00:00:00 UTC → Unix 1745798400
    expect(formatAbsoluteDate(1745798400)).toContain('2026');
  });

  it('handles the current timestamp without throwing', () => {
    const now = Math.floor(Date.now() / 1000);
    expect(() => formatAbsoluteDate(now)).not.toThrow();
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

Run: `pnpm test -- --reporter=verbose 2>&1 | grep -E "formatAbsoluteDate|FAIL|PASS" | head -10`

Expected: FAIL — `formatAbsoluteDate` is not defined.

- [ ] **Step 3: Implement `ClipboardEntryTooltipComponent`**

Create `src/app/features/clipboard-list/clipboard-entry-tooltip.component.ts`:

```typescript
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideBookmark,
  lucideCalendar,
  lucideClock,
  lucideHash,
  lucideMaximize2,
  lucideMonitor,
} from '@ng-icons/lucide';
import { TranslatePipe } from '@ngx-translate/core';
import { HlmIcon } from '@spartan-ng/helm/icon';
import { ClipboardEntry } from '../../core/models/clipboard-entry.model';

@Component({
  selector: 'app-clipboard-entry-tooltip',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgIcon, HlmIcon, TranslatePipe],
  providers: [
    provideIcons({
      lucideBookmark,
      lucideCalendar,
      lucideClock,
      lucideHash,
      lucideMaximize2,
      lucideMonitor,
    }),
  ],
  template: `
    @if (entry().kind === 'text' && entry().content) {
      <p class="text-[11px] font-mono leading-relaxed line-clamp-8 break-all text-foreground/80 mb-3 whitespace-pre-wrap">{{ entry().content }}</p>
      <div class="border-t border-border -mx-4 mb-3"></div>
    }

    <div class="flex flex-col gap-1.5">
      @if (entry().pinned) {
        <div class="flex items-center gap-2 text-[11px] text-brand-400">
          <ng-icon hlm size="sm" name="lucideBookmark" />
          <span>{{ 'TOOLTIP.PINNED' | translate }}</span>
        </div>
      }

      @if (entry().sourceApp) {
        <div class="flex items-center gap-2 text-[11px] text-muted-foreground">
          <ng-icon hlm size="sm" name="lucideMonitor" />
          <span class="truncate">{{ entry().sourceApp }}</span>
        </div>
      }

      @if (entry().kind === 'text') {
        <div class="flex items-center gap-2 text-[11px] text-muted-foreground">
          <ng-icon hlm size="sm" name="lucideHash" />
          <span>{{ 'TOOLTIP.CHARACTERS' | translate: { n: charCount() } }}</span>
        </div>
      }

      @if (imageDimensions()) {
        <div class="flex items-center gap-2 text-[11px] text-muted-foreground">
          <ng-icon hlm size="sm" name="lucideMaximize2" />
          <span>{{ imageDimensions() }}</span>
        </div>
      }

      <div class="flex items-center gap-2 text-[11px] text-muted-foreground">
        <ng-icon hlm size="sm" name="lucideClock" />
        <span>{{ 'TOOLTIP.LAST_USED' | translate }}: {{ formattedLastUsedAt() }}</span>
      </div>

      <div class="flex items-center gap-2 text-[11px] text-muted-foreground">
        <ng-icon hlm size="sm" name="lucideCalendar" />
        <span>{{ 'TOOLTIP.ADDED' | translate }}: {{ formattedCreatedAt() }}</span>
      </div>
    </div>
  `,
})
export class ClipboardEntryTooltipComponent {
  entry = input.required<ClipboardEntry>();

  protected charCount = computed(() => this.entry().content?.length ?? 0);

  protected imageDimensions = computed(() => {
    const e = this.entry();
    if (e.width && e.height) return `${e.width} × ${e.height}`;
    return null;
  });

  protected formattedCreatedAt  = computed(() => formatAbsoluteDate(this.entry().createdAt));
  protected formattedLastUsedAt = computed(() => formatAbsoluteDate(this.entry().lastUsedAt));
}

export function formatAbsoluteDate(unixSeconds: number): string {
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(unixSeconds * 1000));
}
```

- [ ] **Step 4: Run tests to confirm they pass**

Run: `pnpm test -- --reporter=verbose 2>&1 | grep -E "formatAbsoluteDate|FAIL|PASS" | head -10`

Expected: all three `formatAbsoluteDate` tests PASS.

- [ ] **Step 5: Run Prettier on new files**

Run:
```bash
npx prettier --write src/app/features/clipboard-list/clipboard-entry-tooltip.component.ts src/app/features/clipboard-list/clipboard-entry-tooltip.component.spec.ts
```

- [ ] **Step 6: Commit**

```bash
git add src/app/features/clipboard-list/clipboard-entry-tooltip.component.ts src/app/features/clipboard-list/clipboard-entry-tooltip.component.spec.ts
git commit -m "feat(tooltip): add ClipboardEntryTooltipComponent with formatAbsoluteDate"
```

---

### Task 4: Integrate hover card into ClipboardEntryComponent

**Architecture notes for this task:**
- `BrnHoverCardContentService` is provided by `BrnHoverCard` at the directive level (not root). The trigger must be a content child of a `[hlmHoverCard]` wrapper to inject it.
- Animations (`data-state=open/closed`) only work if `BrnHoverCardContent` is in the DI tree of the overlay content. `BrnHoverCardContent` provides `EXPOSES_STATE_TOKEN` and `EXPOSES_SIDE_TOKEN`. Using `hlmHoverCardPortal` on the ng-template (which wraps `BrnHoverCardContent` as a hostDirective) makes these tokens available to the template's content.
- `BrnHoverCard.ngAfterContentInit()` finds the trigger and the portal (via ContentChild) and wires them automatically — no explicit `[hlmHoverCardTriggerFor]` needed.

**Files:**
- Modify: `src/app/features/clipboard-list/clipboard-entry.component.ts`

- [ ] **Step 1: Add imports to `ClipboardEntryComponent`**

In `src/app/features/clipboard-list/clipboard-entry.component.ts`:

Add after the existing spartan imports:
```typescript
import { HlmHoverCard, HlmHoverCardContent, HlmHoverCardPortal, HlmHoverCardTrigger } from '@spartan-ng/helm/hover-card';
import { ClipboardEntryTooltipComponent } from './clipboard-entry-tooltip.component';
```

In the `@Component` `imports` array, add:
```typescript
HlmHoverCard, HlmHoverCardContent, HlmHoverCardPortal, HlmHoverCardTrigger,
ClipboardEntryTooltipComponent,
```

- [ ] **Step 2: Replace the outer template div with hover-card structure**

The current template opens with:
```html
<div
  class="relative flex items-center gap-2 pl-3.5 pr-3 group transition-colors border-l-2"
  [class.cursor-pointer]="!editMode()"
  [class]="selected() ? 'border-l-brand bg-card' : 'border-l-transparent hover:bg-card/60'"
  (click)="onOuterClick()"
>
```

Replace the entire template with the following (wraps the row in `hlmHoverCard`, adds `hlmHoverCardTrigger` to the row div, and appends the portal template as a sibling):

```html
<div hlmHoverCard>
  <div
    class="relative flex items-center gap-2 pl-3.5 pr-3 group transition-colors border-l-2"
    [class.cursor-pointer]="!editMode()"
    [class]="selected() ? 'border-l-brand bg-card' : 'border-l-transparent hover:bg-card/60'"
    (click)="onOuterClick()"
    hlmHoverCardTrigger
    [showDelay]="600"
    [hideDelay]="200"
  >
    @if (ocrLoading()) {
      <div class="absolute inset-0 z-10 flex flex-col items-center justify-center gap-1 bg-background/60 rounded-sm">
        <div class="w-4 h-4 border-2 border-brand/40 border-t-brand rounded-full animate-spin"></div>
        <span class="text-[10px] text-muted-foreground">{{ 'OCR.EXTRACTING' | translate }}</span>
      </div>
    }
    @if (editMode()) {
      <div class="flex-1 min-w-0 py-2" (click)="$event.stopPropagation()">
        <textarea
          #editTextarea
          class="w-full bg-muted/50 text-[13px] text-foreground rounded-md px-2 py-1.5 resize-none outline-none focus:ring-1 focus:ring-brand/50 min-h-[60px]"
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
          <p class="text-[11px] text-muted-foreground mt-0.5">
            @if (entry().sourceApp) {
              <span>{{ entry().sourceApp }} · </span>
            }
            @if (imageDimensions()) {
              <span>{{ imageDimensions() }} · </span>
            }
            <span class="tabular-nums">{{ relativeTimeTranslation().key | translate:relativeTimeTranslation().params }}</span>
          </p>
        </div>
      } @else {
        <div class="flex-1 min-w-0 py-2">
          <p class="text-[13px] text-foreground truncate leading-snug">{{ entry().content }}</p>
          <p class="text-[11px] text-muted-foreground mt-0.5">
            @if (entry().sourceApp) {
              <span>{{ entry().sourceApp }} · </span>
            }
            <span class="tabular-nums">{{ relativeTimeTranslation().key | translate:relativeTimeTranslation().params }}</span>
          </p>
        </div>
      }

      <div class="flex items-center gap-1 shrink-0">
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

  <ng-template hlmHoverCardPortal>
    <div hlmHoverCardContent>
      <app-clipboard-entry-tooltip [entry]="entry()" />
    </div>
  </ng-template>
</div>
```

- [ ] **Step 3: Run full test suite**

Run: `pnpm test 2>&1 | tail -15`

Expected: all tests pass.

- [ ] **Step 4: Run Prettier on modified file**

Run:
```bash
npx prettier --write src/app/features/clipboard-list/clipboard-entry.component.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/app/features/clipboard-list/clipboard-entry.component.ts
git commit -m "feat(tooltip): integrate BrnHoverCard trigger into ClipboardEntryComponent"
```
