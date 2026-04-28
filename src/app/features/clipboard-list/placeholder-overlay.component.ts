import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterNextRender,
  computed,
  inject,
  input,
  output,
} from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

export function extractPlaceholders(content: string): string[] {
  const matches = content.match(/\{\{([a-zA-Z0-9_-]+)\}\}/g) ?? [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const m of matches) {
    const name = m.slice(2, -2);
    if (!seen.has(name)) {
      seen.add(name);
      result.push(name);
    }
  }
  return result;
}

export function fillPlaceholders(content: string, values: Record<string, string>): string {
  return content.replace(/\{\{([a-zA-Z0-9_-]+)\}\}/g, (_, name) => values[name] ?? '');
}

@Component({
  selector: 'app-placeholder-overlay',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe],
  host: {
    class:
      'absolute inset-0 z-50 bg-background/95 backdrop-blur-sm flex flex-col gap-3 p-4 overflow-y-auto',
  },
  template: `
    <p class="text-[12px] font-semibold text-foreground">{{ 'SNIPPETS.PLACEHOLDER_OVERLAY_TITLE' | translate }}</p>
    @for (name of placeholderNames(); track name) {
      <div class="flex flex-col gap-1">
        <label class="text-[11px] text-muted-foreground font-medium uppercase tracking-wide">
          {{ name }}
        </label>
        <input
          type="text"
          class="bg-muted/50 text-[13px] text-foreground rounded-md px-2.5 py-1.5 outline-none focus:ring-1 focus:ring-brand/50"
          (input)="onInput(name, $event)"
          (keydown)="onFieldKeyDown($event)"
        />
      </div>
    }
    <p class="text-[11px] text-muted-foreground mt-auto pt-2">
      {{ 'SNIPPETS.PLACEHOLDER_OVERLAY_CONFIRM' | translate }}
    </p>
  `,
})
export class PlaceholderOverlayComponent {
  content = input.required<string>();

  confirmed = output<string>();
  cancelled = output<void>();

  private readonly el     = inject(ElementRef<HTMLElement>);
  private values: Record<string, string> = {};

  protected readonly placeholderNames = computed(() => extractPlaceholders(this.content()));

  constructor() {
    afterNextRender(() => {
      this.el.nativeElement.querySelector<HTMLInputElement>('input')?.focus();
    });
  }

  protected onInput(name: string, event: Event): void {
    this.values[name] = (event.target as HTMLInputElement).value;
  }

  protected onFieldKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.cancelled.emit();
    } else if (event.key === 'Enter') {
      event.preventDefault();
      event.stopPropagation();
      this.confirmed.emit(fillPlaceholders(this.content(), this.values));
    }
  }
}
