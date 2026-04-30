import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  OnInit,
  afterNextRender,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideGripVertical } from '@ng-icons/lucide';
import { TranslatePipe } from '@ngx-translate/core';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmIcon } from '@spartan-ng/helm/icon';
import {
  CdkDropList,
  CdkDrag,
  CdkDragDrop,
  CdkDragHandle,
  CdkDragPlaceholder,
} from '@angular/cdk/drag-drop';
import { SnippetItemComponent } from './snippet-item.component';
import { SnippetFolderHeaderComponent } from './snippet-folder-header.component';
import { PlaceholderOverlayComponent, extractPlaceholders } from './placeholder-overlay.component';
import { NewSnippetFormComponent } from './new-snippet-form.component';
import { SkeletonListComponent } from '../../shared/ui/skeleton-list/skeleton-list.component';
import { EmptyStateComponent } from '../../shared/ui/empty-state/empty-state.component';
import { SnippetTree, SnippetsService } from '../../core/services/snippets.service';
import { TauriBridgeService } from '../../core/services/tauri-bridge.service';
import { TauriEventBus } from '../../core/services/tauri-event-bus.service';
import { Snippet } from '../../core/models/snippet.model';
import { SnippetFolder } from '../../core/models/snippet-folder.model';
import { resolveEditModeAction } from './keyboard.utils';

