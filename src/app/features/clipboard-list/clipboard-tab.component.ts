import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideSearch, lucideX } from '@ng-icons/lucide';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmIcon } from '@spartan-ng/helm/icon';
import { toast } from '@spartan-ng/brain/sonner';
import { ClipboardEntryComponent } from './clipboard-entry.component';
import { TransformPickerComponent } from './transform-picker.component';
import { SkeletonListComponent } from '../../shared/ui/skeleton-list/skeleton-list.component';
import { EmptyStateComponent } from '../../shared/ui/empty-state/empty-state.component';
import { ClipboardKindFilter, ClipboardService } from '../../core/services/clipboard.service';
import { TauriBridgeService } from '../../core/services/tauri-bridge.service';
import { TauriEventBus } from '../../core/services/tauri-event-bus.service';
import { ClipboardEntry } from '../../core/models/clipboard-entry.model';
import { resolveEditModeAction } from './keyboard.utils';
import { ClipboardSelection } from './clipboard-selection';

export type ClipboardTabType = 'recent' | 'pinned';

@Component({
  selector: 'app-clipboard-tab',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ClipboardEntryComponent,
    TransformPickerComponent,
    SkeletonListComponent,
    EmptyStateComponent,
    NgIcon,
    HlmIcon,
    HlmButton,
    TranslatePipe,
  ],
  providers: [provideIcons({ lucideSearch, lucideX })],
  host: {
    '(keydown)': 'onKeyDown($event)',
    '(click)': 'onHostClick()',
    tabindex: '-1',
    class: 'flex flex-col overflow-hidden outline-none',
  },
  template: `
    <!-- Filter row -->
    <div
      class="flex items-center justify-end px-3.5 h-[34px] shrink-0 bg-card/50 border-b border-border"
    >
      <div class="flex items-center gap-1">
        @for (f of filters; track f.value) {
          <button
            class="text-[11px] px-2 py-0.5 rounded-full border transition-colors"
            [class]="
              activeFilter() === f.value
                ? 'bg-brand/20 text-brand-300 border-brand/30'
                : 'text-muted-foreground border-transparent hover:text-foreground'
            "
            (click)="setFilter(f.value)"
          >
            {{ f.labelKey | translate }}
          </button>
        }
      </div>
    </div>

    <!-- Search bar (animated slide-in) -->
    <div
      class="overflow-hidden transition-all duration-150 ease-out shrink-0"
      [class]="isSearching() ? 'max-h-10 opacity-100 border-b border-border' : 'max-h-0 opacity-0'"
    >
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
            (click)="clearSearch()"
          >
            <ng-icon hlm size="sm" name="lucideX" />
          </button>
        }
      </div>
    </div>

    <!-- Content -->
    <div class="relative flex-1 overflow-y-auto scrollbar-thin" #listContainer>
      @if (clipboard.isLoading()) {
        <app-skeleton-list />
      } @else if (clipboard.error()) {
        <app-empty-state
          icon="lucideAlertCircle"
          [title]="'CLIPBOARD.ERROR_LOAD' | translate"
          variant="destructive"
        >
          <button hlmBtn variant="link" size="sm" (click)="clipboard.reload()">
            {{ 'CLIPBOARD.TRY_AGAIN' | translate }}
          </button>
        </app-empty-state>
      } @else if (filteredEntries().length === 0) {
        @if (tab() === 'pinned') {
          <app-empty-state
            icon="lucideBookmark"
            [title]="'CLIPBOARD.EMPTY_PINNED' | translate"
            [hint]="'CLIPBOARD.EMPTY_PINNED_HINT' | translate"
          />
        } @else if (searchQuery()) {
          <app-empty-state
            icon="lucideClipboard"
            [title]="'CLIPBOARD.EMPTY_NO_MATCHES' | translate: { term: searchQuery() }"
          />
        } @else {
          <app-empty-state icon="lucideClipboard" [title]="'CLIPBOARD.EMPTY_NOTHING' | translate" />
        }
      } @else {
        <div class="py-1">
          @for (entry of filteredEntries(); track entry.id; let i = $index) {
            <div class="entry-item relative">
              <app-clipboard-entry
                [entry]="entry"
                [selected]="selection.selectedIndex() === i"
                [editMode]="selection.editingEntry()?.id === entry.id"
                [ocrLoading]="ocrLoadingEntryId() === entry.id"
                [shortcutIndex]="i < 9 ? i + 1 : null"
                (select)="selectEntry(i)"
                (delete)="deleteEntry(i)"
                (pin)="pinEntry(i)"
                (editConfirm)="onEditConfirm($event)"
                (editCancel)="onEditCancel()"
              />
              @if (
                showTransformPicker() && selection.selectedIndex() === i && entry.kind === 'text'
              ) {
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
    </div>
  `,
})
export class ClipboardTabComponent {
  tab = input.required<ClipboardTabType>();
  selectedEntry = output<ClipboardEntry | null>();

