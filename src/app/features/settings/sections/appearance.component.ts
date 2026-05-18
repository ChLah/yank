import { ChangeDetectionStrategy, Component, inject, model } from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { HlmSelectImports } from '@spartan-ng/helm/select';
import { AppSettings, Language, Theme } from '../../../core/models/settings.model';
import { I18nService } from '../../../core/services/i18n.service';
import { ThemeService } from '../../../core/services/theme.service';

export type AppearanceSettings = Pick<AppSettings, 'language' | 'theme'>;

@Component({
  selector: 'app-settings-appearance',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, HlmSelectImports],
  template: `
    <div class="divide-y divide-border/60">
      <div class="flex items-center justify-between gap-4 py-3.5">
        <label class="text-[13px] text-foreground">
          {{ 'SETTINGS.LANGUAGE_LABEL' | translate }}
        </label>
        <div class="w-60">
          <div
            hlmSelect
            [value]="settings().language ?? ''"
            [itemToString]="languageLabel"
            (valueChange)="onLanguageChange($event)"
          >
            <hlm-select-trigger class="w-full">
              <hlm-select-value />
            </hlm-select-trigger>
            <hlm-select-content *hlmSelectPortal>
              <hlm-select-item value="">{{
                'SETTINGS.LANGUAGE_SYSTEM' | translate
              }}</hlm-select-item>
              <hlm-select-item value="en">{{ 'SETTINGS.LANGUAGE_EN' | translate }}</hlm-select-item>
              <hlm-select-item value="de">{{ 'SETTINGS.LANGUAGE_DE' | translate }}</hlm-select-item>
            </hlm-select-content>
          </div>
        </div>
      </div>

      <div class="flex items-center justify-between gap-4 py-3.5">
        <label class="text-[13px] text-foreground">
          {{ 'SETTINGS.THEME_LABEL' | translate }}
        </label>
        <div class="w-60">
          <div
            hlmSelect
            [value]="settings().theme"
            [itemToString]="themeLabel"
            (valueChange)="onThemeChange($event)"
          >
            <hlm-select-trigger class="w-full">
              <hlm-select-value />
            </hlm-select-trigger>
            <hlm-select-content *hlmSelectPortal>
              <hlm-select-item value="system">{{
                'SETTINGS.THEME_SYSTEM' | translate
              }}</hlm-select-item>
              <hlm-select-item value="light">{{
                'SETTINGS.THEME_LIGHT' | translate
              }}</hlm-select-item>
              <hlm-select-item value="dark">{{
                'SETTINGS.THEME_DARK' | translate
              }}</hlm-select-item>
            </hlm-select-content>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class SettingsAppearanceComponent {
  private translate = inject(TranslateService);
  private i18nService = inject(I18nService);
  private themeService = inject(ThemeService);

  readonly settings = model.required<AppearanceSettings>();

  protected languageLabel = (val: string): string => {
    switch (val) {
      case 'en':
        return this.translate.instant('SETTINGS.LANGUAGE_EN');
      case 'de':
        return this.translate.instant('SETTINGS.LANGUAGE_DE');
      default:
        return this.translate.instant('SETTINGS.LANGUAGE_SYSTEM');
    }
  };

  protected themeLabel = (val: string): string => {
    switch (val) {
      case 'dark':
        return this.translate.instant('SETTINGS.THEME_DARK');
      case 'light':
        return this.translate.instant('SETTINGS.THEME_LIGHT');
      default:
        return this.translate.instant('SETTINGS.THEME_SYSTEM');
    }
  };

  protected onLanguageChange(value: string | null): void {
    const language: Language | null = value === '' || value === null ? null : (value as Language);
    this.i18nService.setLanguage(language);
    this.settings.update((s) => ({ ...s, language }));
  }

  protected onThemeChange(value: string | null): void {
    const theme = ((value as Theme) || 'system') as Theme;
    this.themeService.applyTheme(theme);
    this.settings.update((s) => ({ ...s, theme }));
  }
}
