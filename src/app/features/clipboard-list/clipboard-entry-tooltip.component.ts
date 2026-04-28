import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideBookmark,
  lucideCalendar,
  lucideClock,
  lucideHash,
  lucideMaximize2,
  lucideMonitor,
} from '@ng-icons/lucide';
import { TranslatePipe } from '@ngx-translate/core';
import { HlmIcon } from '@spartan-ng/helm/icon';
import { ClipboardEntry } from '../../core/models/clipboard-entry.model';

@Component({
  selector: 'app-clipboard-entry-tooltip',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgIcon, HlmIcon, TranslatePipe],
  providers: [
    provideIcons({
      lucideBookmark,
      lucideCalendar,
      lucideClock,
      lucideHash,
      lucideMaximize2,
      lucideMonitor,
    }),
  ],
  template: `
    @if (entry().kind === 'text' && entry().content) {
      <p
        class="text-[11px] font-mono leading-relaxed line-clamp-8 break-all text-foreground/80 mb-3 whitespace-pre-wrap"
      >
        {{ entry().content }}
      </p>
      <div class="border-t border-border -mx-4 mb-3"></div>
    }

    <div class="flex flex-col gap-1.5">
      @if (entry().pinned) {
        <div class="flex items-center gap-2 text-[11px] text-brand-400">
          <ng-icon hlm size="sm" name="lucideBookmark" />
          <span>{{ 'TOOLTIP.PINNED' | translate }}</span>
        </div>
      }

      @if (entry().sourceApp) {
        <div class="flex items-center gap-2 text-[11px] text-muted-foreground">
          <ng-icon hlm size="sm" name="lucideMonitor" />
          <span class="truncate">{{ entry().sourceApp }}</span>
        </div>
      }

      @if (entry().kind === 'text') {
        <div class="flex items-center gap-2 text-[11px] text-muted-foreground">
          <ng-icon hlm size="sm" name="lucideHash" />
          <span>{{ 'TOOLTIP.CHARACTERS' | translate: { n: charCount() } }}</span>
        </div>
      }

      @if (imageDimensions()) {
        <div class="flex items-center gap-2 text-[11px] text-muted-foreground">
          <ng-icon hlm size="sm" name="lucideMaximize2" />
          <span>{{ imageDimensions() }}</span>
        </div>
      }

      <div class="flex items-center gap-2 text-[11px] text-muted-foreground">
        <ng-icon hlm size="sm" name="lucideClock" />
        <span>{{ 'TOOLTIP.LAST_USED' | translate }}: {{ formattedLastUsedAt() }}</span>
      </div>

      <div class="flex items-center gap-2 text-[11px] text-muted-foreground">
        <ng-icon hlm size="sm" name="lucideCalendar" />
        <span>{{ 'TOOLTIP.ADDED' | translate }}: {{ formattedCreatedAt() }}</span>
      </div>
    </div>
  `,
})
export class ClipboardEntryTooltipComponent {
  entry = input.required<ClipboardEntry>();

  protected charCount = computed(() => this.entry().content?.length ?? 0);

  protected imageDimensions = computed(() => {
    const e = this.entry();
    if (e.width && e.height) return `${e.width} × ${e.height}`;
    return null;
  });

  protected formattedCreatedAt = computed(() => formatAbsoluteDate(this.entry().createdAt));
  protected formattedLastUsedAt = computed(() => formatAbsoluteDate(this.entry().lastUsedAt));
}

export function formatAbsoluteDate(unixSeconds: number): string {
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(unixSeconds * 1000));
}
