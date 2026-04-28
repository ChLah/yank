import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { UnlistenFn } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { Router, RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideClipboard, lucideSearch, lucideSettings, lucideX } from '@ng-icons/lucide';
import { ClipboardEntryComponent } from './clipboard-entry.component';
import { SnippetItemComponent } from './snippet-item.component';
import { PlaceholderOverlayComponent } from './placeholder-overlay.component';
import { NewSnippetFormComponent } from './new-snippet-form.component';
import { PageHeaderComponent } from '../../shared/ui/page-header/page-header.component';
import { EmptyStateComponent } from '../../shared/ui/empty-state/empty-state.component';
import { KeyboardHintComponent } from '../../shared/ui/keyboard-hint/keyboard-hint.component';
import { TransformPickerComponent } from './transform-picker.component';
import { ClipboardService } from '../../core/services/clipboard.service';
import { SnippetsService } from '../../core/services/snippets.service';
import { TauriBridgeService } from '../../core/services/tauri-bridge.service';
import { SettingsService } from '../../core/services/settings.service';
import { Snippet } from '../../core/models/snippet.model';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmBadge } from '@spartan-ng/helm/badge';
import { HlmIcon } from '@spartan-ng/helm/icon';
import { HlmTabs, HlmTabsList, HlmTabsTrigger } from '@spartan-ng/helm/tabs';
import { TranslatePipe } from '@ngx-translate/core';

type Tab    = 'recent' | 'pinned' | 'snippets';
type Filter = 'all' | 'text' | 'image';

