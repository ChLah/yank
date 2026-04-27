import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

@Component({
  selector: 'app-loading-spinner',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="w-5 h-5 border-2 rounded-full animate-spin" [class]="borderClass()"></div>
  `,
})
export class LoadingSpinnerComponent {
  variant = input<'default' | 'dark'>('default');

  protected borderClass = computed(() =>
    this.variant() === 'dark'
      ? 'border-zinc-800 border-t-zinc-500'
      : 'border-muted border-t-muted-foreground'
  );
}
