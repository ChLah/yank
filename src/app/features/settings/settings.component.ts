import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  linkedSignal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideChartBar,
  lucideDownload,
  lucideHistory,
  lucidePalette,
  lucideSettings,
  lucideShield,
  lucideX,
} from '@ng-icons/lucide';
import { TranslatePipe } from '@ngx-translate/core';
import { toast } from '@spartan-ng/brain/sonner';
import { HlmIcon } from '@spartan-ng/helm/icon';
import type { UnlistenFn } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { AppSettings, DEFAULT_SETTINGS } from '../../core/models/settings.model';
import { SettingsService } from '../../core/services/settings.service';
import { StatsService } from '../../core/services/stats.service';
import { LoadingSpinnerComponent } from '../../shared/ui/loading-spinner/loading-spinner.component';
import { PageHeaderComponent } from '../../shared/ui/page-header/page-header.component';
import { SettingsAppearanceComponent } from './sections/appearance.component';
import { SettingsGeneralComponent } from './sections/general.component';
import { SettingsHistoryComponent } from './sections/history.component';
import { SettingsPrivacyComponent } from './sections/privacy.component';
import { SECTIONS, SECTION_KEYS, SectionKey, isSectionKey } from './sections/sections';
import { SettingsStatisticsComponent } from './sections/statistics.component';
import { SettingsUpdatesComponent } from './sections/updates.component';

@Component({
  selector: 'app-settings',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    NgIcon,
    HlmIcon,
    TranslatePipe,
    PageHeaderComponent,
    LoadingSpinnerComponent,
    SettingsGeneralComponent,
    SettingsAppearanceComponent,
    SettingsHistoryComponent,
    SettingsPrivacyComponent,
    SettingsUpdatesComponent,
    SettingsStatisticsComponent,
  ],
  providers: [
    provideIcons({
      lucideChartBar,
      lucideDownload,
      lucideHistory,
      lucidePalette,
      lucideSettings,
      lucideShield,
      lucideX,
    }),
  ],
  template: `
    <div class="flex flex-col h-screen bg-background">
      <app-page-header>
        <ng-container start>
          <span class="text-[13px] font-semibold text-foreground tracking-tight">
            {{ 'SETTINGS.TITLE' | translate }}
          </span>
        </ng-container>
        <ng-container end>
          <button
            (click)="closeWindow()"
            class="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            aria-label="Close"
          >
            <ng-icon hlm size="sm" name="lucideX" />
          </button>
        </ng-container>
      </app-page-header>

      @if (settingsService.settings.isLoading()) {
        <div class="flex-1 flex items-center justify-center">
          <app-loading-spinner />
        </div>
      } @else {
        <div class="flex flex-1 min-h-0">
          <!-- Sidebar -->
          <aside class="w-50 shrink-0 border-r border-border bg-muted/40 flex flex-col">
            <nav class="flex-1 p-2 space-y-0.5 overflow-y-auto">
              @for (key of sectionKeys; track key) {
                <button
                  type="button"
                  (click)="onSectionClick(key)"
                  class="w-full h-9 px-2.5 flex items-center gap-2.5 rounded-md text-[13px] transition-colors text-left"
                  [class.bg-accent]="activeSection() === key"
                  [class.text-accent-foreground]="activeSection() === key"
                  [class.text-muted-foreground]="activeSection() !== key"
                  [class.hover:bg-muted]="activeSection() !== key"
                  [class.hover:text-foreground]="activeSection() !== key"
                >
                  <ng-icon hlm size="sm" [name]="sections[key].icon" />
                  <span>{{ sections[key].labelKey | translate }}</span>
                </button>
              }
            </nav>
          </aside>

          <!-- Content -->
          <main class="flex-1 overflow-y-auto">
            <div class="max-w-150 mx-auto px-8 py-7">
              <header class="mb-5">
                <h2 class="text-[15px] font-semibold text-foreground">
                  {{ sections[activeSection()].labelKey | translate }}
                </h2>
              </header>

              @switch (activeSection()) {
                @case ('general') {
                  <app-settings-general
                    [settings]="generalSlice()"
                    (settingsChange)="onSectionChange($event)"
                  />
                }
                @case ('appearance') {
                  <app-settings-appearance
                    [settings]="appearanceSlice()"
                    (settingsChange)="onSectionChange($event)"
                  />
                }
                @case ('history') {
                  <app-settings-history
                    [settings]="historySlice()"
                    (settingsChange)="onSectionChange($event)"
                  />
                }
                @case ('privacy') {
                  <app-settings-privacy
                    [settings]="privacySlice()"
                    (settingsChange)="onSectionChange($event)"
                  />
                }
                @case ('updates') {
                  <app-settings-updates
                    [settings]="updatesSlice()"
                    (settingsChange)="onSectionChange($event)"
                  />
                }
                @case ('statistics') {
                  <app-settings-statistics />
                }
              }
            </div>
          </main>
        </div>
      }
    </div>
  `,
})
export class SettingsComponent {
  protected settingsService = inject(SettingsService);
  private statsService = inject(StatsService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  protected readonly sections = SECTIONS;
  protected readonly sectionKeys = SECTION_KEYS;

  protected readonly settings = linkedSignal<AppSettings>(
    () => this.settingsService.settings.value() ?? DEFAULT_SETTINGS,
  );

  private readonly queryParams = toSignal(this.route.queryParamMap, {
    initialValue: this.route.snapshot.queryParamMap,
  });

  protected readonly activeSection = computed<SectionKey>(() => {
    const raw = this.queryParams().get('section');
    return isSectionKey(raw) ? raw : 'general';
  });

  protected readonly generalSlice = computed(() => ({
    shortcut: this.settings().shortcut,
    autostart: this.settings().autostart,
    windowPosition: this.settings().windowPosition,
  }));

  protected readonly appearanceSlice = computed(() => ({
    language: this.settings().language,
    theme: this.settings().theme,
  }));

  protected readonly historySlice = computed(() => ({
    maxEntries: this.settings().maxEntries,
    deleteAfterMaxEntries: this.settings().deleteAfterMaxEntries,
    maxDays: this.settings().maxDays,
    deleteAfterDays: this.settings().deleteAfterDays,
  }));

  protected readonly privacySlice = computed(() => ({
    pauseShortcut: this.settings().pauseShortcut,
  }));

  protected readonly updatesSlice = computed(() => ({
    autoCheckUpdates: this.settings().autoCheckUpdates,
  }));

  constructor() {
    this.statsService.stats.reload();

    // The settings window is reused (hidden, not destroyed) when the user
    // closes it, so this component stays mounted across show/hide cycles.
    // Refetch when the window regains focus so reopened windows show current
    // numbers without needing a remount.
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

  protected closeWindow(): void {
    getCurrentWindow().close();
  }

  protected onSectionClick(key: SectionKey): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { section: key },
      queryParamsHandling: 'merge',
    });
  }

  protected onSectionChange(slice: Partial<AppSettings>): void {
    this.settings.update((s) => ({ ...s, ...slice }));
    void this.persist();
  }

  private async persist(): Promise<void> {
    try {
      await this.settingsService.saveSettings(this.settings());
    } catch (e) {
      toast.error(String(e));
    }
  }
}
