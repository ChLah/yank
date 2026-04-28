import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterNextRender,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { TransformService } from '../../core/services/transform.service';

@Component({
  selector: 'app-transform-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe],
  host: {
    class:
      'absolute left-0 right-0 z-50 mt-0.5 bg-popover border border-border rounded-lg shadow-xl outline-none',
    tabindex: '0',
    '(keydown)': 'onKeyDown($event)',
  },
  template: `
    <div class="p-1.5">
      @for (opt of transformService.options; track opt.id; let i = $index) {
        <button
          type="button"
          [class]="
            'w-full text-left text-[12px] px-2.5 py-1.5 rounded transition-colors ' +
            (cursor() === i ? 'bg-accent text-accent-foreground' : 'text-foreground hover:bg-muted')
          "
          (click)="confirm(i)"
        >
          {{ opt.labelKey | translate }}
        </button>
      }
    </div>
    @if (errorKey()) {
      <p class="text-[11px] text-destructive px-3 pb-1.5">{{ errorKey() | translate }}</p>
    }
  `,
})
export class TransformPickerComponent {
  content = input.required<string>();

  applied = output<{ transformedContent: string }>();
  cancelled = output<void>();

  protected cursor = signal(0);
  protected errorKey = signal<string | null>(null);

  protected readonly transformService = inject(TransformService);
  private readonly el = inject(ElementRef);

  constructor() {
    afterNextRender(() => this.el.nativeElement.focus());
  }

  protected onKeyDown(event: KeyboardEvent): void {
    const lastIndex = this.transformService.options.length - 1;

    switch (event.key) {
      case 'ArrowDown':
        this.cursor.update((c) => Math.min(c + 1, lastIndex));
        event.preventDefault();
        event.stopPropagation();
        break;
      case 'ArrowUp':
        this.cursor.update((c) => Math.max(c - 1, 0));
        event.preventDefault();
        event.stopPropagation();
        break;
      case 'Enter':
        this.apply();
        event.preventDefault();
        event.stopPropagation();
        break;
      case 'Escape':
        this.cancelled.emit();
        event.preventDefault();
        event.stopPropagation();
        break;
    }
  }

  protected confirm(index: number): void {
    this.cursor.set(index);
    this.apply();
  }

  private apply(): void {
    const opt = this.transformService.options[this.cursor()];
    const result = this.transformService.apply(opt.id, this.content());
    if (!result.ok) {
      this.errorKey.set(result.error);
      return;
    }
    this.errorKey.set(null);
    this.applied.emit({ transformedContent: result.value });
  }
}
