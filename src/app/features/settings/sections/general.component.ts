import { ChangeDetectionStrategy, Component, inject, model } from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { HlmSelectImports } from '@spartan-ng/helm/select';
import { HlmSwitchImports } from '@spartan-ng/helm/switch';
import { AppSettings, WindowPositionMode } from '../../../core/models/settings.model';
import { ShortcutInputComponent } from '../components/shortcut-input/shortcut-input.component';

export type GeneralSettings = Pick<AppSettings, 'shortcut' | 'autostart' | 'windowPosition'>;

@Component({
  selector: 'app-settings-general',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, HlmSelectImports, ...HlmSwitchImports, ShortcutInputComponent],
  template: `
    <div class="divide-y divide-border/60">
      <div class="flex items-start justify-between gap-4 py-3.5">
        <div class="flex-1 min-w-0 pt-1.5">
          <label class="text-[13px] text-foreground block">
            {{ 'SETTINGS.SHORTCUT_LABEL' | translate }}
          </label>
        </div>
        <div class="w-60 shrink-0">
          <app-shortcut-input
            [value]="settings().shortcut"
            (valueChange)="onShortcutChange($event)"
          />
        </div>
      </div>

      <div class="flex items-center justify-between gap-4 py-3.5">
        <label class="text-[13px] text-foreground" for="autostart-switch">
          {{ 'SETTINGS.AUTOSTART_LABEL' | translate }}
        </label>
        <hlm-switch
          id="autostart-switch"
          [checked]="settings().autostart"
          (checkedChange)="onAutostartChange($event)"
        />
      </div>

      <div class="flex items-center justify-between gap-4 py-3.5">
        <label class="text-[13px] text-foreground">
          {{ 'SETTINGS.WINDOW_POSITION_LABEL' | translate }}
        </label>
        <div class="w-60">
          <div
            hlmSelect
            [value]="settings().windowPosition"
            [itemToString]="windowPositionLabel"
            (valueChange)="onWindowPositionChange($event)"
          >
            <hlm-select-trigger class="w-full">
              <hlm-select-value />
            </hlm-select-trigger>
            <hlm-select-content *hlmSelectPortal>
              <hlm-select-item value="cursor">
                {{ 'SETTINGS.WINDOW_POSITION_CURSOR' | translate }}
              </hlm-select-item>
              <hlm-select-item value="last">
                {{ 'SETTINGS.WINDOW_POSITION_LAST' | translate }}
              </hlm-select-item>
            </hlm-select-content>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class SettingsGeneralComponent {
  private translate = inject(TranslateService);

  readonly settings = model.required<GeneralSettings>();

  protected windowPositionLabel = (val: string): string => {
    switch (val) {
      case 'last':
        return this.translate.instant('SETTINGS.WINDOW_POSITION_LAST');
      default:
        return this.translate.instant('SETTINGS.WINDOW_POSITION_CURSOR');
    }
  };

  protected onShortcutChange(value: string): void {
    this.settings.update((s) => ({ ...s, shortcut: value }));
  }

  protected onAutostartChange(checked: boolean): void {
    this.settings.update((s) => ({ ...s, autostart: checked }));
  }

  protected onWindowPositionChange(value: string | null): void {
    const windowPosition = (value as WindowPositionMode) || 'cursor';
    this.settings.update((s) => ({ ...s, windowPosition }));
  }
}
