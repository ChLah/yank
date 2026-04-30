import { Injectable, computed, inject, resource } from '@angular/core';
import { Snippet } from '../models/snippet.model';
import { SnippetFolder } from '../models/snippet-folder.model';
import { TauriBridgeService } from './tauri-bridge.service';

export interface SnippetTree {
  general: Snippet[];
  folders: { folder: SnippetFolder; snippets: Snippet[] }[];
  all: Snippet[];
}

function moveItem<T>(arr: T[], from: number, to: number): T[] {
  const result = [...arr];
  const [item] = result.splice(from, 1);
  result.splice(to, 0, item);
  return result;
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
    const snippets = this._snippets.value() ?? [];
    const snippet = snippets.find((s) => s.id === id);
    if (!snippet) return;
    const inFolder = snippets
      .filter((s) => s.folderId === snippet.folderId)
      .sort((a, b) => a.sortOrder - b.sortOrder);
    const reordered = moveItem(
      inFolder,
      inFolder.findIndex((s) => s.id === id),
      newIndex,
    );
    const updatedById = new Map(reordered.map((s, i) => [s.id, i]));
    const updated = snippets.map((s) =>
      updatedById.has(s.id) ? { ...s, sortOrder: updatedById.get(s.id)! } : s,
    );
    this._snippets.value.set(updated);
    try {
      await this.bridge.reorderSnippet(id, newIndex);
    } catch {
      this._snippets.reload();
    }
  }

  async moveSnippetToFolder(snippetId: number, targetFolderId: number | null): Promise<void> {
    const snippets = this._snippets.value() ?? [];
    const updated = snippets.map((s) =>
      s.id === snippetId ? { ...s, folderId: targetFolderId } : s,
    );
    this._snippets.value.set(updated);
    try {
      await this.bridge.moveSnippetToFolder(snippetId, targetFolderId);
    } catch {
      this._snippets.reload();
    }
  }

  async moveAndReorderSnippet(
    snippetId: number,
    targetFolderId: number | null,
    newIndex: number,
  ): Promise<void> {
    const snippets = this._snippets.value() ?? [];
    const withNewFolder = snippets.map((s) =>
      s.id === snippetId ? { ...s, folderId: targetFolderId } : s,
    );
    const inTarget = withNewFolder
      .filter((s) => s.folderId === targetFolderId)
      .sort((a, b) => a.sortOrder - b.sortOrder);
    const reordered = moveItem(
      inTarget,
      inTarget.findIndex((s) => s.id === snippetId),
      newIndex,
    );
    const updatedById = new Map(reordered.map((s, i) => [s.id, i]));
    const updated = withNewFolder.map((s) =>
      updatedById.has(s.id) ? { ...s, sortOrder: updatedById.get(s.id)! } : s,
    );
    this._snippets.value.set(updated);
    try {
      await this.bridge.moveSnippetToFolder(snippetId, targetFolderId);
      await this.bridge.reorderSnippet(snippetId, newIndex);
    } catch {
      this._snippets.reload();
    }
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
    const folders = this._folders.value() ?? [];
    const sorted = [...folders].sort((a, b) => a.sortOrder - b.sortOrder);
    const reordered = moveItem(
      sorted,
      sorted.findIndex((f) => f.id === id),
      newIndex,
    );
    const updatedById = new Map(reordered.map((f, i) => [f.id, i]));
    const updated = folders.map((f) =>
      updatedById.has(f.id) ? { ...f, sortOrder: updatedById.get(f.id)! } : f,
    );
    this._folders.value.set(updated);
    try {
      await this.bridge.reorderSnippetFolder(id, newIndex);
    } catch {
      this._folders.reload();
    }
  }
}
