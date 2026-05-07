import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  OnInit,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TauriEventBus } from '../../core/services/tauri-event-bus.service';
import { RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideClipboard, lucideSettings } from '@ng-icons/lucide';
import { TranslatePipe } from '@ngx-translate/core';
import { HlmIcon } from '@spartan-ng/helm/icon';
import { HlmBadge } from '@spartan-ng/helm/badge';
import { HlmTabs, HlmTabsList, HlmTabsTrigger } from '@spartan-ng/helm/tabs';
import { HlmSwitchImports } from '@spartan-ng/helm/switch';
import { ClipboardTabComponent, ClipboardTabType } from './clipboard-tab.component';
import { SnippetsTabComponent } from './snippets-tab.component';
import { ClipboardFooterHintsComponent } from './clipboard-footer-hints.component';
import { SnippetsFooterHintsComponent } from './snippets-footer-hints.component';
import { UpdateBannerComponent } from './update-banner.component';
import { PageHeaderComponent } from '../../shared/ui/page-header/page-header.component';
import { ClipboardService } from '../../core/services/clipboard.service';
import { TauriBridgeService } from '../../core/services/tauri-bridge.service';
import { SettingsService } from '../../core/services/settings.service';
import { ClipboardEntry } from '../../core/models/clipboard-entry.model';

type TabType = 'snippets' | ClipboardTabType;

@Component({
  selector: 'app-clipboard-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ClipboardTabComponent,
    SnippetsTabComponent,
    ClipboardFooterHintsComponent,
    SnippetsFooterHintsComponent,
    UpdateBannerComponent,
    RouterLink,
    NgIcon,
    HlmIcon,
    HlmBadge,
    HlmTabs,
    HlmTabsList,
    HlmTabsTrigger,
    TranslatePipe,
    PageHeaderComponent,
    ...HlmSwitchImports,
  ],
  providers: [provideIcons({ lucideClipboard, lucideSettings })],
  host: {
    '(keydown)': 'onKeyDown($event)',
    tabindex: '0',
    class: 'block outline-none h-full',
  },
  template: `
    <div
      class="flex flex-col h-full bg-background rounded-xl overflow-hidden border border-border shadow-2xl"
    >
      <!-- Header -->
      <app-page-header>
        <ng-container start>
          <ng-icon hlm size="sm" name="lucideClipboard" class="text-muted-foreground shrink-0" />
          <span class="text-[13px] font-semibold text-foreground tracking-tight">{{
            'CLIPBOARD.TITLE' | translate
          }}</span>
          @if (activeTab() !== 'snippets' && entryCount() > 0) {
            <span hlmBadge variant="secondary">{{ entryCount() }}</span>
          }
        </ng-container>
        <ng-container end>
          <span class="text-[11px] text-muted-foreground select-none">{{
            'CLIPBOARD.CAPTURE_LABEL' | translate
          }}</span>
          <hlm-switch
            [checked]="!captureIsPaused()"
            (checkedChange)="onCaptureSwitchChange($event)"
          />
          <a
            routerLink="/settings"
            class="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <ng-icon hlm size="sm" name="lucideSettings" />
          </a>
        </ng-container>
      </app-page-header>

      <app-update-banner />

      <!-- Tab switcher row -->
      <div class="flex items-center px-3.5 h-[34px] shrink-0 bg-card/50 border-b border-border">
        <div hlmTabs [tab]="activeTab()" (tabActivated)="setTab($event)">
          <div hlmTabsList variant="line" class="h-8 rounded-none bg-transparent p-0">
            @for (tab of tabs; track tab.value) {
              <button [hlmTabsTrigger]="tab.value" class="text-[12px] gap-1.5 px-1">
                {{ tab.labelKey | translate }}
                @if (tab.value === 'pinned' && pinnedCount() > 0) {
                  <span hlmBadge variant="secondary" class="text-[10px] h-4 min-w-0 px-1">{{
                    pinnedCount()
                  }}</span>
                }
              </button>
            }
          </div>
        </div>
      </div>

      <!-- Active tab -->
      @if (activeTab() === 'snippets') {
        <app-snippets-tab class="flex-1 min-h-0" />
      } @else {
        <app-clipboard-tab
          [tab]="activeClipboardTab()"
          class="flex-1 min-h-0"
          (selectedEntry)="onSelectedEntry($event)"
        />
      }

      <!-- Footer -->
      <div class="px-3.5 py-1.5 flex flex-col gap-1 shrink-0 bg-card border-t border-border">
        @if (activeTab() === 'snippets') {
          <app-snippets-footer-hints />
        } @else {
          <app-clipboard-footer-hints [showOcrHint]="showOcrHint()" />
        }
      </div>
    </div>
  `,
})
export class ClipboardListComponent implements OnInit {
  private clipboard = inject(ClipboardService);
  private bridge = inject(TauriBridgeService);
  private settings = inject(SettingsService);
  private hostEl = inject(ElementRef);
  private bus = inject(TauriEventBus);
  private moveDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private suppressPositionSave = false;

