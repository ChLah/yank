import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

@Component({
  selector: 'app-skeleton-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="py-1">
      @for (item of items(); track $index) {
        <div class="flex items-center gap-3 pl-5 pr-4 py-2.5 border-l-2 border-l-transparent">
          <div class="flex-1 space-y-1.5">
            <div
              class="h-3 bg-muted rounded animate-pulse"
              [style.width.%]="55 + ($index % 3) * 15"
            ></div>
            <div class="h-2 bg-muted rounded animate-pulse w-20 opacity-50"></div>
          </div>
        </div>
      }
    </div>
  `,
})
export class SkeletonListComponent {
  count = input(5);
  protected items = computed(() => Array.from({ length: this.count() }));
}