@Component({
  selector: 'app-clipboard-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ClipboardEntryComponent, SnippetItemComponent, PlaceholderOverlayComponent, NewSnippetFormComponent,
    RouterLink, NgIcon, HlmIcon, HlmButton, HlmBadge, HlmTabs, HlmTabsList, HlmTabsTrigger,
    TranslatePipe, PageHeaderComponent, EmptyStateComponent, KeyboardHintComponent, TransformPickerComponent,
  ],
  providers: [provideIcons({ lucideClipboard, lucideSettings, lucideSearch, lucideX })],
  host: {
    '(keydown)': 'onKeyDown($event)',
    '(click)':   'onHostClick()',
    'tabindex':  '0',
    'class':     'block outline-none h-full',
  },
  template: `
    <div class="flex flex-col h-full bg-background rounded-xl overflow-hidden border border-border shadow-2xl">

      <!-- Header -->
      <app-page-header>
        <ng-container start>
          <ng-icon hlm size="sm" name="lucideClipboard" class="text-muted-foreground shrink-0" />
          <span class="text-[13px] font-semibold text-foreground tracking-tight">{{ 'CLIPBOARD.TITLE' | translate }}</span>
          @if (activeTab() !== 'snippets' && allEntries().length > 0) {
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
      <div class="flex items-center justify-between px-3.5 h-[34px] shrink-0 bg-card/50 border-b border-border">
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
        @if (activeTab() !== 'snippets') {
          <div class="flex items-center gap-1">
            @for (f of filters; track f.value) {
              <button
                class="text-[11px] px-2 py-0.5 rounded-full border transition-colors"
                [class]="activeFilter() === f.value
                  ? 'bg-brand/20 text-brand-300 border-brand/30'
                  : 'text-muted-foreground border-transparent hover:text-foreground'"
                (click)="setFilter(f.value)">
                {{ f.labelKey | translate }}
              </button>
            }
          </div>
        }
      </div>

      <!-- Search bar (animated slide-in, hidden in Snippets tab) -->
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
      <div class="relative flex-1 overflow-y-auto scrollbar-thin" #listContainer>

        @if (activeTab() === 'snippets') {

          <!-- Placeholder fill-in overlay -->
          @if (showPlaceholderOverlay() && placeholderSnippet()) {
            <app-placeholder-overlay
              [content]="placeholderSnippet()!.content"
              (confirmed)="onPlaceholderConfirmed($event)"
              (cancelled)="onPlaceholderCancelled()"
            />
          }

          <!-- Snippet list -->
          @if (snippetsService.snippets.isLoading()) {
            <div class="py-1">
              @for (skeleton of skeletons; track $index) {
                <div class="flex items-center gap-3 pl-5 pr-4 py-2.5 border-l-2 border-l-transparent">
                  <div class="flex-1 space-y-1.5">
                    <div class="h-3 bg-muted rounded animate-pulse" [style.width.%]="55 + ($index % 3) * 15"></div>
                    <div class="h-2 bg-muted rounded animate-pulse w-20 opacity-50"></div>
                  </div>
                </div>
              }
            </div>
          } @else if (allSnippets().length === 0 && !showNewSnippetForm()) {
            <app-empty-state
              icon="lucideClipboard"
              [title]="'SNIPPETS.EMPTY' | translate"
              [hint]="'SNIPPETS.EMPTY_HINT' | translate"
            />
          } @else {
            <div class="py-1">
              @if (showNewSnippetForm()) {
                <app-new-snippet-form
                  (saved)="onSnippetCreated($event)"
                  (cancelled)="onSnippetFormCancelled()"
                />
              }
              @for (snippet of allSnippets(); track snippet.id; let i = $index) {
                <div class="snippet-item">
                  <app-snippet-item
                    [snippet]="snippet"
                    [selected]="snippetSelectedIndex() === i"
                    [editMode]="editingSnippetId() === snippet.id"
                    (select)="selectSnippet(i)"
                    (delete)="deleteSnippetByIndex(i)"
                    (editConfirm)="onSnippetEditConfirm($event)"
                    (editCancel)="onSnippetEditCancel()"
                  />
                </div>
              }
            </div>
          }

        } @else {

          <!-- Clipboard list (Recent / Pinned) -->
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
                <div class="entry-item relative">
                  <app-clipboard-entry
                    [entry]="entry"
                    [selected]="selectedIndex() === i"
                    [editMode]="editingEntryId() === entry.id"
                    (select)="selectEntry(i)"
                    (delete)="deleteEntry(i)"
                    (pin)="pinEntry(i)"
                    (editConfirm)="onEditConfirm($event)"
                    (editCancel)="onEditCancel()"
                  />
                  @if (showTransformPicker() && selectedIndex() === i && entry.kind === 'text') {
                    <app-transform-picker
                      [content]="entry.content ?? ''"
                      (applied)="onTransformApplied($event)"
                      (cancelled)="onTransformCancelled()"
                      (click)="$event.stopPropagation()"
                    />
                  }
                </div>
              }
            </div>
          }

        }
      </div>

      @if (duplicateError()) {
        <div class="px-3.5 py-1.5 bg-destructive/10 border-t border-destructive/20 text-[11px] text-destructive shrink-0 animate-slide-up">
          {{ 'TRANSFORM.DUPLICATE_ERROR' | translate }}
        </div>
      }

      @if (editCopyFailed()) {
        <div class="px-3.5 py-1.5 bg-destructive/10 border-t border-destructive/20 text-[11px] text-destructive shrink-0 animate-slide-up">
          {{ 'CLIPBOARD.EDIT_COPY_FAILED' | translate }}
        </div>
      }

      <!-- Footer -->
      <div class="px-3.5 py-1.5 flex flex-col gap-1 shrink-0 bg-card border-t border-border">
        @if (activeTab() === 'snippets') {
          <div class="flex items-center gap-2">
            <app-keyboard-hint key="↑↓" [label]="'CLIPBOARD.HINT_NAV' | translate" />
            <app-keyboard-hint key="↵" [label]="'SNIPPETS.HINT_PASTE' | translate" />
            <app-keyboard-hint key="E" [label]="'SNIPPETS.HINT_EDIT' | translate" />
            <app-keyboard-hint key="⌫" [label]="'SNIPPETS.HINT_DELETE' | translate" />
            <app-keyboard-hint key="N" [label]="'SNIPPETS.HINT_NEW' | translate" />
            <app-keyboard-hint key="Esc" [label]="'CLIPBOARD.HINT_CLOSE' | translate" class="ml-auto" />
          </div>
        } @else {
          <div class="flex items-center gap-2">
            <app-keyboard-hint key="↑↓" [label]="'CLIPBOARD.HINT_NAV' | translate" />
            <app-keyboard-hint key="↵" [label]="'CLIPBOARD.HINT_PASTE' | translate" />
            <app-keyboard-hint key="⇧↵" [label]="'TRANSFORM.HINT' | translate" />
            <span class="ml-auto text-[10px] text-muted-foreground whitespace-nowrap">
              {{ 'CLIPBOARD.HINT_SEARCH' | translate }}
            </span>
          </div>
          <div class="flex items-center gap-2">
            <app-keyboard-hint key="⌫" [label]="'CLIPBOARD.HINT_DELETE' | translate" />
            <app-keyboard-hint key="P" [label]="'CLIPBOARD.HINT_PIN' | translate" />
            <app-keyboard-hint key="E" [label]="'CLIPBOARD.HINT_EDIT' | translate" />
            <app-keyboard-hint key="Ctrl+1–9" [label]="'CLIPBOARD.HINT_QUICK_PASTE' | translate" />
            <app-keyboard-hint key="Esc" [label]="'CLIPBOARD.HINT_CLOSE' | translate" class="ml-auto" />
          </div>
        }
      </div>
    </div>
  `,
})
export class ClipboardListComponent implements OnInit, OnDestroy {
  protected clipboard        = inject(ClipboardService);
  protected snippetsService  = inject(SnippetsService);
  private bridge             = inject(TauriBridgeService);
  private settings           = inject(SettingsService);
  private router             = inject(Router);
  private hostEl             = inject(ElementRef);
  private unlistenPopupShown?: UnlistenFn;
  private unlistenWindowMoved?: UnlistenFn;
  private moveDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private duplicateErrorTimer: ReturnType<typeof setTimeout> | null = null;
  private suppressPositionSave = false;