  protected activeTab = signal<TabType>('recent');
  protected activeClipboardTab = computed(() => this.activeTab() as ClipboardTabType);
  protected captureIsPaused = signal(false);

  private selectedEntrySignal = signal<ClipboardEntry | null>(null);
  protected showOcrHint = computed(() => this.selectedEntrySignal()?.kind === 'image');

  protected entryCount = computed(() => this.clipboard.count());
  protected pinnedCount = computed(() => this.clipboard.filterEntries(true, 'all', '').length);

  private clipboardTabRef = viewChild(ClipboardTabComponent);
  private snippetsTabRef = viewChild(SnippetsTabComponent);

  protected readonly tabs = [
    { labelKey: 'CLIPBOARD.TAB_RECENT', value: 'recent' as TabType },
    { labelKey: 'CLIPBOARD.TAB_PINNED', value: 'pinned' as TabType },
    { labelKey: 'SNIPPETS.TAB', value: 'snippets' as TabType },
  ];

  constructor() {
    this.bus.popupShown$.pipe(takeUntilDestroyed()).subscribe(() => {
      this.activeTab.set('recent');
      this.selectedEntrySignal.set(null);
      this.bridge.getCapturePaused().then((paused) => this.captureIsPaused.set(paused));
      this.suppressPositionSave = true;
      setTimeout(() => (this.suppressPositionSave = false), 600);
      setTimeout(() => this.focusActiveTab());
    });

    this.bus.capturePausedChanged$.pipe(takeUntilDestroyed()).subscribe((paused) => {
      this.captureIsPaused.set(paused);
    });

    this.bus.windowMoved$.pipe(takeUntilDestroyed()).subscribe(({ x, y }) => {
      if (this.suppressPositionSave) return;
      if (this.moveDebounceTimer) clearTimeout(this.moveDebounceTimer);
      this.moveDebounceTimer = setTimeout(() => {
        if (this.settings.settings.value()?.windowPosition === 'last') {
          this.bridge.saveWindowPosition(x, y);
        }
      }, 300);
    });

    inject(DestroyRef).onDestroy(() => {
      if (this.moveDebounceTimer) clearTimeout(this.moveDebounceTimer);
    });
  }

  ngOnInit(): void {
    this.bridge.getCapturePaused().then((paused) => this.captureIsPaused.set(paused));
    this.focusActiveTab();
  }

  protected setTab(tab: string): void {
    this.activeTab.set(tab as TabType);
    this.selectedEntrySignal.set(null);
    setTimeout(() => this.focusActiveTab());
  }

  protected onSelectedEntry(entry: ClipboardEntry | null): void {
    this.selectedEntrySignal.set(entry);
  }

  protected onKeyDown(event: KeyboardEvent): void {
    if (event.ctrlKey && event.key === 'Tab') {
      event.preventDefault();
      event.stopPropagation();
      this.cycleTab(event.shiftKey ? -1 : 1);
    }
  }

  protected async onCaptureSwitchChange(checked: boolean): Promise<void> {
    this.captureIsPaused.set(!checked);
    try {
      await this.bridge.toggleCapturePaused();
    } catch {
      this.captureIsPaused.set(!this.captureIsPaused());
    }
  }

  private cycleTab(direction: 1 | -1): void {
    const allTabs: TabType[] = ['recent', 'pinned', 'snippets'];
    const idx = allTabs.indexOf(this.activeTab());
    this.setTab(allTabs[(idx + direction + allTabs.length) % allTabs.length]);
  }

  private focusActiveTab(): void {
    this.clipboardTabRef()?.focus();
    this.snippetsTabRef()?.focus();
  }
}
