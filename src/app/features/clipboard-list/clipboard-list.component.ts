import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  ViewChild,
  computed,
  inject,
  signal,
} from '@angular/core';
import { UnlistenFn } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { Router, RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideClipboard, lucideSearch, lucideSettings, lucideX } from '@ng-icons/lucide';
import { ClipboardEntryComponent } from './clipboard-entry.component';
import { PageHeaderComponent } from '../../shared/ui/page-header/page-header.component';
import { EmptyStateComponent } from '../../shared/ui/empty-state/empty-state.component';
import { KeyboardHintComponent } from '../../shared/ui/keyboard-hint/keyboard-hint.component';
import { ClipboardService } from '../../core/services/clipboard.service';
import { TauriBridgeService } from '../../core/services/tauri-bridge.service';
import { SettingsService } from '../../core/services/settings.service';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmBadge } from '@spartan-ng/helm/badge';
import { HlmIcon } from '@spartan-ng/helm/icon';
import { HlmTabs, HlmTabsList, HlmTabsTrigger } from '@spartan-ng/helm/tabs';
import { TranslatePipe } from '@ngx-translate/core';

type Tab    = 'recent' | 'pinned';
type Filter = 'all' | 'text' | 'image';

@Component({
  selector: 'app-clipboard-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ClipboardEntryComponent, RouterLink, NgIcon, HlmIcon, HlmButton, HlmBadge, HlmTabs, HlmTabsList, HlmTabsTrigger, TranslatePipe, PageHeaderComponent, EmptyStateComponent, KeyboardHintComponent],
  providers: [provideIcons({ lucideClipboard, lucideSettings, lucideSearch, lucideX })],
  host: {
    '(keydown)': 'onKeyDown($event)',
    'tabindex': '0',
    'class': 'block outline-none h-full',
  },
  template: `
    <div class="flex flex-col h-full bg-background rounded-xl overflow-hidden border border-border shadow-2xl">

      <!-- Header -->
      <app-page-header>
        <ng-container start>
          <ng-icon hlm size="sm" name="lucideClipboard" class="text-muted-foreground shrink-0" />
          <span class="text-[13px] font-semibold text-foreground tracking-tight">{{ 'CLIPBOARD.TITLE' | translate }}</span>
          @if (allEntries().length > 0) {
            <span hlmBadge variant="secondary">{{ allEntries().length }}</span>
          }
        </ng-container>
        <ng-container end>
          <a routerLink="/settings" class="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
            <ng-icon hlm size="sm" name="lucideSettings" />
          </a>
        </ng-container>
      </app-page-header>

      <!-- Tab + filter row -->
      <div class="flex items-center justify-between px-3.5 shrink-0 bg-card/50 border-b border-border" style="height:34px">
        <div hlmTabs [tab]="activeTab()" (tabActivated)="setTab($event)">
          <div hlmTabsList variant="line" class="h-8 rounded-none bg-transparent p-0">
            @for (tab of tabs; track tab.value) {
              <button [hlmTabsTrigger]="tab.value" class="text-[12px] gap-1.5 px-1">
                {{ tab.labelKey | translate }}
                @if (tab.value === 'pinned' && pinnedCount() > 0) {
                  <span hlmBadge variant="secondary" class="text-[10px] h-4 min-w-0 px-1">{{ pinnedCount() }}</span>
                }
              </button>
            }
          </div>
        </div>
        <div class="flex items-center gap-1">
          @for (f of filters; track f.value) {
            <button
              class="text-[11px] px-2 py-0.5 rounded-full border transition-colors"
              [class]="activeFilter() === f.value
                ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30'
                : 'text-muted-foreground border-transparent hover:text-foreground'"
              (click)="setFilter(f.value)">
              {{ f.labelKey | translate }}
            </button>
          }
        </div>
      </div>

      <!-- Search bar (animated slide-in) -->
      <div
        class="overflow-hidden transition-all duration-150 ease-out shrink-0"
        [class]="isSearching() ? 'max-h-10 opacity-100 border-b border-border' : 'max-h-0 opacity-0'">
        <div class="flex items-center gap-2 px-3.5 h-9">
          <ng-icon hlm size="sm" name="lucideSearch" class="text-muted-foreground shrink-0" />
          <input
            #searchInput
            type="text"
            [value]="searchQuery()"
            (input)="onSearchInput($event)"
            [placeholder]="'CLIPBOARD.SEARCH_PLACEHOLDER' | translate"
            class="flex-1 bg-transparent text-[13px] text-foreground placeholder:text-muted-foreground outline-none"
          />
          @if (searchQuery()) {
            <button
              class="text-muted-foreground hover:text-foreground transition-colors"
              (click)="clearSearch()">
              <ng-icon hlm size="sm" name="lucideX" />
            </button>
          }
        </div>
      </div>

      <!-- Content -->
      <div class="flex-1 overflow-y-auto scrollbar-thin" #listContainer>

        @if (clipboard.entries.isLoading()) {
          <div class="py-1">
            @for (skeleton of skeletons; track $index) {
              <div class="flex items-center gap-3 pl-5 pr-4 py-2.5 border-l-2 border-l-transparent">
                <div class="flex-1 space-y-1.5">
                  <div class="h-3 bg-muted rounded animate-pulse" [style.width.%]="65 + ($index % 3) * 10"></div>
                  <div class="h-2 bg-muted rounded animate-pulse w-12 opacity-50"></div>
                </div>
              </div>
            }
          </div>
        } @else if (clipboard.entries.error()) {
          <app-empty-state
            icon="lucideAlertCircle"
            [title]="'CLIPBOARD.ERROR_LOAD' | translate"
            variant="destructive">
            <button hlmBtn variant="link" size="sm" (click)="clipboard.entries.reload()">
              {{ 'CLIPBOARD.TRY_AGAIN' | translate }}
            </button>
          </app-empty-state>
        } @else if (filteredEntries().length === 0) {
          @if (activeTab() === 'pinned') {
            <app-empty-state
              icon="lucideBookmark"
              [title]="'CLIPBOARD.EMPTY_PINNED' | translate"
              [hint]="'CLIPBOARD.EMPTY_PINNED_HINT' | translate"
            />
          } @else if (searchQuery()) {
            <app-empty-state
              icon="lucideClipboard"
              [title]="'CLIPBOARD.EMPTY_NO_MATCHES' | translate:{ term: searchQuery() }"
            />
          } @else {
            <app-empty-state
              icon="lucideClipboard"
              [title]="'CLIPBOARD.EMPTY_NOTHING' | translate"
            />
          }
        } @else {
          <div class="py-1">
            @for (entry of filteredEntries(); track entry.id; let i = $index) {
              <div class="entry-item">
                <app-clipboard-entry
                  [entry]="entry"
                  [selected]="selectedIndex() === i"
                  (select)="selectEntry(i)"
                  (delete)="deleteEntry(i)"
                  (pin)="pinEntry(i)"
                />
              </div>
            }
          </div>
        }
      </div>

      <!-- Footer -->
      <div class="h-9 px-3.5 flex items-center gap-2 shrink-0 bg-card border-t border-border">
        <!-- footer nav hints -->
        <app-keyboard-hint key="↑↓" [label]="'CLIPBOARD.HINT_NAV' | translate" />
        <app-keyboard-hint key="↵" [label]="'CLIPBOARD.HINT_PASTE' | translate" />
        <app-keyboard-hint key="⌫" [label]="'CLIPBOARD.HINT_DELETE' | translate" />
        <app-keyboard-hint key="P" [label]="'CLIPBOARD.HINT_PIN' | translate" />
        <span class="flex items-center gap-1 text-[10px] text-muted-foreground ml-auto whitespace-nowrap">
          {{ 'CLIPBOARD.HINT_SEARCH' | translate }}
        </span>
        <app-keyboard-hint key="Esc" [label]="'CLIPBOARD.HINT_CLOSE' | translate" />
      </div>
    </div>
  `,
})
export class ClipboardListComponent implements OnInit, OnDestroy {
  protected clipboard = inject(ClipboardService);
  private bridge = inject(TauriBridgeService);
  private settings = inject(SettingsService);
  private router = inject(Router);
  private hostEl = inject(ElementRef);
  private unlistenPopupShown?: UnlistenFn;
  private unlistenWindowMoved?: UnlistenFn;
  private moveDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private suppressPositionSave = false;

