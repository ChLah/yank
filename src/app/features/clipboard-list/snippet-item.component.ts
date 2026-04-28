import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  effect,
  inject,
  input,
  output,
  viewChild,
} from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideX } from '@ng-icons/lucide';
import { TranslatePipe } from '@ngx-translate/core';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmIcon } from '@spartan-ng/helm/icon';
import { Snippet } from '../../core/models/snippet.model';

@Component({
  selector: 'app-snippet-item',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgIcon, HlmIcon, HlmButton, TranslatePipe],
  providers: [provideIcons({ lucideX })],
  template: `
    <div
      class="flex items-center gap-2 pl-3.5 pr-3 group transition-colors border-l-2"
      [class.cursor-pointer]="!editMode()"
      [class]="selected() ? 'border-l-brand bg-card' : 'border-l-transparent hover:bg-card/60'"
      (click)="onOuterClick()"
    >
      @if (editMode()) {
        <div class="flex-1 min-w-0 py-2 flex flex-col gap-1.5" (click)="$event.stopPropagation()">
          <input
            #titleInput
            type="text"
            [value]="snippet().title"
            class="w-full bg-muted/50 text-[13px] font-medium text-foreground rounded-md px-2 py-1 outline-none focus:ring-1 focus:ring-brand/50"
            (keydown)="onTitleKeyDown($event)"
          />
          <textarea
            #contentTextarea
            [value]="snippet().content"
            rows="3"
            class="w-full bg-muted/50 text-[13px] text-foreground rounded-md px-2 py-1.5 resize-none outline-none focus:ring-1 focus:ring-brand/50 min-h-[60px]"
            (keydown)="onContentKeyDown($event)"
          ></textarea>
          <p class="text-[11px] text-muted-foreground">{{ 'SNIPPETS.EDIT_HINT' | translate }}</p>
        </div>
      } @else {
        <div class="flex-1 min-w-0 py-2.5">
          <p class="text-[13px] font-medium text-foreground truncate leading-snug">{{ snippet().title }}</p>
          <p class="text-[11px] text-muted-foreground truncate mt-0.5">{{ snippet().content }}</p>
        </div>
        <button
          hlmBtn variant="ghost" size="icon"
          class="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-red-400 hover:bg-red-500/10"
          [class.opacity-100]="selected()"
          [title]="'ENTRY.DELETE' | translate"
          (click)="$event.stopPropagation(); delete.emit()"
        >
          <ng-icon hlm size="sm" name="lucideX" />
        </button>
      }
    </div>
  `,
})
export class SnippetItemComponent {
  snippet  = input.required<Snippet>();
  selected = input(false);
  editMode = input(false);

  select      = output<void>();
  delete      = output<void>();
  editConfirm = output<{ title: string; content: string }>();
  editCancel  = output<void>();

  private titleInput      = viewChild<ElementRef<HTMLInputElement>>('titleInput');
  private contentTextarea = viewChild<ElementRef<HTMLTextAreaElement>>('contentTextarea');
  private injector        = inject(Injector);

  constructor() {
    effect(() => {
      if (this.editMode()) {
        afterNextRender(() => {
          this.titleInput()?.nativeElement.focus();
        }, { injector: this.injector });
      }
    });
  }

  protected onOuterClick(): void {
    if (!this.editMode()) this.select.emit();
  }

  protected onTitleKeyDown(event: KeyboardEvent): void {
    const action = resolveSnippetTitleKey(event.key, event.ctrlKey);
    if (!action) return;
    event.preventDefault();
    event.stopPropagation();
    if (action === 'cancel') {
      this.editCancel.emit();
    } else if (action === 'submit') {
      this.emitConfirm();
    } else {
      this.contentTextarea()?.nativeElement.focus();
    }
  }

  protected onContentKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.editCancel.emit();
    } else if (event.key === 'Enter' && event.ctrlKey) {
      event.preventDefault();
      event.stopPropagation();
      this.emitConfirm();
    }
  }

  private emitConfirm(): void {
    const title   = this.titleInput()?.nativeElement.value ?? '';
    const content = this.contentTextarea()?.nativeElement.value ?? '';
    this.editConfirm.emit({ title, content });
  }
}

/** Maps a title-field keydown to an edit action. Exported for unit testing. */
export function resolveSnippetTitleKey(
  key: string,
  ctrlKey: boolean,
): 'submit' | 'move-to-content' | 'cancel' | null {
  if (key === 'Escape') return 'cancel';
  if (key === 'Enter' && ctrlKey) return 'submit';
  if ((key === 'Enter' || key === 'Tab') && !ctrlKey) return 'move-to-content';
  return null;
}
