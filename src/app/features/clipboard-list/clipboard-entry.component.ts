import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  output,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { timer } from 'rxjs';
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
      class="relative flex items-center gap-2 pl-3.5 pr-3 group transition-colors border-l-2"
      [class.cursor-pointer]="!editMode()"
      [class]="selected() ? 'border-l-brand bg-card' : 'border-l-transparent hover:bg-card/60'"
      (click)="onOuterClick()"
    >
      @if (ocrLoading()) {
        <div class="absolute inset-0 z-10 flex items-center justify-center bg-background/60 rounded-sm">
          <div class="w-4 h-4 border-2 border-brand/40 border-t-brand rounded-full animate-spin"></div>
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
  `,
})
export class ClipboardEntryComponent {
  entry      = input.required<ClipboardEntry>();
  selected   = input(false);
  editMode   = input(false);
  ocrLoading = input(false);

  select      = output<void>();
  delete      = output<void>();
  pin         = output<void>();
  editConfirm = output<string>();
  editCancel  = output<void>();

  private textareaRef = viewChild<ElementRef<HTMLTextAreaElement>>('editTextarea');
  private injector    = inject(Injector);
  private tick        = toSignal(timer(0, 30_000));

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

  protected onOuterClick(): void {
    if (!this.editMode()) {
      this.select.emit();
    }
  }

  protected onTextareaKeyDown(event: KeyboardEvent): void {
    const action = resolveTextareaKey(event.key, event.shiftKey);
    if (!action) return; // Shift+Enter: allow default (inserts newline)
    event.preventDefault();
    event.stopPropagation();
    if (action === 'cancel') {
      this.editCancel.emit();
    } else {
      this.editConfirm.emit(this.textareaRef()?.nativeElement?.value ?? '');
    }
  }

  relativeTimeTranslation = computed<TimeTranslation>(() => {
    this.tick();
    return buildRelativeTimeTranslation(this.entry().lastUsedAt);
  });

  imageDimensions = computed(() => {
    const e = this.entry();
    if (e.width && e.height) return `${e.width} × ${e.height}`;
    return null;
  });

  protected pinButtonClass = computed(() => {
    const alwaysVisible = this.selected() || this.entry().pinned;
    const visibility = alwaysVisible ? 'opacity-100' : 'opacity-0 group-hover:opacity-100';
    const color = this.entry().pinned
      ? 'text-brand-400 hover:text-brand-300'
      : 'text-muted-foreground hover:text-foreground';
    return `${visibility} transition-opacity ${color}`;
  });
}

/** Maps a textarea keydown to an edit action. Exported for unit testing. */
export function resolveTextareaKey(key: string, shiftKey: boolean): 'confirm' | 'cancel' | null {
  if (key === 'Escape' || key === 'Tab') return 'cancel';
  if (key === 'Enter' && !shiftKey) return 'confirm';
  return null; // Shift+Enter, letters, arrows, etc. — let default behaviour run
}

export function buildRelativeTimeTranslation(unixSeconds: number): TimeTranslation {
  const diffMs = Date.now() - unixSeconds * 1000;
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return { key: 'ENTRY.TIME_JUST_NOW', params: {} };
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return { key: 'ENTRY.TIME_MINUTES', params: { n: diffMin } };
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return { key: 'ENTRY.TIME_HOURS', params: { n: diffHr } };
  return { key: 'ENTRY.TIME_DAYS', params: { n: Math.floor(diffHr / 24) } };
}
