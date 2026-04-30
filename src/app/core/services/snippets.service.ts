import { Injectable, WritableSignal, computed, inject, resource } from '@angular/core';
import {
  computeMoveAndReorderSnippet,
  computeMoveSnippetToFolder,
  computeReorderFolders,
  computeReorderSnippets,
} from '../utils/snippet-mutations';
import { Snippet } from '../models/snippet.model';
import { SnippetFolder } from '../models/snippet-folder.model';
import { TauriBridgeService } from './tauri-bridge.service';

export interface SnippetTree {
  general: Snippet[];
  folders: { folder: SnippetFolder; snippets: Snippet[] }[];
  all: Snippet[];
}

@Injectable({ providedIn: 'root' })
export class SnippetsService {
  private bridge = inject(TauriBridgeService);

  private readonly _snippets = resource({
    loader: () => this.bridge.getSnippets(),
  });

  private readonly _folders = resource({
    loader: () => this.bridge.getSnippetFolders(),
  });

  readonly isLoading = computed(() => this._snippets.isLoading() || this._folders.isLoading());
  readonly error = computed(() => this._snippets.error() ?? this._folders.error());

  readonly snippetTree = computed<SnippetTree>(() => {
    const snippets = this._snippets.value() ?? [];
    const folders = this._folders.value() ?? [];
    const sortedFolders = [...folders].sort((a, b) => a.sortOrder - b.sortOrder);
    const general = snippets
      .filter((s) => s.folderId === null)
      .sort((a, b) => a.sortOrder - b.sortOrder);
    const folderGroups = sortedFolders.map((folder) => ({
      folder,
      snippets: snippets
        .filter((s) => s.folderId === folder.id)
        .sort((a, b) => a.sortOrder - b.sortOrder),
    }));
    return {
      general,
      folders: folderGroups,
      all: [...general, ...folderGroups.flatMap((fg) => fg.snippets)],
    };
  });

  reload(): void {
    this._snippets.reload();
    this._folders.reload();
  }

  private async applyOptimistically<T>(
    target: { value: WritableSignal<T | undefined> },
    transform: (current: T) => T,
    persist: () => Promise<void>,
  ): Promise<void> {
    const previous = target.value();
    if (previous === undefined) return;
    target.value.set(transform(previous));
    try {
      await persist();
    } catch {
      target.value.set(previous);
    }
  }

  async createSnippet(title: string, content: string): Promise<void> {
    await this.bridge.createSnippet(title, content);
    this._snippets.reload();
  }

  async updateSnippet(id: number, title: string, content: string): Promise<void> {
    await this.bridge.updateSnippet(id, title, content);
    this._snippets.reload();
  }

  async deleteSnippet(id: number): Promise<void> {
    await this.bridge.deleteSnippet(id);
    this._snippets.reload();
  }

  async reorderSnippet(id: number, newIndex: number): Promise<void> {
    await this.applyOptimistically(
      this._snippets,
      (s) => computeReorderSnippets(s, id, newIndex),
      () => this.bridge.reorderSnippet(id, newIndex),
    );
  }

  async moveSnippetToFolder(snippetId: number, targetFolderId: number | null): Promise<void> {
    await this.applyOptimistically(
      this._snippets,
      (s) => computeMoveSnippetToFolder(s, snippetId, targetFolderId),
      () => this.bridge.moveSnippetToFolder(snippetId, targetFolderId),
    );
  }

  async moveAndReorderSnippet(
    snippetId: number,
    targetFolderId: number | null,
    newIndex: number,
  ): Promise<void> {
    await this.applyOptimistically(
      this._snippets,
      (s) => computeMoveAndReorderSnippet(s, snippetId, targetFolderId, newIndex),
      async () => {
        await this.bridge.moveSnippetToFolder(snippetId, targetFolderId);
        await this.bridge.reorderSnippet(snippetId, newIndex);
      },
    );
  }

  async createFolder(name: string): Promise<void> {
    await this.bridge.createSnippetFolder(name);
    this._folders.reload();
  }

  async renameFolder(id: number, name: string): Promise<void> {
    await this.bridge.renameSnippetFolder(id, name);
    this._folders.reload();
  }

  async deleteFolder(id: number): Promise<void> {
    await this.bridge.deleteSnippetFolder(id);
    this._folders.reload();
    this._snippets.reload();
  }

  async reorderFolder(id: number, newIndex: number): Promise<void> {
    await this.applyOptimistically(
      this._folders,
      (f) => computeReorderFolders(f, id, newIndex),
      () => this.bridge.reorderSnippetFolder(id, newIndex),
    );
  }
}