  // Clipboard tab state
  protected selectedIndex   = signal(0);
  protected editingEntryId  = signal<number | null>(null);
  protected editCopyFailed  = signal(false);
  private editCopyFailedTimer: ReturnType<typeof setTimeout> | null = null;
  protected skeletons = Array.from({ length: 5 });

  protected activeTab    = signal<Tab>('recent');
  protected activeFilter = signal<Filter>('all');
  protected searchQuery  = signal('');
  protected isSearching  = signal(false);
  protected showTransformPicker = signal(false);
  protected duplicateError      = signal(false);

  // Snippets tab state
  protected snippetSelectedIndex   = signal(0);
  protected editingSnippetId       = signal<number | null>(null);
  protected showNewSnippetForm     = signal(false);
  protected showPlaceholderOverlay = signal(false);
  protected placeholderSnippet     = signal<Snippet | null>(null);

  protected tabs = [
    { labelKey: 'CLIPBOARD.TAB_RECENT',  value: 'recent'   as Tab },
    { labelKey: 'CLIPBOARD.TAB_PINNED',  value: 'pinned'   as Tab },
    { labelKey: 'SNIPPETS.TAB',          value: 'snippets' as Tab },
  ];

  protected filters = [
    { labelKey: 'CLIPBOARD.FILTER_ALL',   value: 'all'   as Filter },
    { labelKey: 'CLIPBOARD.FILTER_TEXT',  value: 'text'  as Filter },
    { labelKey: 'CLIPBOARD.FILTER_IMAGE', value: 'image' as Filter },
  ];

  protected allEntries  = computed(() => this.clipboard.entries.value() ?? []);
  protected allSnippets = computed(() => this.snippetsService.snippets.value() ?? []);
  protected pinnedCount = computed(() => this.allEntries().filter(e => e.pinned).length);

