import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  OnDestroy,
  OnInit,
  afterNextRender,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { UnlistenFn } from '@tauri-apps/api/event';
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
  moveItemInArray,
} from '@angular/cdk/drag-drop';
import { SnippetItemComponent } from './snippet-item.component';
import { SnippetFolderHeaderComponent } from './snippet-folder-header.component';
import { PlaceholderOverlayComponent, extractPlaceholders } from './placeholder-overlay.component';
import { NewSnippetFormComponent } from './new-snippet-form.component';
import { SkeletonListComponent } from '../../shared/ui/skeleton-list/skeleton-list.component';
import { EmptyStateComponent } from '../../shared/ui/empty-state/empty-state.component';
import { SnippetsService } from '../../core/services/snippets.service';
import { TauriBridgeService } from '../../core/services/tauri-bridge.service';
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

    @if (snippetsService.snippets.isLoading()) {
      <app-skeleton-list />
    } @else if (snippetsService.snippets.error()) {
      <app-empty-state
        icon="lucideAlertCircle"
        [title]="'CLIPBOARD.ERROR_LOAD' | translate"
        variant="destructive"
      >
        <button hlmBtn variant="link" size="sm" (click)="snippetsService.snippets.reload()">
          {{ 'CLIPBOARD.TRY_AGAIN' | translate }}
        </button>
      </app-empty-state>
    } @else if (allSnippets().length === 0 && !showNewSnippetForm()) {
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
                [count]="generalSnippets().length"
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
              @for (snippet of generalSnippets(); track snippet.id) {
                <div
                  class="snippet-item"
                  cdkDrag
                  [cdkDragData]="snippet"
                  [cdkDragDisabled]="editingSnippetId() !== null || showNewSnippetForm()"
                >
                  <app-snippet-item
                    [snippet]="snippet"
                    [selected]="snippetSelectedIndex() === allSnippets().indexOf(snippet)"
                    [editMode]="editingSnippetId() === snippet.id"
                    (select)="selectSnippet(allSnippets().indexOf(snippet))"
                    (delete)="deleteSnippetByIndex(allSnippets().indexOf(snippet))"
                    (editConfirm)="onSnippetEditConfirm($event)"
                    (editCancel)="onSnippetEditCancel()"
                  />
                </div>
              }
            </div>
          }
        </div>

        <div cdkDropList id="folder-reorder" (cdkDropListDropped)="onFolderDrop($event)">
          @for (folder of userFolders(); track folder.id) {
            <div
              cdkDrag
              [cdkDragData]="folder"
              class="folder-section group/folder border-b border-border/20"
            >
              <div
                *cdkDragPlaceholder
                class="h-7 mx-2 my-0.5 rounded border border-dashed border-border/50 bg-muted/20"
              ></div>
              <div
                class="relative flex items-center"
                cdkDropList
                [id]="'folder-header-' + folder.id"
                [cdkDropListConnectedTo]="snippetBodyIds()"
                [cdkDropListSortingDisabled]="true"
                (cdkDropListDropped)="onSnippetDroppedOnFolderHeader($event, folder.id)"
              >
                <span
                  cdkDragHandle
                  class="opacity-0 group-hover/folder:opacity-100 cursor-grab active:cursor-grabbing shrink-0 text-muted-foreground transition-opacity pl-1"
                >
                  <ng-icon hlm size="xs" name="lucideGripVertical" />
                </span>
                <app-snippet-folder-header
                  class="flex-1 min-w-0"
                  [folder]="folder"
                  [isGeneral]="false"
                  [isExpanded]="isFolderExpanded(folder.id)"
                  [count]="getSnippetsByFolder(folder.id).length"
                  (toggleCollapse)="toggleFolder(folder.id)"
                  (rename)="onFolderRename(folder.id, $event)"
                  (delete)="onFolderDelete(folder.id)"
                />
              </div>
              @if (isFolderExpanded(folder.id)) {
                <div
                  cdkDropList
                  [id]="'folder-body-' + folder.id"
                  class="pl-3"
                  [cdkDropListConnectedTo]="allSnippetTargetIds()"
                  [cdkDropListData]="folder.id"
                  (cdkDropListDropped)="onSnippetDrop($any($event))"
                >
                  @for (snippet of getSnippetsByFolder(folder.id); track snippet.id) {
                    <div
                      class="snippet-item"
                      cdkDrag
                      [cdkDragData]="snippet"
                      [cdkDragDisabled]="editingSnippetId() !== null || showNewSnippetForm()"
                    >
                      <app-snippet-item
                        [snippet]="snippet"
                        [selected]="snippetSelectedIndex() === allSnippets().indexOf(snippet)"
                        [editMode]="editingSnippetId() === snippet.id"
                        (select)="selectSnippet(allSnippets().indexOf(snippet))"
                        (delete)="deleteSnippetByIndex(allSnippets().indexOf(snippet))"
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
export class SnippetsTabComponent implements OnInit, OnDestroy {
  protected snippetsService = inject(SnippetsService);
  private bridge = inject(TauriBridgeService);
  private hostEl = inject(ElementRef);
  private injector = inject(Injector);
  private unlistenPopupShown?: UnlistenFn;

  protected snippetSelectedIndex = signal(0);
  protected editingSnippetId = signal<number | null>(null);
  protected showNewSnippetForm = signal(false);
  protected showPlaceholderOverlay = signal(false);
  protected placeholderSnippet = signal<Snippet | null>(null);
  protected expandedFolderIds = signal<Set<string>>(new Set(['general']));
  protected addingFolder = signal(false);
  protected newFolderName = signal('');

  protected readonly generalFolder: SnippetFolder = { id: -1, name: '', sortOrder: -1 };

  private newFolderInputRef = viewChild<ElementRef>('newFolderInput');

  protected allSnippets = computed(() => {
    const snippets = this.snippetsService.snippets.value() ?? [];
    const folders = this.snippetsService.folders.value() ?? [];
    const general = snippets
      .filter((s) => s.folderId === null)
      .sort((a, b) => a.sortOrder - b.sortOrder);
    const folderSnippets = folders
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .flatMap((f) =>
        snippets.filter((s) => s.folderId === f.id).sort((a, b) => a.sortOrder - b.sortOrder),
      );
    return [...general, ...folderSnippets];
  });

  protected userFolders = computed(() =>
    (this.snippetsService.folders.value() ?? []).slice().sort((a, b) => a.sortOrder - b.sortOrder),
  );

  protected generalSnippets = computed(() =>
    (this.snippetsService.snippets.value() ?? [])
      .filter((s) => s.folderId === null)
      .sort((a, b) => a.sortOrder - b.sortOrder),
  );

  protected snippetBodyIds = computed(() => [
    'folder-body-general',
    ...this.userFolders().map((f) => 'folder-body-' + f.id),
  ]);

  protected allSnippetTargetIds = computed(() => [
    ...this.snippetBodyIds(),
    'folder-header-general',
    ...this.userFolders().map((f) => 'folder-header-' + f.id),
  ]);

  protected getSnippetsByFolder(folderId: number): Snippet[] {
    return (this.snippetsService.snippets.value() ?? [])
      .filter((s) => s.folderId === folderId)
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }

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

  ngOnInit(): void {
    this.snippetsService.folders.reload();
    this.bridge
      .onPopupShown(() => this.resetState())
      .then((fn) => {
        this.unlistenPopupShown = fn;
      });
  }

  ngOnDestroy(): void {
    this.unlistenPopupShown?.();
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
    this.snippetsService.folders.reload();
    this.hostEl.nativeElement.focus();
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
    const newIndex = this.allSnippets().length;
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
    const all = this.snippetsService.snippets.value() ?? [];

    if (sourceFolderId === targetFolderId) {
      const folderItems =
        sourceFolderId === null
          ? all.filter((s) => s.folderId === null).sort((a, b) => a.sortOrder - b.sortOrder)
          : all
              .filter((s) => s.folderId === sourceFolderId)
              .sort((a, b) => a.sortOrder - b.sortOrder);
      const reordered = [...folderItems];
      moveItemInArray(reordered, event.previousIndex, event.currentIndex);
      const updated = all.map((s) => {
        const idx = reordered.findIndex((r) => r.id === s.id);
        return idx !== -1 ? { ...s, sortOrder: idx } : s;
      });
      this.snippetsService.reorderSnippet(updated, snippet.id, event.currentIndex);
      this.snippetSelectedIndex.set(this.allSnippets().findIndex((s) => s.id === snippet.id));
    } else {
      const updated = all
        .filter((s) => s.id !== snippet.id)
        .concat([{ ...snippet, folderId: targetFolderId }]);
      this.snippetsService.moveAndReorderSnippet(
        updated,
        snippet.id,
        targetFolderId,
        event.currentIndex,
      );
    }
  }

  protected onSnippetDroppedOnFolderHeader(
    event: CdkDragDrop<number | null>,
    targetFolderId: number | null,
  ): void {
    const snippet = event.item.data as Snippet;
    if (snippet.folderId === targetFolderId) return;
    const all = this.snippetsService.snippets.value() ?? [];
    const updated = all.map((s) => (s.id === snippet.id ? { ...s, folderId: targetFolderId } : s));
    this.snippetsService.moveSnippetToFolder(updated, snippet.id, targetFolderId);
  }

  protected onFolderDrop(event: CdkDragDrop<SnippetFolder[]>): void {
    if (event.previousIndex === event.currentIndex) return;
    const folder = event.item.data as SnippetFolder;
    const folders = [...this.userFolders()];
    moveItemInArray(folders, event.previousIndex, event.currentIndex);
    this.snippetsService.reorderFolder(folders, folder.id, event.currentIndex);
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
        const folders = this.snippetsService.folders.value() ?? [];
        if (folders.length > 0) this.toggleFolder(folders[folders.length - 1].id);
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
    const len = this.allSnippets().length;
    if (len === 0) return;
    const next = Math.max(0, Math.min(len - 1, this.snippetSelectedIndex() + delta));
    this.snippetSelectedIndex.set(next);
    this.scrollSnippetSelectedIntoView();
  }

  private pasteOrOverlaySnippet(): void {
    const snippet = this.allSnippets()[this.snippetSelectedIndex()];
    if (!snippet) return;
    if (extractPlaceholders(snippet.content).length > 0) {
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

  private scrollSnippetSelectedIntoView(): void {
    const items = (this.hostEl.nativeElement as HTMLElement).querySelectorAll<HTMLElement>(
      '.snippet-item',
    );
    items[this.snippetSelectedIndex()]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
}
