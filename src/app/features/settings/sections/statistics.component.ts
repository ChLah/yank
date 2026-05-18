import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmInput } from '@spartan-ng/helm/input';
import { toast } from '@spartan-ng/brain/sonner';
import { I18nService } from '../../../core/services/i18n.service';
import { StatsService } from '../../../core/services/stats.service';
import { FormatBytesPipe } from '../../../shared/pipes/format-bytes.pipe';

@Component({
  selector: 'app-settings-statistics',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, DecimalPipe, FormatBytesPipe, TranslatePipe, HlmButton, HlmInput],
  template: `
    @let s = statsService.stats.value();
    @if (s) {
      <div class="grid grid-cols-2 gap-3 mb-5">
        <div class="rounded-lg border border-border bg-muted/30 p-4 space-y-2">
          <p class="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
            {{ 'SETTINGS.STATS_TOTAL' | translate }}
          </p>
          <dl
            class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[12px] [&>dt]:text-muted-foreground [&>dd]:font-mono [&>dd]:text-right [&>dd]:text-foreground"
          >
            <dt>{{ 'SETTINGS.STATS_SINCE' | translate }}</dt>
            <dd>
              {{
                s.installedAt > 0
                  ? (s.installedAt * 1000 | date: 'short' : undefined : locale())
                  : '—'
              }}
            </dd>
            <dt>{{ 'SETTINGS.STATS_COPIED' | translate }}</dt>
            <dd>{{ s.totalCopies | number }}</dd>
            <dt>{{ 'SETTINGS.STATS_PASTED' | translate }}</dt>
            <dd>{{ s.totalPastes | number }}</dd>
          </dl>
        </div>

        <div class="rounded-lg border border-border bg-muted/30 p-4 space-y-2">
          <p class="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
            {{ 'SETTINGS.STATS_SESSION' | translate }}
          </p>
          <dl
            class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[12px] [&>dt]:text-muted-foreground [&>dd]:font-mono [&>dd]:text-right [&>dd]:text-foreground"
          >
            <dt>{{ 'SETTINGS.STATS_SINCE' | translate }}</dt>
            <dd>
              {{
                s.sessionStartedAt > 0
                  ? (s.sessionStartedAt * 1000 | date: 'short' : undefined : locale())
                  : '—'
              }}
            </dd>
            <dt>{{ 'SETTINGS.STATS_COPIED' | translate }}</dt>
            <dd>{{ s.sessionCopies | number }}</dd>
            <dt>{{ 'SETTINGS.STATS_PASTED' | translate }}</dt>
            <dd>{{ s.sessionPastes | number }}</dd>
          </dl>
          <button hlmBtn variant="outline" size="xs" (click)="onResetSessionClick()">
            {{ 'SETTINGS.STATS_RESET_SESSION' | translate }}
          </button>
        </div>
      </div>

      <dl
        class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-[12px] [&>dt]:text-muted-foreground [&>dd]:font-mono [&>dd]:text-right [&>dd]:text-foreground border-t border-border/60 pt-4"
      >
        <dt>{{ 'SETTINGS.STATS_SAVED_COPIES' | translate }}</dt>
        <dd>{{ s.savedEntriesCount | number }}</dd>
        <dt>{{ 'SETTINGS.STATS_SAVED_DATA' | translate }}</dt>
        <dd>{{ s.savedEntriesBytes | formatBytes }}</dd>
        <dt>{{ 'SETTINGS.STATS_DB_SIZE' | translate }}</dt>
        <dd>{{ s.dbFileBytes | formatBytes }}</dd>
        <dt>{{ 'SETTINGS.STATS_PINNED' | translate }}</dt>
        <dd>{{ s.pinnedCount | number }}</dd>
        <dt>{{ 'SETTINGS.STATS_SNIPPETS' | translate }}</dt>
        <dd>{{ s.snippetCount | number }}</dd>
      </dl>

      <div class="mt-6 rounded-lg border border-destructive/40 bg-destructive/5 p-4 space-y-2">
        <p class="text-[13px] font-medium text-foreground">
          {{ 'SETTINGS.STATS_RESET_DB_LABEL' | translate }}
        </p>
        <p class="text-[12px] text-muted-foreground">
          {{ 'SETTINGS.STATS_RESET_DB_HINT' | translate: { phrase: confirmPhrase() } }}
        </p>
        <div class="flex items-center gap-2">
          <input
            hlmInput
            [value]="resetConfirmInput()"
            (input)="onResetConfirmInput($event)"
            [placeholder]="
              'SETTINGS.STATS_RESET_DB_PLACEHOLDER' | translate: { phrase: confirmPhrase() }
            "
            class="flex-1"
          />
          <button
            hlmBtn
            variant="destructive"
            size="sm"
            [disabled]="resetConfirmInput().trim() !== confirmPhrase()"
            (click)="onResetDatabaseClick()"
          >
            {{ 'SETTINGS.STATS_RESET_DB_BUTTON' | translate }}
          </button>
        </div>
      </div>
    }
  `,
})
export class SettingsStatisticsComponent {
  protected statsService = inject(StatsService);
  private translate = inject(TranslateService);
  private i18nService = inject(I18nService);

  protected readonly locale = this.i18nService.resolvedLocale;
  protected readonly resetConfirmInput = signal('');
  protected readonly confirmPhrase = computed(() =>
    this.translate.instant('SETTINGS.STATS_RESET_DB_CONFIRM_PHRASE'),
  );

  protected onResetConfirmInput(event: Event): void {
    this.resetConfirmInput.set((event.target as HTMLInputElement).value);
  }

  protected async onResetSessionClick(): Promise<void> {
    try {
      await this.statsService.resetSession();
      toast.success(this.translate.instant('SETTINGS.STATS_SESSION_RESET_SUCCESS'));
    } catch (e) {
      toast.error(String(e));
    }
  }

  protected async onResetDatabaseClick(): Promise<void> {
    const confirm = this.resetConfirmInput().trim();
    if (confirm !== this.confirmPhrase()) return;
    try {
      await this.statsService.resetDatabase(confirm);
      this.resetConfirmInput.set('');
      toast.success(this.translate.instant('SETTINGS.STATS_RESET_SUCCESS'));
    } catch (e) {
      toast.error(String(e));
    }
  }
}
