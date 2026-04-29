import { ChangeDetectionStrategy, Component, inject, linkedSignal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideChevronLeft, lucideX } from '@ng-icons/lucide';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { HlmIcon } from '@spartan-ng/helm/icon';
import { HlmInput } from '@spartan-ng/helm/input';
import { HlmSelectImports } from '@spartan-ng/helm/select';
import { HlmSeparatorImports } from '@spartan-ng/helm/separator';
import { toast } from '@spartan-ng/brain/sonner';
import { SettingsService } from '../../core/services/settings.service';
import { I18nService } from '../../core/services/i18n.service';
import { ThemeService } from '../../core/services/theme.service';
import {
  AppSettings,
  DEFAULT_SETTINGS,
  Language,
  Theme,
  WindowPositionMode,
} from '../../core/models/settings.model';
import { PageHeaderComponent } from '../../shared/ui/page-header/page-header.component';
import { LoadingSpinnerComponent } from '../../shared/ui/loading-spinner/loading-spinner.component';
import { SettingFieldComponent } from './components/setting-field/setting-field.component';
import { SettingCheckboxComponent } from './components/setting-checkbox/setting-checkbox.component';
import { ExcludedAppsComponent } from './components/excluded-apps/excluded-apps.component';

@Component({
  selector: 'app-settings',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    NgIcon,
    HlmIcon,
    HlmInput,
    TranslatePipe,
    HlmSelectImports,
    HlmSeparatorImports,
    PageHeaderComponent,
    LoadingSpinnerComponent,
    SettingFieldComponent,
    SettingCheckboxComponent,
    ExcludedAppsComponent,
  ],
  providers: [provideIcons({ lucideChevronLeft, lucideX })],
  template: `
    <div class="flex flex-col h-screen bg-background">
      <!-- Header -->
      <app-page-header>
        <ng-container start>
          @if (!isStandaloneWindow) {
            <a
              routerLink="/"
              class="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <ng-icon hlm size="sm" name="lucideChevronLeft" />
            </a>
          }
          <span class="text-[13px] font-semibold text-foreground tracking-tight">{{
            'SETTINGS.TITLE' | translate
          }}</span>
        </ng-container>
        @if (isStandaloneWindow) {
          <ng-container end>
            <button
              (click)="closeWindow()"
              class="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <ng-icon hlm size="sm" name="lucideX" />
            </button>
          </ng-container>
        }
      </app-page-header>

      @if (settingsService.settings.isLoading()) {
        <div class="flex-1 flex items-center justify-center">
          <app-loading-spinner />
        </div>
      } @else {
        <div class="flex-1 flex flex-col p-5 gap-5 overflow-y-auto">
          <!-- General -->
          <div class="space-y-3">
            <p class="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
              {{ 'SETTINGS.GROUP_GENERAL' | translate }}
            </p>

            <!-- Global Shortcut -->
            <app-setting-field
              [label]="'SETTINGS.SHORTCUT_LABEL' | translate"
              [hint]="'SETTINGS.SHORTCUT_HINT' | translate"
            >
              <input
                hlmInput
                type="text"
                [value]="settings().shortcut"
                class="w-full font-mono"
                [placeholder]="'SETTINGS.SHORTCUT_PLACEHOLDER' | translate"
                (keydown)="captureShortcut($event)"
                readonly
              />
            </app-setting-field>

            <!-- Start at Login -->
            <app-setting-field>
              <app-setting-checkbox
                id="autostart-checkbox"
                [label]="'SETTINGS.AUTOSTART_LABEL' | translate"
                [checked]="settings().autostart"
                (checkedChange)="onAutostartChange($event)"
              />
            </app-setting-field>

            <!-- Window Position -->
            <app-setting-field [label]="'SETTINGS.WINDOW_POSITION_LABEL' | translate">
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
                  <hlm-select-item value="cursor">{{
                    'SETTINGS.WINDOW_POSITION_CURSOR' | translate
                  }}</hlm-select-item>
                  <hlm-select-item value="last">{{
                    'SETTINGS.WINDOW_POSITION_LAST' | translate
                  }}</hlm-select-item>
                </hlm-select-content>
              </div>
            </app-setting-field>
          </div>

          <brn-separator hlmSeparator />

          <!-- Appearance -->
          <div class="space-y-3">
            <p class="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
              {{ 'SETTINGS.GROUP_APPEARANCE' | translate }}
            </p>

            <!-- Language -->
            <app-setting-field [label]="'SETTINGS.LANGUAGE_LABEL' | translate">
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
                  <hlm-select-item value="en">{{
                    'SETTINGS.LANGUAGE_EN' | translate
                  }}</hlm-select-item>
                  <hlm-select-item value="de">{{
                    'SETTINGS.LANGUAGE_DE' | translate
                  }}</hlm-select-item>
                </hlm-select-content>
              </div>
            </app-setting-field>

            <!-- Theme -->
            <app-setting-field [label]="'SETTINGS.THEME_LABEL' | translate">
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
            </app-setting-field>
          </div>

          <brn-separator hlmSeparator />

          <!-- History -->
          <div class="space-y-3">
            <p class="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
              {{ 'SETTINGS.GROUP_HISTORY' | translate }}
            </p>

            <!-- Limit history size -->
            <app-setting-field>
              <app-setting-checkbox
                id="delete-max-checkbox"
                [label]="'SETTINGS.DELETE_AFTER_MAX_LABEL' | translate"
                [checked]="settings().deleteAfterMaxEntries"
                (checkedChange)="onDeleteAfterMaxChange($event)"
              />
              <div
                class="flex items-center gap-3"
                [class.opacity-50]="!settings().deleteAfterMaxEntries"
              >
                <input
                  hlmInput
                  #maxEntriesInput
                  type="number"
                  [value]="settings().maxEntries"
                  (blur)="onMaxEntriesBlur(maxEntriesInput.valueAsNumber)"
                  [attr.disabled]="!settings().deleteAfterMaxEntries ? '' : null"
                  min="5"
                  max="999"
                  class="w-24"
                />
                <span class="text-[12px] text-muted-foreground">
                  {{ 'SETTINGS.MAX_ENTRIES_RANGE' | translate: { min: 5, max: 999 } }}
                </span>
              </div>
            </app-setting-field>

            <!-- Auto-delete old entries -->
            <app-setting-field>
              <app-setting-checkbox
                id="delete-days-checkbox"
                [label]="'SETTINGS.DELETE_AFTER_DAYS_LABEL' | translate"
                [checked]="settings().deleteAfterDays"
                (checkedChange)="onDeleteAfterDaysChange($event)"
              />
              <div class="flex items-center gap-3" [class.opacity-50]="!settings().deleteAfterDays">
                <input
                  hlmInput
                  #maxDaysInput
                  type="number"
                  [value]="settings().maxDays"
                  (blur)="onMaxDaysBlur(maxDaysInput.valueAsNumber)"
                  [attr.disabled]="!settings().deleteAfterDays ? '' : null"
                  min="1"
                  max="365"
                  class="w-24"
                />
                <span class="text-[12px] text-muted-foreground">
                  {{ 'SETTINGS.MAX_DAYS_RANGE' | translate: { min: 1, max: 365 } }}
                </span>
              </div>
            </app-setting-field>
          </div>

          <brn-separator hlmSeparator />

          <!-- Privacy -->
          <div class="space-y-3">
            <p class="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
              {{ 'SETTINGS.GROUP_PRIVACY' | translate }}
            </p>
            <app-setting-field [label]="'SETTINGS.EXCLUDED_APPS_LABEL' | translate">
              <app-excluded-apps />
            </app-setting-field>

            <app-setting-field [label]="'SETTINGS.PAUSE_SHORTCUT_LABEL' | translate">
              <div class="relative w-full">
                <input
                  hlmInput
                  type="text"
                  [value]="settings().pauseShortcut"
                  class="w-full font-mono pr-8"
                  [placeholder]="'SETTINGS.SHORTCUT_PLACEHOLDER' | translate"
                  (keydown)="onPauseShortcutCapture($event)"
                  readonly
                />
                @if (settings().pauseShortcut) {
                  <button
                    type="button"
                    class="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    (click)="clearPauseShortcut()"
                  >
                    <ng-icon hlm size="sm" name="lucideX" />
                  </button>
                }
              </div>
            </app-setting-field>
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

  protected readonly isStandaloneWindow = getCurrentWindow().label === 'settings';

  protected closeWindow(): void {
    getCurrentWindow().close();
  }

  protected settings = linkedSignal<AppSettings>(
    () => this.settingsService.settings.value() ?? DEFAULT_SETTINGS,
  );

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

  protected windowPositionLabel = (val: string): string => {
    switch (val) {
      case 'last':
        return this.translate.instant('SETTINGS.WINDOW_POSITION_LAST');
      default:
        return this.translate.instant('SETTINGS.WINDOW_POSITION_CURSOR');
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
    if (
      ![
        'ControlLeft',
        'ControlRight',
        'AltLeft',
        'AltRight',
        'ShiftLeft',
        'ShiftRight',
        'MetaLeft',
        'MetaRight',
      ].includes(key)
    ) {
      const cleanKey = key.startsWith('Key') ? key.slice(3) : key;
      parts.push(cleanKey);
    }

    if (parts.length > 1) {
      this.settings.update((s) => ({ ...s, shortcut: parts.join('+') }));
      this.persist();
    }
  }

  protected onMaxEntriesBlur(value: number): void {
    if (Number.isNaN(value)) return;
    const clamped = Math.min(999, Math.max(5, value));
    this.settings.update((s) => ({ ...s, maxEntries: clamped }));
    this.persist();
  }

  protected onMaxDaysBlur(value: number): void {
    if (Number.isNaN(value)) return;
    const clamped = Math.min(365, Math.max(1, value));
    this.settings.update((s) => ({ ...s, maxDays: clamped }));
    this.persist();
  }

  protected onAutostartChange(checked: boolean): void {
    this.settings.update((s) => ({ ...s, autostart: checked }));
    this.persist();
  }

  protected onDeleteAfterMaxChange(checked: boolean): void {
    this.settings.update((s) => ({ ...s, deleteAfterMaxEntries: checked }));
    this.persist();
  }

  protected onDeleteAfterDaysChange(checked: boolean): void {
    this.settings.update((s) => ({ ...s, deleteAfterDays: checked }));
    this.persist();
  }

  protected onLanguageChange(value: string | null): void {
    const lang = value === '' || value === null ? null : (value as Language);
    this.settings.update((s) => ({ ...s, language: lang }));
    this.i18nService.setLanguage(lang);
    this.persist();
  }

  protected onThemeChange(value: string | null): void {
    const theme = (value as Theme) || 'system';
    this.settings.update((s) => ({ ...s, theme }));
    this.themeService.applyTheme(theme);
    this.persist();
  }

  protected onWindowPositionChange(value: string | null): void {
    const windowPosition = (value as WindowPositionMode) || 'cursor';
    this.settings.update((s) => ({ ...s, windowPosition }));
    this.persist();
  }

  protected onPauseShortcutCapture(event: KeyboardEvent): void {
    event.preventDefault();
    const parts: string[] = [];
    if (event.ctrlKey) parts.push('Ctrl');
    if (event.altKey) parts.push('Alt');
    if (event.shiftKey) parts.push('Shift');
    if (event.metaKey) parts.push('Super');

    const key = event.code;
    if (
      ![
        'ControlLeft',
        'ControlRight',
        'AltLeft',
        'AltRight',
        'ShiftLeft',
        'ShiftRight',
        'MetaLeft',
        'MetaRight',
      ].includes(key)
    ) {
      if (parts.length === 0) {
        this.settings.update((s) => ({ ...s, pauseShortcut: '' }));
        this.persist();
        return;
      }
      const cleanKey = key.startsWith('Key') ? key.slice(3) : key;
      parts.push(cleanKey);
      if (parts.length > 1) {
        this.settings.update((s) => ({ ...s, pauseShortcut: parts.join('+') }));
        this.persist();
      }
    }
  }

  protected clearPauseShortcut(): void {
    this.settings.update((s) => ({ ...s, pauseShortcut: '' }));
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