  protected clipboard = inject(ClipboardService);
  private bridge = inject(TauriBridgeService);
  private bus = inject(TauriEventBus);
  private router = inject(Router);
  private translate = inject(TranslateService);
  private hostEl = inject(ElementRef);

  protected ocrLoadingEntryId = signal<number | null>(null);
  protected activeFilter = signal<ClipboardKindFilter>('all');
  protected searchQuery = signal('');
  protected isSearching = signal(false);
  protected showTransformPicker = signal(false);

  protected readonly filters: { labelKey: string; value: ClipboardKindFilter }[] = [
    { labelKey: 'CLIPBOARD.FILTER_ALL', value: 'all' },
    { labelKey: 'CLIPBOARD.FILTER_TEXT', value: 'text' },
    { labelKey: 'CLIPBOARD.FILTER_IMAGE', value: 'image' },
  ];

  protected filteredEntries = computed(() =>
    this.clipboard.filterEntries(this.tab() === 'pinned', this.activeFilter(), this.searchQuery()),
  );

  protected selection = new ClipboardSelection(this.filteredEntries);

  private listContainer = viewChild.required<ElementRef<HTMLElement>>('listContainer');
  private searchInput = viewChild<ElementRef<HTMLInputElement>>('searchInput');

  constructor() {
    this.bus.popupShown$.pipe(takeUntilDestroyed()).subscribe(() => this.resetState());
  }

  focus(): void {
    this.hostEl.nativeElement.focus();
  }

  private resetState(): void {
    this.selection.exitEditMode();
    this.selection.selectAt(0);
    this.activeFilter.set('all');
    this.clearSearch();
    this.showTransformPicker.set(false);
    this.ocrLoadingEntryId.set(null);
    this.emitSelectedEntry();
    this.hostEl.nativeElement.focus();
  }

  private emitSelectedEntry(): void {
    this.selectedEntry.emit(this.selection.selectedEntry());
  }

  protected setFilter(filter: ClipboardKindFilter): void {
    this.selection.exitEditMode();
    this.activeFilter.set(filter);
    this.selection.selectAt(0);
    this.emitSelectedEntry();
  }

  protected selectEntry(index: number): void {
    if (this.selection.editingEntry() !== null) {
      const clickedEntry = this.filteredEntries()[index];
      if (!shouldCancelEditOnSelect(clickedEntry?.id, this.selection.editingEntry()!.id)) return;
      this.selection.exitEditMode();
      this.selection.selectAt(index);
      this.emitSelectedEntry();
      return;
    }
    this.selection.selectAt(index);
    this.emitSelectedEntry();
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
    const currentIndex = this.selection.selectedIndex();
    const newLen = this.filteredEntries().length - 1;
    this.clipboard.deleteEntry(entry.id);
    this.selection.selectAt(Math.min(currentIndex, Math.max(0, newLen - 1)));
    this.emitSelectedEntry();
  }

  protected pinEntry(index: number): void {
    const entry = this.filteredEntries()[index];
    if (!entry) return;
    this.clipboard.togglePin(entry.id);
  }

  protected onSearchInput(event: Event): void {
    this.searchQuery.set((event.target as HTMLInputElement).value);
    this.emitSelectedEntry();
  }

  protected clearSearch(): void {
    this.searchQuery.set('');
    this.isSearching.set(false);
    this.emitSelectedEntry();
    this.hostEl.nativeElement.focus();
  }

  protected onHostClick(): void {
    if (this.showTransformPicker()) {
      this.showTransformPicker.set(false);
      this.hostEl.nativeElement.focus();
    }
  }

  protected async onEditConfirm(text: string): Promise<void> {
    this.selection.exitEditMode();
    try {
      await this.bridge.setClipboardText(text);
      this.bridge.hidePopup();
    } catch {
      toast.error(this.translate.instant('CLIPBOARD.EDIT_COPY_FAILED'));
    }
  }

  protected onEditCancel(): void {
    this.selection.exitEditMode();
    this.hostEl.nativeElement.focus();
  }

  protected async onTransformApplied(event: { transformedContent: string }): Promise<void> {
    this.showTransformPicker.set(false);
    await this.bridge.setClipboardText(event.transformedContent);
    this.bridge.hidePopup();
  }

  protected onTransformCancelled(): void {
    this.showTransformPicker.set(false);
    this.hostEl.nativeElement.focus();
  }