@Component({
  selector: 'app-snippets-tab',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CdkDropList,
    CdkDrag,
    CdkDragHandle,
    CdkDragPlaceholder,
    SnippetItemComponent,
    SnippetFolderHeaderComponent,
    PlaceholderOverlayComponent,
    NewSnippetFormComponent,
    SkeletonListComponent,
    EmptyStateComponent,
    NgIcon,
    HlmIcon,
    HlmButton,
    TranslatePipe,
  ],
  providers: [provideIcons({ lucideGripVertical })],
  host: {
    '(keydown)': 'onKeyDown($event)',
    tabindex: '-1',
    class: 'relative flex-1 overflow-y-auto scrollbar-thin outline-none',
  },
  template: `
    @if (showPlaceholderOverlay() && placeholderSnippet()) {
      <app-placeholder-overlay
        [content]="placeholderSnippet()!.content"
        (confirmed)="onPlaceholderConfirmed($event)"
        (cancelled)="onPlaceholderCancelled()"
      />
    }

    @if (snippetsService.isLoading()) {
      <app-skeleton-list />
    } @else if (snippetsService.error()) {
      <app-empty-state
        icon="lucideAlertCircle"
        [title]="'CLIPBOARD.ERROR_LOAD' | translate"
        variant="destructive"
      >
        <button hlmBtn variant="link" size="sm" (click)="snippetsService.reload()">
          {{ 'CLIPBOARD.TRY_AGAIN' | translate }}
        </button>
      </app-empty-state>
    } @else if (tree().all.length === 0 && !showNewSnippetForm()) {
      <app-empty-state
        icon="lucideClipboard"
        [title]="'SNIPPETS.EMPTY' | translate"
        [hint]="'SNIPPETS.EMPTY_HINT' | translate"
      />
    } @else {
      <div class="py-1">
        <div class="folder-section relative group/folder border-b border-border/20">
          <div
            class="relative"
            cdkDropList
            id="folder-header-general"
            [cdkDropListConnectedTo]="snippetBodyIds()"
            [cdkDropListSortingDisabled]="true"
            (cdkDropListDropped)="onSnippetDroppedOnFolderHeader($event, null)"
          >
            <div class="flex items-center">
              <span aria-hidden="true" class="shrink-0 pl-1 opacity-0 pointer-events-none">
                <ng-icon hlm size="xs" name="lucideGripVertical" />
              </span>
              <app-snippet-folder-header
                class="flex-1 min-w-0"
                [folder]="generalFolder"
                [isGeneral]="true"
                [isExpanded]="isFolderExpanded('general')"
                [count]="tree().general.length"
                (toggleCollapse)="toggleFolder('general')"
              />
            </div>
          </div>
          @if (isFolderExpanded('general')) {
            <div
              cdkDropList
              id="folder-body-general"
              class="pl-3"
              [cdkDropListConnectedTo]="allSnippetTargetIds()"
              [cdkDropListData]="null"
              (cdkDropListDropped)="onSnippetDrop($any($event))"
            >
              @if (showNewSnippetForm()) {
                <app-new-snippet-form
                  (saved)="onSnippetCreated($event)"
                  (cancelled)="onSnippetFormCancelled()"
                />
              }
              @for (snippet of tree().general; track snippet.id) {
                <div
                  class="snippet-item"
                  cdkDrag
                  [cdkDragData]="snippet"
                  [cdkDragDisabled]="editingSnippetId() !== null || showNewSnippetForm()"
                >
                  <app-snippet-item
                    [snippet]="snippet"
                    [selected]="snippetSelectedIndex() === tree().all.indexOf(snippet)"
                    [editMode]="editingSnippetId() === snippet.id"
                    (select)="selectSnippet(tree().all.indexOf(snippet))"
                    (delete)="deleteSnippetByIndex(tree().all.indexOf(snippet))"
                    (editConfirm)="onSnippetEditConfirm($event)"
                    (editCancel)="onSnippetEditCancel()"
                  />
                </div>
              }
            </div>
          }
        </div>

        <div cdkDropList id="folder-reorder" (cdkDropListDropped)="onFolderDrop($event)">
          @for (fg of tree().folders; track fg.folder.id) {
            <div
              cdkDrag
              [cdkDragData]="fg.folder"
              class="folder-section group/folder border-b border-border/20"
            >
              <div
                *cdkDragPlaceholder
                class="h-7 mx-2 my-0.5 rounded border border-dashed border-border/50 bg-muted/20"
              ></div>
              <div
                class="relative flex items-center"
                cdkDropList
                [id]="'folder-header-' + fg.folder.id"
                [cdkDropListConnectedTo]="snippetBodyIds()"
                [cdkDropListSortingDisabled]="true"
                (cdkDropListDropped)="onSnippetDroppedOnFolderHeader($event, fg.folder.id)"
              >
                <span
                  cdkDragHandle
                  class="opacity-0 group-hover/folder:opacity-100 cursor-grab active:cursor-grabbing shrink-0 text-muted-foreground transition-opacity pl-1"
                >
                  <ng-icon hlm size="xs" name="lucideGripVertical" />
                </span>
                <app-snippet-folder-header
                  class="flex-1 min-w-0"
                  [folder]="fg.folder"
                  [isGeneral]="false"
                  [isExpanded]="isFolderExpanded(fg.folder.id)"
                  [count]="fg.snippets.length"
                  (toggleCollapse)="toggleFolder(fg.folder.id)"
                  (rename)="onFolderRename(fg.folder.id, $event)"
                  (delete)="onFolderDelete(fg.folder.id)"
                />
              </div>
              @if (isFolderExpanded(fg.folder.id)) {
                <div
                  cdkDropList
                  [id]="'folder-body-' + fg.folder.id"
                  class="pl-3"
                  [cdkDropListConnectedTo]="allSnippetTargetIds()"
                  [cdkDropListData]="fg.folder.id"
                  (cdkDropListDropped)="onSnippetDrop($any($event))"
                >
                  @for (snippet of fg.snippets; track snippet.id) {
                    <div
                      class="snippet-item"
                      cdkDrag
                      [cdkDragData]="snippet"
                      [cdkDragDisabled]="editingSnippetId() !== null || showNewSnippetForm()"
                    >
                      <app-snippet-item
                        [snippet]="snippet"
                        [selected]="snippetSelectedIndex() === tree().all.indexOf(snippet)"
                        [editMode]="editingSnippetId() === snippet.id"
                        (select)="selectSnippet(tree().all.indexOf(snippet))"
                        (delete)="deleteSnippetByIndex(tree().all.indexOf(snippet))"
                        (editConfirm)="onSnippetEditConfirm($event)"
                        (editCancel)="onSnippetEditCancel()"
                      />
                    </div>
                  }
                </div>
              }
            </div>
          }
        </div>

        @if (addingFolder()) {
          <div class="flex items-center gap-1.5 px-3 py-1">
            <input
              #newFolderInput
              type="text"
              [value]="newFolderName()"
              (input)="newFolderName.set($any($event.target).value)"
              (keydown)="onNewFolderKeyDown($event)"
              (blur)="saveNewFolder()"
              [placeholder]="'SNIPPETS.FOLDER_NAME_PLACEHOLDER' | translate"
              class="flex-1 min-w-0 bg-muted/50 text-[12px] text-foreground rounded px-2 py-1 outline-none focus:ring-1 focus:ring-brand/50"
            />
          </div>
        } @else {
          <button
            class="w-full text-left px-3 py-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
            (click)="startAddFolder()"
          >
            {{ 'SNIPPETS.FOLDER_ADD' | translate }}
          </button>
        }
      </div>
    }
  `,
})
export class SnippetsTabComponent implements OnInit {
  protected snippetsService = inject(SnippetsService);
  private bridge = inject(TauriBridgeService);
  private bus = inject(TauriEventBus);
  private hostEl = inject(ElementRef);
  private injector = inject(Injector);

