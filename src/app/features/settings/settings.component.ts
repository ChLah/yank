import {
  ChangeDetectionStrategy,
  Component,
  inject,
  linkedSignal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideChevronLeft } from '@ng-icons/lucide';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { HlmIcon } from '@spartan-ng/helm/icon';
import { HlmInput } from '@spartan-ng/helm/input';
import { HlmLabel } from '@spartan-ng/helm/label';
import { HlmSelectImports } from '@spartan-ng/helm/select';
import { toast } from '@spartan-ng/brain/sonner';
import { SettingsService } from '../../core/services/settings.service';
import { I18nService } from '../../core/services/i18n.service';
import { ThemeService } from '../../core/services/theme.service';
import { AppSettings, DEFAULT_SETTINGS, Language, Theme } from '../../core/models/settings.model';

@Component({
  selector: 'app-settings',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink, NgIcon, HlmIcon, HlmInput, HlmLabel,
    TranslatePipe, HlmSelectImports,
  ],
  providers: [provideIcons({ lucideChevronLeft })],
  template: `
    <div class="flex flex-col h-screen bg-background">

      <!-- Header -->
      <div class="px-3.5 h-11 flex items-center gap-2 shrink-0 bg-card border-b border-border">
        <a routerLink="/" class="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
          <ng-icon hlm size="sm" name="lucideChevronLeft" />
        </a>
        <span class="text-[13px] font-semibold text-foreground tracking-tight">{{ 'SETTINGS.TITLE' | translate }}</span>
      </div>

      @if (settingsService.settings.isLoading()) {
        <div class="flex-1 flex items-center justify-center">
          <div class="w-5 h-5 border-2 border-muted border-t-muted-foreground rounded-full animate-spin"></div>
        </div>
      } @else {
        <div class="flex-1 flex flex-col p-5 gap-5 overflow-y-auto">

          <!-- Global Shortcut -->
          <div class="space-y-1.5">
            <label hlmLabel class="block uppercase tracking-wider">{{ 'SETTINGS.SHORTCUT_LABEL' | translate }}</label>
            <input
              hlmInput
              type="text"
              [value]="settings().shortcut"
              class="w-full font-mono"
              [placeholder]="'SETTINGS.SHORTCUT_PLACEHOLDER' | translate"
              (keydown)="captureShortcut($event)"
              readonly
            />
            <p class="text-[11px] text-muted-foreground">
              {{ 'SETTINGS.SHORTCUT_HINT' | translate }}
            </p>
          </div>

          <!-- Max entries -->
          <div class="space-y-1.5">
            <label hlmLabel class="block uppercase tracking-wider">{{ 'SETTINGS.MAX_ENTRIES_LABEL' | translate }}</label>
            <div class="flex items-center gap-3">
              <input
                hlmInput
                #maxInput
                type="number"
                [value]="settings().maxEntries"
                (blur)="onMaxEntriesBlur(maxInput.valueAsNumber)"
                min="5"
                max="100"
                class="w-24"
              />
              <span class="text-[12px] text-muted-foreground">{{ 'SETTINGS.MAX_ENTRIES_RANGE' | translate:{ min: 5, max: 100 } }}</span>
            </div>
          </div>

          <!-- Language -->
          <div class="space-y-1.5">
            <label hlmLabel class="block uppercase tracking-wider">{{ 'SETTINGS.LANGUAGE_LABEL' | translate }}</label>
            <div hlmSelect [value]="settings().language ?? ''" [itemToString]="languageLabel" (valueChange)="onLanguageChange($event)">
              <hlm-select-trigger class="w-full">
                <hlm-select-value />
              </hlm-select-trigger>
              <hlm-select-content *hlmSelectPortal>
                <hlm-select-item value="">{{ 'SETTINGS.LANGUAGE_SYSTEM' | translate }}</hlm-select-item>
                <hlm-select-item value="en">{{ 'SETTINGS.LANGUAGE_EN' | translate }}</hlm-select-item>
                <hlm-select-item value="de">{{ 'SETTINGS.LANGUAGE_DE' | translate }}</hlm-select-item>
              </hlm-select-content>
            </div>
          </div>

          <!-- Theme -->
          <div class="space-y-1.5">
            <label hlmLabel class="block uppercase tracking-wider">{{ 'SETTINGS.THEME_LABEL' | translate }}</label>
            <div hlmSelect [value]="settings().theme" [itemToString]="themeLabel" (valueChange)="onThemeChange($event)">
              <hlm-select-trigger class="w-full">
                <hlm-select-value />
              </hlm-select-trigger>
              <hlm-select-content *hlmSelectPortal>
                <hlm-select-item value="system">{{ 'SETTINGS.THEME_SYSTEM' | translate }}</hlm-select-item>
                <hlm-select-item value="light">{{ 'SETTINGS.THEME_LIGHT' | translate }}</hlm-select-item>
                <hlm-select-item value="dark">{{ 'SETTINGS.THEME_DARK' | translate }}</hlm-select-item>
              </hlm-select-content>
            </div>
          </div>

        </div>
      }
    </div>
  `,
})
export class SettingsComponent {
  protected settingsService = inject(SettingsService);
  private i18nService = inject(I18nService);
  private themeService = inject(ThemeService);
  private translate = inject(TranslateService);