  protected onKeyDown(event: KeyboardEvent): void {
    if (event.ctrlKey && event.key === 'Tab') return; // let bubble to shell

    if (this.showTransformPicker()) return;

    if (this.selection.editingEntry() !== null) {
      if (resolveEditModeAction(event.key) === 'cancel-navigate') {
        this.selection.exitEditMode();
        this.hostEl.nativeElement.focus();
      } else {
        event.stopPropagation();
        return;
      }
    }

    const quickPasteDigit = getQuickPasteDigit(event);
    if (quickPasteDigit !== null) {
      event.preventDefault();
      event.stopPropagation();
      const idx = quickPasteDigit - 1;
      if (idx < this.filteredEntries().length) this.selectEntry(idx);
      return;
    }

    if (this.isSearching()) {
      switch (event.key) {
        case 'ArrowDown':
          event.preventDefault();
          event.stopPropagation();
          this.moveSelection(1);
          break;
        case 'ArrowUp':
          event.preventDefault();
          event.stopPropagation();
          this.moveSelection(-1);
          break;
        case 'Enter':
          event.preventDefault();
          event.stopPropagation();
          if (event.shiftKey) this.openTransformPicker();
          else this.copySelected();
          break;
        case 'Escape':
          event.preventDefault();
          event.stopPropagation();
          this.clearSearch();
          break;
      }
      return;
    }

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        event.stopPropagation();
        this.moveSelection(1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        event.stopPropagation();
        this.moveSelection(-1);
        break;
      case 'Enter':
        event.preventDefault();
        event.stopPropagation();
        if (event.shiftKey) this.openTransformPicker();
        else this.copySelected();
        break;
      case 'Delete':
        event.preventDefault();
        event.stopPropagation();
        this.deleteEntry(this.selection.selectedIndex());
        break;
      case 'Escape':
        event.preventDefault();
        event.stopPropagation();
        this.bridge.hidePopup();
        break;
      default:
        if (event.ctrlKey && !event.shiftKey && !event.altKey && !event.metaKey) {
          if (event.key.toLowerCase() === 'p') {
            event.preventDefault();
            event.stopPropagation();
            this.pinSelected();
          } else if (event.key.toLowerCase() === 'e') {
            event.preventDefault();
            event.stopPropagation();
            this.enterEditMode();
          } else if (isOcrTrigger(event)) {
            event.preventDefault();
            event.stopPropagation();
            this.triggerOcr();
          }
        } else if (event.key.length === 1 && !event.ctrlKey && !event.altKey && !event.metaKey) {
          this.isSearching.set(true);
          this.searchQuery.set(event.key);
          this.emitSelectedEntry();
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

  private moveSelection(delta: number): void {
    const len = this.filteredEntries().length;
    if (len === 0) return;
    const next = Math.max(0, Math.min(len - 1, this.selection.selectedIndex() + delta));
    this.selection.selectAt(next);
    this.emitSelectedEntry();
    this.scrollSelectedIntoView();
  }

  private copySelected(): void {
    this.selectEntry(this.selection.selectedIndex());
  }

  private pinSelected(): void {
    const entry = this.filteredEntries()[this.selection.selectedIndex()];
    if (!entry) return;
    this.clipboard.togglePin(entry.id);
  }

  private enterEditMode(): void {
    this.selection.enterEditMode();
  }

  private openTransformPicker(): void {
    const entry = this.filteredEntries()[this.selection.selectedIndex()];
    if (!entry || entry.kind !== 'text') return;
    this.showTransformPicker.set(true);
  }

  private async triggerOcr(): Promise<void> {
    const entry = this.filteredEntries()[this.selection.selectedIndex()];
    if (!entry || entry.kind !== 'image') return;
    if (this.ocrLoadingEntryId() !== null) return;

    this.ocrLoadingEntryId.set(entry.id);
    try {
      const text = await this.bridge.ocrImage(entry.id);
      if (text === '') {
        toast.error(this.translate.instant('OCR.NO_TEXT'));
      } else {
        this.clipboard.reload();
        this.selection.selectAt(0);
        this.emitSelectedEntry();
        toast.success(this.translate.instant('OCR.SUCCESS', { count: text.length }));
      }
    } catch (err: unknown) {
      const error = typeof err === 'string' ? err : 'Unknown error';
      toast.error(this.translate.instant('OCR.ERROR', { error }));
    } finally {
      this.ocrLoadingEntryId.set(null);
    }
  }

  private scrollSelectedIntoView(): void {
    const items = this.listContainer().nativeElement.querySelectorAll<HTMLElement>('.entry-item');
    items[this.selection.selectedIndex()]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
}

export function shouldCancelEditOnSelect(
  clickedEntryId: number | undefined,
  editingEntryId: number,
): boolean {
  return clickedEntryId !== editingEntryId;
}

export function getQuickPasteDigit(event: KeyboardEvent): number | null {
  if (!event.ctrlKey || event.shiftKey || event.altKey || event.metaKey) return null;
  const digit = parseInt(event.key, 10);
  return digit >= 1 && digit <= 9 ? digit : null;
}

export function isOcrTrigger(event: KeyboardEvent): boolean {
  return (
    event.key.toLowerCase() === 'o' &&
    event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey &&
    !event.metaKey
  );
}
