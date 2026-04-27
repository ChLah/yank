import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideAlertCircle,
  lucideBookmark,
  lucideClipboard,
} from '@ng-icons/lucide';
import { HlmIcon } from '@spartan-ng/helm/icon';

@Component({
  selector: 'app-empty-state',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgIcon, HlmIcon],
  providers: [provideIcons({ lucideAlertCircle, lucideBookmark, lucideClipboard })],
  template: `
    <div class="flex flex-col items-center justify-center h-full py-10 text-center gap-3">
      <div [class]="iconContainerClass()">
        <ng-icon hlm [size]="variant() === 'destructive' ? 'sm' : 'base'" [name]="icon()" [class]="iconClass()" />
      </div>
      <p class="text-[13px] text-muted-foreground">{{ title() }}</p>
      @if (hint()) {
        <p class="text-[11px] text-muted-foreground">{{ hint() }}</p>
      }
      <ng-content />
    </div>
  `,
})
export class EmptyStateComponent {
  icon = input.required<string>();
  title = input.required<string>();
  hint = input<string>();
  variant = input<'default' | 'destructive'>('default');

  protected iconContainerClass = computed(() =>
    this.variant() === 'destructive'
      ? 'w-9 h-9 rounded-full bg-red-500/10 flex items-center justify-center'
      : 'w-10 h-10 rounded-xl bg-card flex items-center justify-center'
  );

  protected iconClass = computed(() =>
    this.variant() === 'destructive' ? 'text-red-400' : 'text-muted-foreground'
  );
}
