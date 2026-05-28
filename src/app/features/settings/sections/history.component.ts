import { ChangeDetectionStrategy, Component, model } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { HlmInput } from '@spartan-ng/helm/input';
import { HlmSwitchImports } from '@spartan-ng/helm/switch';
import { AppSettings } from '../../../core/models/settings.model';

export type HistorySettings = Pick<
  AppSettings,
  'maxEntries' | 'deleteAfterMaxEntries' | 'maxDays' | 'deleteAfterDays' | 'autoPaste'
>;

@Component({
  selector: 'app-settings-history',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, HlmInput, ...HlmSwitchImports],
  template: `
    <div class="divide-y divide-border/60">
      <div class="flex items-center justify-between gap-4 py-3.5">
        <div class="flex-1 min-w-0">
          <label class="text-[13px] text-foreground block" for="delete-max-switch">
            {{ 'SETTINGS.DELETE_AFTER_MAX_LABEL' | translate }}
          </label>
          <p class="text-[11px] text-muted-foreground mt-0.5">
            {{ 'SETTINGS.MAX_ENTRIES_RANGE' | translate: { min: 5, max: 999 } }}
          </p>
        </div>
        <div class="flex items-center gap-3 w-60 justify-end">
          <input
            hlmInput
            #maxEntriesInput
            type="number"
            [value]="settings().maxEntries"
            (blur)="onMaxEntriesBlur(maxEntriesInput.valueAsNumber)"
            [attr.disabled]="!settings().deleteAfterMaxEntries ? '' : null"
            min="5"
            max="999"
            class="w-20"
            [class.opacity-50]="!settings().deleteAfterMaxEntries"
          />
          <hlm-switch
            id="delete-max-switch"
            [checked]="settings().deleteAfterMaxEntries"
            (checkedChange)="onDeleteAfterMaxChange($event)"
          />
        </div>
      </div>

      <div class="flex items-center justify-between gap-4 py-3.5">
        <div class="flex-1 min-w-0">
          <label class="text-[13px] text-foreground block" for="delete-days-switch">
            {{ 'SETTINGS.DELETE_AFTER_DAYS_LABEL' | translate }}
          </label>
          <p class="text-[11px] text-muted-foreground mt-0.5">
            {{ 'SETTINGS.MAX_DAYS_RANGE' | translate: { min: 1, max: 365 } }}
          </p>
        </div>
        <div class="flex items-center gap-3 w-60 justify-end">
          <input
            hlmInput
            #maxDaysInput
            type="number"
            [value]="settings().maxDays"
            (blur)="onMaxDaysBlur(maxDaysInput.valueAsNumber)"
            [attr.disabled]="!settings().deleteAfterDays ? '' : null"
            min="1"
            max="365"
            class="w-20"
            [class.opacity-50]="!settings().deleteAfterDays"
          />
          <hlm-switch
            id="delete-days-switch"
            [checked]="settings().deleteAfterDays"
            (checkedChange)="onDeleteAfterDaysChange($event)"
          />
        </div>
      </div>

      <div class="flex items-center justify-between gap-4 py-3.5">
        <label class="text-[13px] text-foreground" for="auto-paste-switch">
          {{ 'SETTINGS.AUTO_PASTE_LABEL' | translate }}
        </label>
        <hlm-switch
          id="auto-paste-switch"
          [checked]="settings().autoPaste"
          (checkedChange)="onAutoPasteChange($event)"
        />
      </div>
    </div>
  `,
})
export class SettingsHistoryComponent {
  readonly settings = model.required<HistorySettings>();

  protected onMaxEntriesBlur(value: number): void {
    if (Number.isNaN(value)) return;
    const clamped = Math.min(999, Math.max(5, value));
    this.settings.update((s) => ({ ...s, maxEntries: clamped }));
  }

  protected onMaxDaysBlur(value: number): void {
    if (Number.isNaN(value)) return;
    const clamped = Math.min(365, Math.max(1, value));
    this.settings.update((s) => ({ ...s, maxDays: clamped }));
  }

  protected onDeleteAfterMaxChange(checked: boolean): void {
    this.settings.update((s) => ({ ...s, deleteAfterMaxEntries: checked }));
  }

  protected onDeleteAfterDaysChange(checked: boolean): void {
    this.settings.update((s) => ({ ...s, deleteAfterDays: checked }));
  }

  protected onAutoPasteChange(checked: boolean): void {
    this.settings.update((s) => ({ ...s, autoPaste: checked }));
  }
}