  protected selectedIndex = signal(0);
  protected skeletons = Array.from({ length: 5 });

  protected activeTab    = signal<Tab>('recent');
  protected activeFilter = signal<Filter>('all');
  protected searchQuery  = signal('');
  protected isSearching  = signal(false);

  protected tabs = [
    { labelKey: 'CLIPBOARD.TAB_RECENT', value: 'recent' as Tab },
    { labelKey: 'CLIPBOARD.TAB_PINNED', value: 'pinned' as Tab },
  ];

  protected filters = [
    { labelKey: 'CLIPBOARD.FILTER_ALL',   value: 'all'   as Filter },
    { labelKey: 'CLIPBOARD.FILTER_TEXT',  value: 'text'  as Filter },
    { labelKey: 'CLIPBOARD.FILTER_IMAGE', value: 'image' as Filter },
  ];

  protected allEntries = computed(() => this.clipboard.entries.value() ?? []);

  protected pinnedCount = computed(() => this.allEntries().filter(e => e.pinned).length);

  protected filteredEntries = computed(() => {
    let list = this.allEntries();
    if (this.activeTab() === 'pinned')       list = list.filter(e => e.pinned);
    if (this.activeFilter() !== 'all')       list = list.filter(e => e.kind === this.activeFilter());
    const q = this.searchQuery().toLowerCase().trim();
    if (q) list = list.filter(e => e.content?.toLowerCase().includes(q));
    return list;
  });

