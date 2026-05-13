import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  linkedSignal,
  signal,
} from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { getCurrentWindow } from '@tauri-apps/api/window';
import type { UnlistenFn } from '@tauri-apps/api/event';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideChevronLeft, lucideX } from '@ng-icons/lucide';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmIcon } from '@spartan-ng/helm/icon';
import { HlmInput } from '@spartan-ng/helm/input';
import { HlmSelectImports } from '@spartan-ng/helm/select';
import { HlmSeparatorImports } from '@spartan-ng/helm/separator';
import { toast } from '@spartan-ng/brain/sonner';
import { SettingsService } from '../../core/services/settings.service';
import { I18nService } from '../../core/services/i18n.service';
import { ThemeService } from '../../core/services/theme.service';
import { UpdaterService } from '../../core/services/updater.service';
import { StatsService } from '../../core/services/stats.service';
import {
  AppSettings,
  DEFAULT_SETTINGS,
  Language,
  Theme,
  WindowPositionMode,
} from '../../core/models/settings.model';
import { PageHeaderComponent } from '../../shared/ui/page-header/page-header.component';
import { LoadingSpinnerComponent } from '../../shared/ui/loading-spinner/loading-spinner.component';
import { FormatBytesPipe } from '../../shared/pipes/format-bytes.pipe';
import { SettingFieldComponent } from './components/setting-field/setting-field.component';
import { SettingCheckboxComponent } from './components/setting-checkbox/setting-checkbox.component';
import { ExcludedAppsComponent } from './components/excluded-apps/excluded-apps.component';
import { ShortcutInputComponent } from './components/shortcut-input/shortcut-input.component';

@Component({
  selector: 'app-settings',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    DatePipe,
    DecimalPipe,
    FormatBytesPipe,
    NgIcon,
    HlmButton,
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
    ShortcutInputComponent,
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
            <app-setting-field [label]="'SETTINGS.SHORTCUT_LABEL' | translate">
              <app-shortcut-input
                [value]="settings().shortcut"
                (valueChange)="onShortcutChange($event)"
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
              <app-shortcut-input
                [value]="settings().pauseShortcut"
                [clearable]="true"
                (valueChange)="onPauseShortcutChange($event)"
              />
            </app-setting-field>
          </div>

          <brn-separator hlmSeparator />

          <!-- Updates -->
          <div class="space-y-3">
            <p class="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
              {{ 'SETTINGS.GROUP_UPDATES' | translate }}
            </p>

            <app-setting-field [label]="'SETTINGS.UPDATES_CURRENT_VERSION' | translate">
              <span class="text-[13px] text-foreground font-mono">{{
                updater.currentVersion() || '—'
              }}</span>
            </app-setting-field>

            <app-setting-field>
              <app-setting-checkbox
                id="auto-check-updates-checkbox"
                [label]="'SETTINGS.UPDATES_AUTO_CHECK_LABEL' | translate"
                [checked]="settings().autoCheckUpdates"
                (checkedChange)="onAutoCheckUpdatesChange($event)"
              />
            </app-setting-field>

            <app-setting-field>
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
            </app-setting-field>

            @switch (updater.state()) {
              @case ('up-to-date') {
                <p class="text-[12px] text-muted-foreground">
                  {{ 'SETTINGS.UPDATES_UP_TO_DATE' | translate }}
                </p>
              }
              @case ('ready') {
                @let pending = updater.availableUpdate();
                @if (pending) {
                  <div class="space-y-2 rounded-md border border-border bg-muted/30 p-3">
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
                  <p class="text-[12px] text-destructive">
                    {{ 'SETTINGS.UPDATES_ERROR' | translate: { error: err } }}
                  </p>
                }
              }
            }
          </div>

          <brn-separator hlmSeparator />

          <!-- Statistics -->
          <div class="space-y-3">
            <p class="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
              {{ 'SETTINGS.GROUP_STATISTICS' | translate }}
            </p>

            @let s = statsService.stats.value();
            @if (s) {
              <div class="grid grid-cols-2 gap-3">
                <!-- Insgesamt -->
                <div class="rounded-md border border-border bg-muted/30 p-3 space-y-2">
                  <p
                    class="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground"
                  >
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

                <!-- Diese Sitzung -->
                <div class="rounded-md border border-border bg-muted/30 p-3 space-y-2">
                  <p
                    class="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground"
                  >
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
                class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[12px] [&>dt]:text-muted-foreground [&>dd]:font-mono [&>dd]:text-right [&>dd]:text-foreground"
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

              <!-- Danger zone: full database reset -->
              <div class="rounded-md border border-destructive/40 bg-destructive/5 p-3 space-y-2">
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
          </div>
        </div>
      }
    </div>
  `,
})
export class SettingsComponent {
  protected settingsService = inject(SettingsService);
  protected statsService = inject(StatsService);
  protected updater = inject(UpdaterService);
  private i18nService = inject(I18nService);
  private themeService = inject(ThemeService);
  private translate = inject(TranslateService);

  protected readonly isStandaloneWindow = getCurrentWindow().label === 'settings';

  protected readonly resetConfirmInput = signal('');
  protected readonly confirmPhrase = computed(() =>
    this.translate.instant('SETTINGS.STATS_RESET_DB_CONFIRM_PHRASE'),
  );
  protected readonly locale = this.i18nService.resolvedLocale;

  constructor() {
    // Reload on every component init so navigating to /settings inline
    // refetches even though StatsService is provided in root scope.
    this.statsService.stats.reload();

    // The standalone `settings` window is reused (hidden, not destroyed) when
    // the user closes it, so this component stays mounted across show/hide
    // cycles. Refetch when the window regains focus so reopened windows show
    // current numbers without needing an Angular component remount.
    if (this.isStandaloneWindow) {
      const destroyRef = inject(DestroyRef);
      let unlisten: UnlistenFn | undefined;
      void getCurrentWindow()
        .onFocusChanged(({ payload: focused }) => {
          if (focused) this.statsService.stats.reload();
        })
        .then((fn) => {
          unlisten = fn;
        });
      destroyRef.onDestroy(() => unlisten?.());
    }
  }

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

  protected onShortcutChange(value: string): void {
    this.settings.update((s) => ({ ...s, shortcut: value }));
    this.persist();
  }

  protected onPauseShortcutChange(value: string): void {
    this.settings.update((s) => ({ ...s, pauseShortcut: value }));
    this.persist();
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

  protected onAutoCheckUpdatesChange(checked: boolean): void {
    this.settings.update((s) => ({ ...s, autoCheckUpdates: checked }));
    this.persist();
  }

  protected onCheckForUpdatesClick(): void {
    void this.updater.checkNow();
  }

  protected onRestartNowClick(): void {
    void this.updater.restartNow();
  }

  private async persist(): Promise<void> {
    try {
      await this.settingsService.saveSettings(this.settings());
    } catch (e) {
      toast.error(String(e));
    }
  }

  protected onResetConfirmInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.resetConfirmInput.set(value);
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
