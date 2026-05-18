import { ChangeDetectionStrategy, Component, model } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { AppSettings } from '../../../core/models/settings.model';
import { ExcludedAppsComponent } from '../components/excluded-apps/excluded-apps.component';
import { ShortcutInputComponent } from '../components/shortcut-input/shortcut-input.component';

export type PrivacySettings = Pick<AppSettings, 'pauseShortcut'>;

@Component({
  selector: 'app-settings-privacy',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, ExcludedAppsComponent, ShortcutInputComponent],
  template: `
    <section class="py-3.5">
      <label class="text-[13px] text-foreground block mb-2">
        {{ 'SETTINGS.EXCLUDED_APPS_LABEL' | translate }}
      </label>
      <app-excluded-apps />
    </section>

    <section class="py-3.5 border-t border-border/60">
      <div class="flex items-center justify-between gap-4">
        <label class="text-[13px] text-foreground">
          {{ 'SETTINGS.PAUSE_SHORTCUT_LABEL' | translate }}
        </label>
        <div class="w-60">
          <app-shortcut-input
            [value]="settings().pauseShortcut"
            [clearable]="true"
            (valueChange)="onPauseShortcutChange($event)"
          />
        </div>
      </div>
    </section>
  `,
})
export class SettingsPrivacyComponent {
  readonly settings = model.required<PrivacySettings>();

  protected onPauseShortcutChange(value: string): void {
    this.settings.update((s) => ({ ...s, pauseShortcut: value }));
  }
}