  protected snippetSelectedIndex = signal(0);
  protected editingSnippetId = signal<number | null>(null);
  protected showNewSnippetForm = signal(false);
  protected showPlaceholderOverlay = signal(false);
  protected placeholderSnippet = signal<Snippet | null>(null);
  protected expandedFolderIds = signal<Set<string>>(new Set(['general']));
  protected addingFolder = signal(false);
  protected newFolderName = signal('');

  protected readonly generalFolder: SnippetFolder = { id: -1, name: '', sortOrder: -1 };
  protected readonly tree: () => SnippetTree = this.snippetsService.snippetTree;

  private newFolderInputRef = viewChild<ElementRef>('newFolderInput');

  protected snippetBodyIds = computed(() => [
    'folder-body-general',
    ...this.tree().folders.map((fg) => 'folder-body-' + fg.folder.id),
  ]);

  protected allSnippetTargetIds = computed(() => [
    ...this.snippetBodyIds(),
    'folder-header-general',
    ...this.tree().folders.map((fg) => 'folder-header-' + fg.folder.id),
  ]);

  protected isFolderExpanded(key: string | number): boolean {
    return this.expandedFolderIds().has(String(key));
  }

  protected toggleFolder(key: string | number): void {
    const id = String(key);
    const set = new Set(this.expandedFolderIds());
    if (set.has(id)) set.delete(id);
    else set.add(id);
    this.expandedFolderIds.set(set);
  }

  constructor() {
    this.bus.popupShown$.pipe(takeUntilDestroyed()).subscribe(() => this.resetState());
  }

  ngOnInit(): void {
    this.snippetsService.reload();
  }

  focus(): void {
    this.hostEl.nativeElement.focus();
  }

  private resetState(): void {
    this.editingSnippetId.set(null);
    this.showNewSnippetForm.set(false);
    this.showPlaceholderOverlay.set(false);
    this.placeholderSnippet.set(null);
    this.snippetSelectedIndex.set(0);
    this.addingFolder.set(false);
    this.newFolderName.set('');
    this.expandedFolderIds.set(new Set(['general']));
    this.snippetsService.reload();
    this.hostEl.nativeElement.focus();
  }

  protected selectSnippet(index: number): void {
    this.snippetSelectedIndex.set(index);
  }

  protected deleteSnippetByIndex(index: number): void {
    const snippet = this.tree().all[index];
    if (!snippet) return;
    const newLen = this.tree().all.length - 1;
    this.snippetsService.deleteSnippet(snippet.id);
    if (newLen <= 0) {
      this.snippetSelectedIndex.set(0);
    } else if (this.snippetSelectedIndex() >= newLen) {
      this.snippetSelectedIndex.set(newLen - 1);
    }
  }

