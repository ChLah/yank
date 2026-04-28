import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  inject,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { HlmButton } from '@spartan-ng/helm/button';

@Component({
  selector: 'app-new-snippet-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, HlmButton],
  template: `
    <div class="border-b border-border px-3.5 py-3 bg-card/80" (click)="$event.stopPropagation()">
      <div class="flex flex-col gap-2">
        <input
          #titleInput
          type="text"
          [placeholder]="'SNIPPETS.TITLE_PLACEHOLDER' | translate"
          class="w-full bg-muted/50 text-[13px] text-foreground rounded-md px-2 py-1.5 outline-none focus:ring-1 focus:ring-brand/50"
          (keydown)="onTitleKeyDown($event)"
        />
        @if (titleError()) {
          <p class="text-[11px] text-destructive -mt-1">{{ 'SNIPPETS.TITLE_REQUIRED' | translate }}</p>
        }
        <textarea
          #contentTextarea
          rows="3"
          [placeholder]="'SNIPPETS.BODY_PLACEHOLDER' | translate"
          class="w-full bg-muted/50 text-[13px] text-foreground rounded-md px-2 py-1.5 resize-none outline-none focus:ring-1 focus:ring-brand/50 min-h-[60px]"
          (keydown)="onContentKeyDown($event)"
        ></textarea>
        <div class="flex gap-2 justify-end">
          <button hlmBtn variant="ghost" size="sm" (click)="cancel()">
            {{ 'SNIPPETS.CANCEL' | translate }}
          </button>
          <button hlmBtn size="sm" (click)="submit()">
            {{ 'SNIPPETS.SAVE' | translate }}
          </button>
        </div>
      </div>
    </div>
  `,
})
export class NewSnippetFormComponent {
  saved     = output<{ title: string; content: string }>();
  cancelled = output<void>();

  protected titleError = signal(false);

  private titleInput      = viewChild<ElementRef<HTMLInputElement>>('titleInput');
  private contentTextarea = viewChild<ElementRef<HTMLTextAreaElement>>('contentTextarea');
  private injector        = inject(Injector);

  constructor() {
    afterNextRender(() => this.titleInput()?.nativeElement.focus(), { injector: this.injector });
  }

  protected onTitleKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.cancel();
    } else if (event.key === 'Enter' && event.ctrlKey) {
      event.preventDefault();
      event.stopPropagation();
      this.submit();
    } else if ((event.key === 'Enter' || event.key === 'Tab') && !event.ctrlKey) {
      event.preventDefault();
      event.stopPropagation();
      this.contentTextarea()?.nativeElement.focus();
    }
  }

  protected onContentKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.cancel();
    } else if (event.key === 'Enter' && event.ctrlKey) {
      event.preventDefault();
      event.stopPropagation();
      this.submit();
    }
  }

  protected submit(): void {
    const title = this.titleInput()?.nativeElement.value.trim() ?? '';
    if (!title) {
      this.titleError.set(true);
      this.titleInput()?.nativeElement.focus();
      return;
    }
    const content = this.contentTextarea()?.nativeElement.value ?? '';
    this.saved.emit({ title, content });
  }

  protected cancel(): void {
    this.cancelled.emit();
  }
}