  protected settings = linkedSignal<AppSettings>(
    () => this.settingsService.settings.value() ?? DEFAULT_SETTINGS
  );

  protected languageLabel = (val: string): string => {
    switch (val) {
      case 'en': return this.translate.instant('SETTINGS.LANGUAGE_EN');
      case 'de': return this.translate.instant('SETTINGS.LANGUAGE_DE');
      default:   return this.translate.instant('SETTINGS.LANGUAGE_SYSTEM');
    }
  };

  protected themeLabel = (val: string): string => {
    switch (val) {
      case 'dark':  return this.translate.instant('SETTINGS.THEME_DARK');
      case 'light': return this.translate.instant('SETTINGS.THEME_LIGHT');
      default:      return this.translate.instant('SETTINGS.THEME_SYSTEM');
    }
  };

  protected captureShortcut(event: KeyboardEvent): void {
    event.preventDefault();
    const parts: string[] = [];
    if (event.ctrlKey) parts.push('Ctrl');
    if (event.altKey) parts.push('Alt');
    if (event.shiftKey) parts.push('Shift');
    if (event.metaKey) parts.push('Super');

    const key = event.code;
    if (!['ControlLeft', 'ControlRight', 'AltLeft', 'AltRight',
          'ShiftLeft', 'ShiftRight', 'MetaLeft', 'MetaRight'].includes(key)) {
      const cleanKey = key.startsWith('Key') ? key.slice(3) : key;
      parts.push(cleanKey);
    }

    if (parts.length > 1) {
      this.settings.update(s => ({ ...s, shortcut: parts.join('+') }));
      this.persist();
    }
  }

  protected onMaxEntriesBlur(value: number): void {
    if (Number.isNaN(value)) return;
    const clamped = Math.min(100, Math.max(5, value));
    this.settings.update(s => ({ ...s, maxEntries: clamped }));
    this.persist();
  }

  protected onLanguageChange(value: string | null): void {
    const lang = value === '' || value === null ? null : (value as Language);
    this.settings.update(s => ({ ...s, language: lang }));
    this.i18nService.setLanguage(lang);
    this.persist();
  }

  protected onThemeChange(value: string | null): void {
    const theme = (value as Theme) || 'system';
    this.settings.update(s => ({ ...s, theme }));
    this.themeService.applyTheme(theme);
    this.persist();
  }

  private async persist(): Promise<void> {
    try {
      await this.settingsService.saveSettings(this.settings());
    } catch (e) {
      toast.error(String(e));
    }
  }
}