  @ViewChild('listContainer') listContainer!: ElementRef<HTMLElement>;
  @ViewChild('searchInput')   searchInput?: ElementRef<HTMLInputElement>;

  ngOnInit(): void {
    this.hostEl.nativeElement.focus();
    this.bridge.onPopupShown(() => {
      this.activeTab.set('recent');
      this.activeFilter.set('all');
      this.clearSearch();
      // Suppress saving the position set programmatically on show
      this.suppressPositionSave = true;
      setTimeout(() => { this.suppressPositionSave = false; }, 600);
    }).then(fn => { this.unlistenPopupShown = fn; });

    getCurrentWindow().onMoved(({ payload }) => {
      if (this.suppressPositionSave) return;
      if (this.moveDebounceTimer) clearTimeout(this.moveDebounceTimer);
      this.moveDebounceTimer = setTimeout(() => {
        if (this.settings.settings.value()?.windowPosition === 'last') {
          this.bridge.saveWindowPosition(payload.x, payload.y);
        }
      }, 300);
    }).then(fn => { this.unlistenWindowMoved = fn; });
  }

  ngOnDestroy(): void {
    this.unlistenPopupShown?.();
    this.unlistenWindowMoved?.();
    if (this.moveDebounceTimer) clearTimeout(this.moveDebounceTimer);
  }

  protected setTab(tab: string): void {
    this.activeTab.set(tab as Tab);
    this.selectedIndex.set(0);
  }

  protected setFilter(filter: Filter): void {
    this.activeFilter.set(filter);
    this.selectedIndex.set(0);
  }

  protected selectEntry(index: number): void {
    this.selectedIndex.set(index);
    const entry = this.filteredEntries()[index];
    if (!entry) return;
    if (entry.kind === 'image') {
      this.router.navigate(['/preview'], { queryParams: { id: entry.id } });
    } else {
      this.clipboard.setClipboard(entry.id);
    }
  }

  protected deleteEntry(index: number): void {
    const entry = this.filteredEntries()[index];
    if (!entry) return;
    const newLen = this.filteredEntries().length - 1;
    this.clipboard.deleteEntry(entry.id);
    if (newLen <= 0) {
      this.selectedIndex.set(0);
    } else if (this.selectedIndex() >= newLen) {
      this.selectedIndex.set(newLen - 1);
    }
  }

  protected pinEntry(index: number): void {
    const entry = this.filteredEntries()[index];
    if (!entry) return;
    this.clipboard.togglePin(entry.id);
  }

  protected onSearchInput(event: Event): void {
    this.searchQuery.set((event.target as HTMLInputElement).value);
    this.selectedIndex.set(0);
  }

  protected clearSearch(): void {
    this.searchQuery.set('');
    this.isSearching.set(false);
    this.selectedIndex.set(0);
    this.hostEl.nativeElement.focus();
  }

  protected onKeyDown(event: KeyboardEvent): void {
    if (this.isSearching()) {
      switch (event.key) {
        case 'ArrowDown':
          event.preventDefault();
          this.moveSelection(1);
          break;
        case 'ArrowUp':
          event.preventDefault();
          this.moveSelection(-1);
          break;
        case 'Enter':
          event.preventDefault();
          this.copySelected();
          break;
        case 'Escape':
          event.preventDefault();
          this.clearSearch();
          break;
      }
      return;
    }

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.moveSelection(1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.moveSelection(-1);
        break;
      case 'Enter':
        event.preventDefault();
        this.copySelected();
        break;
      case 'Delete':
        event.preventDefault();
        this.deleteEntry(this.selectedIndex());
        break;
      case 'Escape':
        event.preventDefault();
        this.bridge.hidePopup();
        break;
      default:
        if (event.key.length === 1 && !event.ctrlKey && !event.altKey && !event.metaKey) {
          if (event.key.toLowerCase() === 'p') {
            event.preventDefault();
            this.pinSelected();
          } else {
            this.isSearching.set(true);
            this.searchQuery.set(event.key);
            setTimeout(() => {
              const input = this.searchInput?.nativeElement;
              if (input) {
                input.value = this.searchQuery();
                input.focus();
                input.setSelectionRange(input.value.length, input.value.length);
              }
            }, 0);
          }
        }
    }
  }

  private pinSelected(): void {
    const entry = this.filteredEntries()[this.selectedIndex()];
    if (!entry) return;
    this.clipboard.togglePin(entry.id);
  }

  private moveSelection(delta: number): void {
    const len = this.filteredEntries().length;
    if (len === 0) return;
    const next = Math.max(0, Math.min(len - 1, this.selectedIndex() + delta));
    this.selectedIndex.set(next);
    this.scrollSelectedIntoView();
  }

  private copySelected(): void {
    this.selectEntry(this.selectedIndex());
  }

  private scrollSelectedIntoView(): void {
    if (!this.listContainer) return;
    const items = this.listContainer.nativeElement.querySelectorAll<HTMLElement>('.entry-item');
    const item = items[this.selectedIndex()];
    item?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
}
