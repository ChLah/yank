import { ChangeDetectionStrategy, Component, inject, model } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmSwitchImports } from '@spartan-ng/helm/switch';
import { UpdaterService } from '../../../core/services/updater.service';
import { AppSettings } from '../../../core/models/settings.model';

export type UpdatesSettings = Pick<AppSettings, 'autoCheckUpdates'>;

@Component({
  selector: 'app-settings-updates',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, HlmButton, ...HlmSwitchImports],
  template: `
    <div class="divide-y divide-border/60">
      <div class="flex items-center justify-between gap-4 py-3.5">
        <label class="text-[13px] text-foreground">
          {{ 'SETTINGS.UPDATES_CURRENT_VERSION' | translate }}
        </label>
        <span class="text-[13px] text-foreground font-mono">
          {{ updater.currentVersion() || '—' }}
        </span>
      </div>

      <div class="flex items-center justify-between gap-4 py-3.5">
        <label class="text-[13px] text-foreground" for="auto-check-updates-switch">
          {{ 'SETTINGS.UPDATES_AUTO_CHECK_LABEL' | translate }}
        </label>
        <hlm-switch
          id="auto-check-updates-switch"
          [checked]="settings().autoCheckUpdates"
          (checkedChange)="onAutoCheckUpdatesChange($event)"
        />
      </div>

      <div class="flex items-center justify-between gap-4 py-3.5">
        <span class="text-[13px] text-foreground">
          {{ 'SETTINGS.UPDATES_CHECK_NOW' | translate }}
        </span>
        <button
          hlmBtn
          variant="outline"
          size="sm"
          [disabled]="updater.state() === 'checking' || updater.state() === 'downloading'"
          (click)="onCheckForUpdatesClick()"
        >
          @switch (updater.state()) {
            @case ('checking') {
              {{ 'SETTINGS.UPDATES_CHECKING' | translate }}
            }
            @case ('downloading') {
              {{ 'SETTINGS.UPDATES_DOWNLOADING' | translate }}
            }
            @default {
              {{ 'SETTINGS.UPDATES_CHECK_NOW' | translate }}
            }
          }
        </button>
      </div>
    </div>

    @switch (updater.state()) {
      @case ('up-to-date') {
        <p class="text-[12px] text-muted-foreground mt-3">
          {{ 'SETTINGS.UPDATES_UP_TO_DATE' | translate }}
        </p>
      }
      @case ('ready') {
        @let pending = updater.availableUpdate();
        @if (pending) {
          <div class="mt-4 space-y-2 rounded-lg border border-border bg-muted/40 p-4">
            <p class="text-[13px] font-medium text-foreground">
              {{ 'SETTINGS.UPDATES_READY' | translate: { version: pending.version } }}
            </p>
            @if (pending.notes) {
              <div class="space-y-1">
                <p
                  class="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground"
                >
                  {{ 'SETTINGS.UPDATES_RELEASE_NOTES' | translate }}
                </p>
                <pre class="text-[12px] text-foreground whitespace-pre-wrap font-sans">{{
                  pending.notes
                }}</pre>
              </div>
            }
            <button hlmBtn size="sm" (click)="onRestartNowClick()">
              {{ 'SETTINGS.UPDATES_RESTART_NOW' | translate }}
            </button>
          </div>
        }
      }
      @case ('error') {
        @if (updater.errorMessage(); as err) {
          <p class="text-[12px] text-destructive mt-3">
            {{ 'SETTINGS.UPDATES_ERROR' | translate: { error: err } }}
          </p>
        }
      }
    }
  `,
})
export class SettingsUpdatesComponent {
  protected updater = inject(UpdaterService);

  readonly settings = model.required<UpdatesSettings>();

  protected onAutoCheckUpdatesChange(checked: boolean): void {
    this.settings.update((s) => ({ ...s, autoCheckUpdates: checked }));
  }

  protected onCheckForUpdatesClick(): void {
    void this.updater.checkNow();
  }

  protected onRestartNowClick(): void {
    void this.updater.restartNow();
  }
}