  protected async onSnippetCreated(data: { title: string; content: string }): Promise<void> {
    this.showNewSnippetForm.set(false);
    const newIndex = this.tree().all.length;
    await this.snippetsService.createSnippet(data.title, data.content);
    this.snippetSelectedIndex.set(newIndex);
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

  protected onSnippetDrop(event: CdkDragDrop<number | null>): void {
    if (
      event.previousIndex === event.currentIndex &&
      event.container.id === event.previousContainer.id
    )
      return;
    const snippet = event.item.data as Snippet;
    const targetFolderId = event.container.data as number | null;
    const sourceFolderId = event.previousContainer.data as number | null;

    if (sourceFolderId === targetFolderId) {
      this.snippetsService.reorderSnippet(snippet.id, event.currentIndex);
      this.snippetSelectedIndex.set(this.tree().all.findIndex((s) => s.id === snippet.id));
    } else {
      this.snippetsService.moveAndReorderSnippet(snippet.id, targetFolderId, event.currentIndex);
    }
  }

  protected onSnippetDroppedOnFolderHeader(
    event: CdkDragDrop<number | null>,
    targetFolderId: number | null,
  ): void {
    const snippet = event.item.data as Snippet;
    if (snippet.folderId === targetFolderId) return;
    this.snippetsService.moveSnippetToFolder(snippet.id, targetFolderId);
  }

  protected onFolderDrop(event: CdkDragDrop<SnippetFolder[]>): void {
    if (event.previousIndex === event.currentIndex) return;
    const folder = event.item.data as SnippetFolder;
    this.snippetsService.reorderFolder(folder.id, event.currentIndex);
  }

  protected onFolderRename(id: number, name: string): void {
    this.snippetsService.renameFolder(id, name);
  }

  protected onFolderDelete(id: number): void {
    this.snippetsService.deleteFolder(id);
  }

  protected startAddFolder(): void {
    this.newFolderName.set('');
    this.addingFolder.set(true);
    afterNextRender(() => this.newFolderInputRef()?.nativeElement?.focus(), {
      injector: this.injector,
    });
  }

  protected saveNewFolder(): void {
    const name = this.newFolderName().trim();
    this.addingFolder.set(false);
    if (name) {
      this.snippetsService.createFolder(name).then(() => {
        const { folders } = this.tree();
        if (folders.length > 0) this.toggleFolder(folders[folders.length - 1].folder.id);
      });
    }
  }

  protected onNewFolderKeyDown(event: KeyboardEvent): void {
    event.stopPropagation();
    if (event.key === 'Enter') {
      event.preventDefault();
      (event.target as HTMLInputElement).blur();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      this.addingFolder.set(false);
    }
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

  protected onKeyDown(event: KeyboardEvent): void {
    if (event.ctrlKey && event.key === 'Tab') return; // bubble to shell

    if (this.showNewSnippetForm()) return;
    if (this.showPlaceholderOverlay()) return;

    if (this.editingSnippetId() !== null) {
      if (resolveEditModeAction(event.key) === 'cancel-navigate') {
        this.editingSnippetId.set(null);
      } else {
        event.stopPropagation();
        return;
      }
    }

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        event.stopPropagation();
        this.moveSnippetSelection(1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        event.stopPropagation();
        this.moveSnippetSelection(-1);
        break;
      case 'Enter':
        event.preventDefault();
        event.stopPropagation();
        this.pasteOrOverlaySnippet();
        break;
      case 'Delete':
        event.preventDefault();
        event.stopPropagation();
        this.deleteSnippetByIndex(this.snippetSelectedIndex());
        break;
      case 'Escape':
        event.preventDefault();
        event.stopPropagation();
        this.bridge.hidePopup();
        break;
      default:
        if (event.key.length === 1 && !event.ctrlKey && !event.altKey && !event.metaKey) {
          if (event.key.toLowerCase() === 'e') {
            event.preventDefault();
            event.stopPropagation();
            this.enterSnippetEditMode();
          } else if (event.key.toLowerCase() === 'n') {
            event.preventDefault();
            event.stopPropagation();
            this.showNewSnippetForm.set(true);
          }
        }
    }
  }

  private moveSnippetSelection(delta: number): void {
    const len = this.tree().all.length;
    if (len === 0) return;
    const next = Math.max(0, Math.min(len - 1, this.snippetSelectedIndex() + delta));
    this.snippetSelectedIndex.set(next);
    this.scrollSnippetSelectedIntoView();
  }

  private pasteOrOverlaySnippet(): void {
    const snippet = this.tree().all[this.snippetSelectedIndex()];
    if (!snippet) return;
    if (extractPlaceholders(snippet.content).length > 0) {
      this.placeholderSnippet.set(snippet);
      this.showPlaceholderOverlay.set(true);
    } else {
      this.bridge.setClipboardText(snippet.content).then(() => this.bridge.hidePopup());
    }
  }

  private enterSnippetEditMode(): void {
    const snippet = this.tree().all[this.snippetSelectedIndex()];
    if (!snippet) return;
    this.editingSnippetId.set(snippet.id);
  }

  private scrollSnippetSelectedIntoView(): void {
    const items = (this.hostEl.nativeElement as HTMLElement).querySelectorAll<HTMLElement>(
      '.snippet-item',
    );
    items[this.snippetSelectedIndex()]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
}
