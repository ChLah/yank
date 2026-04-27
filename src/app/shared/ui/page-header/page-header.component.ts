import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'app-page-header',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="px-3.5 h-11 flex items-center justify-between shrink-0 border-b"
      [class]="variant() === 'dark' ? 'bg-zinc-900 border-zinc-800' : 'bg-card border-border'"
      [attr.data-tauri-drag-region]="dragRegion() ? '' : null">
      <div class="flex items-center gap-2">
        <ng-content select="[start]" />
      </div>
      <div class="flex items-center gap-2">
        <ng-content select="[end]" />
      </div>
    </div>
  `,
})
export class PageHeaderComponent {
  variant = input<'default' | 'dark'>('default');
  dragRegion = input(true);
}