  protected filteredEntries = computed(() => {
    let list = this.allEntries();
    if (this.activeTab() === 'pinned')  list = list.filter(e => e.pinned);
    if (this.activeFilter() !== 'all') list = list.filter(e => e.kind === this.activeFilter());
    const q = this.searchQuery().toLowerCase().trim();
    if (q) list = list.filter(e => e.content?.toLowerCase().includes(q));
    return list;
  });

  private listContainer = viewChild.required<ElementRef<HTMLElement>>('listContainer');
  private searchInput   = viewChild<ElementRef<HTMLInputElement>>('searchInput');

  ngOnInit(): void {
    this.hostEl.nativeElement.focus();
    this.bridge.onPopupShown(() => {
      this.editingEntryId.set(null);
      this.activeTab.set('recent');
      this.activeFilter.set('all');
      this.clearSearch();
      this.editingSnippetId.set(null);
      this.showNewSnippetForm.set(false);
      this.showPlaceholderOverlay.set(false);
      this.placeholderSnippet.set(null);
      this.snippetSelectedIndex.set(0);
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
    if (this.duplicateErrorTimer) clearTimeout(this.duplicateErrorTimer);
    if (this.editCopyFailedTimer) clearTimeout(this.editCopyFailedTimer);
  }

  protected setTab(tab: string): void {
    this.editingEntryId.set(null);
    this.clearSearch();
    this.activeTab.set(tab as Tab);
    this.selectedIndex.set(0);
    if (tab !== 'snippets') {
      this.editingSnippetId.set(null);
      this.showNewSnippetForm.set(false);
      this.showPlaceholderOverlay.set(false);
      this.placeholderSnippet.set(null);
    }
  }

  protected setFilter(filter: Filter): void {
    this.editingEntryId.set(null);
    this.activeFilter.set(filter);
    this.selectedIndex.set(0);
  }

  protected selectEntry(index: number): void {
    if (this.editingEntryId() !== null) {
      const clickedEntry = this.filteredEntries()[index];
      if (!shouldCancelEditOnSelect(clickedEntry?.id, this.editingEntryId()!)) return;
      this.editingEntryId.set(null);
      this.selectedIndex.set(index);
      return;
    }
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
    if (event.ctrlKey && event.key === 'Tab') {
      event.preventDefault();
      this.cycleTab(event.shiftKey ? -1 : 1);
      return;
    }

    if (this.activeTab() === 'snippets') {
      this.onSnippetKeyDown(event);
    } else {
      this.onClipboardKeyDown(event);
    }
  }

  private onClipboardKeyDown(event: KeyboardEvent): void {
    if (this.showTransformPicker()) return;

    if (this.editingEntryId() !== null) {
      if (resolveEditModeAction(event.key) === 'cancel-navigate') {
        this.editingEntryId.set(null);
      } else {
        return;
      }
    }

    const quickPasteDigit = getQuickPasteDigit(event);
    if (quickPasteDigit !== null) {
      event.preventDefault();
      const idx = quickPasteDigit - 1;
      if (idx < this.filteredEntries().length) {
        this.selectEntry(idx);
      }
      return;
    }

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
          if (event.shiftKey) {
            this.openTransformPicker();
          } else {
            this.copySelected();
          }
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
        if (event.shiftKey) {
          this.openTransformPicker();
        } else {
          this.copySelected();
        }
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
          } else if (event.key.toLowerCase() === 'e') {
            event.preventDefault();
            this.enterEditMode();
          } else {
            this.isSearching.set(true);
            this.searchQuery.set(event.key);
            setTimeout(() => {
              const input = this.searchInput()?.nativeElement;
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

  private onSnippetKeyDown(event: KeyboardEvent): void {
    if (this.showNewSnippetForm()) return;
    if (this.showPlaceholderOverlay()) return;

    if (this.editingSnippetId() !== null) {
      if (resolveEditModeAction(event.key) === 'cancel-navigate') {
        this.editingSnippetId.set(null);
      } else {
        return;
      }
    }

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.moveSnippetSelection(1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.moveSnippetSelection(-1);
        break;
      case 'Enter':
        event.preventDefault();
        this.pasteOrOverlaySnippet();
        break;
      case 'Delete':
        event.preventDefault();
        this.deleteSnippetByIndex(this.snippetSelectedIndex());
        break;
      case 'Escape':
        event.preventDefault();
        this.bridge.hidePopup();
        break;
      default:
        if (event.key.length === 1 && !event.ctrlKey && !event.altKey && !event.metaKey) {
          if (event.key.toLowerCase() === 'e') {
            event.preventDefault();
            this.enterSnippetEditMode();
          } else if (event.key.toLowerCase() === 'n') {
            event.preventDefault();
            this.showNewSnippetForm.set(true);
          }
        }
    }
  }

  private enterEditMode(): void {
    const entry = this.filteredEntries()[this.selectedIndex()];
    if (!entry || entry.kind !== 'text') return;
    this.editingEntryId.set(entry.id);
  }

  protected async onEditConfirm(text: string): Promise<void> {
    this.editingEntryId.set(null);
    try {
      await this.bridge.setClipboardText(text);
      this.bridge.hidePopup();
    } catch {
      this.editCopyFailed.set(true);
      this.editCopyFailedTimer = setTimeout(() => {
        this.editCopyFailed.set(false);
      }, 2000);
    }
  }

  protected onEditCancel(): void {
    this.editingEntryId.set(null);
    this.hostEl.nativeElement.focus();
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

  protected onHostClick(): void {
    if (this.showTransformPicker()) {
      this.showTransformPicker.set(false);
      this.hostEl.nativeElement.focus();
    }
  }

  private openTransformPicker(): void {
    if (this.duplicateErrorTimer) {
      clearTimeout(this.duplicateErrorTimer);
      this.duplicateErrorTimer = null;
      this.duplicateError.set(false);
    }
    const entry = this.filteredEntries()[this.selectedIndex()];
    if (!entry || entry.kind !== 'text') return;
    this.showTransformPicker.set(true);
  }

  protected async onTransformApplied(event: { transformedContent: string; saveToHistory: boolean }): Promise<void> {
    const entry = this.filteredEntries()[this.selectedIndex()];
    this.showTransformPicker.set(false);
    if (!entry) return;

    try {
      await this.bridge.setClipboardText(event.transformedContent);

      if (event.saveToHistory) {
        try {
          await this.bridge.updateEntryContent(entry.id, event.transformedContent);
          this.clipboard.entries.reload();
        } catch {
          this.duplicateError.set(true);
          this.duplicateErrorTimer = setTimeout(() => {
            this.duplicateError.set(false);
            this.bridge.hidePopup();
          }, 2000);
          return;
        }
      }

      this.bridge.hidePopup();
    } catch {
      this.bridge.hidePopup();
    }
  }

  protected onTransformCancelled(): void {
    this.showTransformPicker.set(false);
    this.hostEl.nativeElement.focus();
  }

  private cycleTab(direction: 1 | -1): void {
    const allTabs: Tab[] = ['recent', 'pinned', 'snippets'];
    const idx  = allTabs.indexOf(this.activeTab());
    const next = allTabs[(idx + direction + allTabs.length) % allTabs.length];
    this.setTab(next);
  }

  private pasteOrOverlaySnippet(): void {
    const snippet = this.allSnippets()[this.snippetSelectedIndex()];
    if (!snippet) return;
    if (/\{\{[a-zA-Z0-9_-]+\}\}/.test(snippet.content)) {
      this.placeholderSnippet.set(snippet);
      this.showPlaceholderOverlay.set(true);
    } else {
      this.bridge.setClipboardText(snippet.content).then(() => this.bridge.hidePopup());
    }
  }

  private enterSnippetEditMode(): void {
    const snippet = this.allSnippets()[this.snippetSelectedIndex()];
    if (!snippet) return;
    this.editingSnippetId.set(snippet.id);
  }

  protected selectSnippet(index: number): void {
    this.snippetSelectedIndex.set(index);
  }

  protected deleteSnippetByIndex(index: number): void {
    const snippet = this.allSnippets()[index];
    if (!snippet) return;
    const newLen = this.allSnippets().length - 1;
    this.snippetsService.deleteSnippet(snippet.id);
    if (newLen <= 0) {
      this.snippetSelectedIndex.set(0);
    } else if (this.snippetSelectedIndex() >= newLen) {
      this.snippetSelectedIndex.set(newLen - 1);
    }
  }

  protected async onSnippetCreated(data: { title: string; content: string }): Promise<void> {
    this.showNewSnippetForm.set(false);
    await this.snippetsService.createSnippet(data.title, data.content);
    this.snippetSelectedIndex.set(0);
  }

  protected onSnippetFormCancelled(): void {
    this.showNewSnippetForm.set(false);
    this.hostEl.nativeElement.focus();
  }

  protected async onSnippetEditConfirm(data: { title: string; content: string }): Promise<void> {
    const id = this.editingSnippetId();
    if (id === null) return;
    this.editingSnippetId.set(null);
    await this.snippetsService.updateSnippet(id, data.title, data.content);
  }

  protected onSnippetEditCancel(): void {
    this.editingSnippetId.set(null);
    this.hostEl.nativeElement.focus();
  }

  protected async onPlaceholderConfirmed(text: string): Promise<void> {
    this.showPlaceholderOverlay.set(false);
    this.placeholderSnippet.set(null);
    await this.bridge.setClipboardText(text);
    this.bridge.hidePopup();
  }

  protected onPlaceholderCancelled(): void {
    this.showPlaceholderOverlay.set(false);
    this.placeholderSnippet.set(null);
    this.hostEl.nativeElement.focus();
  }

  private moveSnippetSelection(delta: number): void {
    const len = this.allSnippets().length;
    if (len === 0) return;
    const next = Math.max(0, Math.min(len - 1, this.snippetSelectedIndex() + delta));
    this.snippetSelectedIndex.set(next);
    this.scrollSnippetSelectedIntoView();
  }

  private scrollSnippetSelectedIntoView(): void {
    const items = this.listContainer().nativeElement.querySelectorAll<HTMLElement>('.snippet-item');
    const item  = items[this.snippetSelectedIndex()];
    item?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  private scrollSelectedIntoView(): void {
    const items = this.listContainer().nativeElement.querySelectorAll<HTMLElement>('.entry-item');
    const item = items[this.selectedIndex()];
    item?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
}

/** Arrow keys cancel-then-navigate; all other keys are blocked while in edit mode. Exported for unit testing. */
export function resolveEditModeAction(key: string): 'cancel-navigate' | 'block' {
  return (key === 'ArrowDown' || key === 'ArrowUp') ? 'cancel-navigate' : 'block';
}

/**
 * Returns true when clicking `clickedEntryId` should cancel edit mode
 * (i.e. the user clicked a *different* entry). Exported for unit testing.
 */
export function shouldCancelEditOnSelect(
  clickedEntryId: number | undefined,
  editingEntryId: number,
): boolean {
  return clickedEntryId !== editingEntryId;
}

/** Returns the 1-based digit (1–9) if the event is a Ctrl-only digit shortcut, otherwise null. Exported for unit testing. */
export function getQuickPasteDigit(event: KeyboardEvent): number | null {
  if (!event.ctrlKey || event.shiftKey || event.altKey || event.metaKey) return null;
  const digit = parseInt(event.key, 10);
  return digit >= 1 && digit <= 9 ? digit : null;
}
