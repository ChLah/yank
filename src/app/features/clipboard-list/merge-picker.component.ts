import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterNextRender,
  inject,
  output,
  signal,
} from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { MergeSeparator } from '../../core/utils/merge-entries';

interface MergeOption {
  id: MergeSeparator;
  labelKey: string;
}

export const MERGE_OPTIONS: readonly MergeOption[] = [
  { id: 'newline', labelKey: 'MERGE.NEWLINE' },
  { id: 'bullet', labelKey: 'MERGE.BULLET_LIST' },
  { id: 'comma', labelKey: 'MERGE.COMMA' },
];

@Component({
  selector: 'app-merge-picker',
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
      @for (opt of options; track opt.id; let i = $index) {
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
  `,
})
export class MergePickerComponent {
  applied = output<{ separator: MergeSeparator }>();
  cancelled = output<void>();

  protected readonly options = MERGE_OPTIONS;
  protected cursor = signal(0);

  private readonly el = inject(ElementRef);

  constructor() {
    afterNextRender(() => this.el.nativeElement.focus());
  }

  protected onKeyDown(event: KeyboardEvent): void {
    const lastIndex = this.options.length - 1;

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
    const opt = this.options[this.cursor()];
    this.applied.emit({ separator: opt.id });
  }
}
