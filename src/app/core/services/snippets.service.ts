import { Injectable, inject, resource } from '@angular/core';
import { Snippet } from '../models/snippet.model';
import { SnippetFolder } from '../models/snippet-folder.model';
import { TauriBridgeService } from './tauri-bridge.service';

@Injectable({ providedIn: 'root' })
export class SnippetsService {
  private bridge = inject(TauriBridgeService);

  readonly snippets = resource({
    loader: () => this.bridge.getSnippets(),
  });

  readonly folders = resource({
    loader: () => this.bridge.getSnippetFolders(),
  });

  async createSnippet(title: string, content: string): Promise<void> {
    await this.bridge.createSnippet(title, content);
    this.snippets.reload();
  }

  async updateSnippet(id: number, title: string, content: string): Promise<void> {
    await this.bridge.updateSnippet(id, title, content);
    this.snippets.reload();
  }

  async deleteSnippet(id: number): Promise<void> {
    await this.bridge.deleteSnippet(id);
    this.snippets.reload();
  }

  async reorderSnippet(reordered: Snippet[], id: number, newIndex: number): Promise<void> {
    this.snippets.value.set(reordered);
    try {
      await this.bridge.reorderSnippet(id, newIndex);
    } catch {
      this.snippets.reload();
    }
  }

  async moveAndReorderSnippet(
    reordered: Snippet[],
    snippetId: number,
    folderId: number | null,
    newIndex: number,
  ): Promise<void> {
    this.snippets.value.set(reordered);
    try {
      await this.bridge.moveSnippetToFolder(snippetId, folderId);
      await this.bridge.reorderSnippet(snippetId, newIndex);
    } catch {
      this.snippets.reload();
    }
  }

  async moveSnippetToFolder(
    reordered: Snippet[],
    snippetId: number,
    folderId: number | null,
  ): Promise<void> {
    this.snippets.value.set(reordered);
    try {
      await this.bridge.moveSnippetToFolder(snippetId, folderId);
    } catch {
      this.snippets.reload();
    }
  }

  async createFolder(name: string): Promise<void> {
    await this.bridge.createSnippetFolder(name);
    this.folders.reload();
  }

  async renameFolder(id: number, name: string): Promise<void> {
    await this.bridge.renameSnippetFolder(id, name);
    this.folders.reload();
  }

  async deleteFolder(id: number): Promise<void> {
    await this.bridge.deleteSnippetFolder(id);
    this.folders.reload();
    this.snippets.reload();
  }

  async reorderFolder(reordered: SnippetFolder[], id: number, newIndex: number): Promise<void> {
    this.folders.value.set(reordered);
    try {
      await this.bridge.reorderSnippetFolder(id, newIndex);
    } catch {
      this.folders.reload();
    }
  }
}
