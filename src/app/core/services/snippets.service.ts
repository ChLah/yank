import { Injectable, inject, resource } from '@angular/core';
import { Snippet } from '../models/snippet.model';
import { TauriBridgeService } from './tauri-bridge.service';

@Injectable({ providedIn: 'root' })
export class SnippetsService {
  private bridge = inject(TauriBridgeService);

  readonly snippets = resource({
    loader: () => this.bridge.getSnippets(),
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
}
