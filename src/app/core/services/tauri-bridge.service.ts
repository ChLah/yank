import { Injectable } from '@angular/core';
import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { ClipboardEntry } from '../models/clipboard-entry.model';
import { AppSettings } from '../models/settings.model';
import { Snippet } from '../models/snippet.model';
import { SnippetFolder } from '../models/snippet-folder.model';
import { ExcludedApp } from '../models/excluded-app.model';

/** Single seam between Angular and Tauri. Mock this in tests. */
@Injectable({ providedIn: 'root' })
export class TauriBridgeService {
  getEntries(): Promise<ClipboardEntry[]> {
    return invoke<ClipboardEntry[]>('get_entries');
  }

  setClipboard(id: number): Promise<void> {
    return invoke('set_clipboard', { id });
  }

  deleteEntry(id: number): Promise<void> {
    return invoke('delete_entry', { id });
  }

  getSettings(): Promise<AppSettings> {
    return invoke<AppSettings>('get_settings');
  }

  saveSettings(settings: AppSettings): Promise<void> {
    return invoke('save_settings', { settings });
  }

  openImagePreview(id: number): Promise<void> {
    return invoke('open_image_preview', { id });
  }

  getEntryImage(id: number): Promise<string> {
    return invoke<string>('get_entry_image', { id });
  }

  hidePopup(): Promise<void> {
    return invoke('hide_popup');
  }

  togglePin(id: number): Promise<boolean> {
    return invoke<boolean>('toggle_pin', { id });
  }

  onClipboardChanged(handler: () => void): Promise<UnlistenFn> {
    return listen('clipboard-changed', handler);
  }

  onPopupShown(handler: () => void): Promise<UnlistenFn> {
    return listen('popup-shown', handler);
  }

  saveWindowPosition(x: number, y: number): Promise<void> {
    return invoke('save_window_position', { x, y });
  }

  setClipboardText(text: string): Promise<void> {
    return invoke('set_clipboard_text', { text });
  }

  updateEntryContent(id: number, content: string): Promise<void> {
    return invoke('update_entry_content', { id, content });
  }

  ocrImage(id: number): Promise<string> {
    return invoke<string>('ocr_image', { id });
  }

  getSnippets(): Promise<Snippet[]> {
    return invoke<Snippet[]>('get_snippets');
  }

  createSnippet(title: string, content: string): Promise<Snippet> {
    return invoke<Snippet>('create_snippet', { title, content });
  }

  updateSnippet(id: number, title: string, content: string): Promise<Snippet> {
    return invoke<Snippet>('update_snippet', { id, title, content });
  }

  deleteSnippet(id: number): Promise<void> {
    return invoke('delete_snippet', { id });
  }

  reorderSnippet(id: number, newIndex: number): Promise<void> {
    return invoke('reorder_snippet', { id, newIndex });
  }

  getSnippetFolders(): Promise<SnippetFolder[]> {
    return invoke<SnippetFolder[]>('get_snippet_folders');
  }

  createSnippetFolder(name: string): Promise<SnippetFolder> {
    return invoke<SnippetFolder>('create_snippet_folder', { name });
  }

  renameSnippetFolder(id: number, name: string): Promise<void> {
    return invoke('rename_snippet_folder', { id, name });
  }

  deleteSnippetFolder(id: number): Promise<void> {
    return invoke('delete_snippet_folder', { id });
  }

  reorderSnippetFolder(id: number, newIndex: number): Promise<void> {
    return invoke('reorder_snippet_folder', { id, newIndex });
  }

  moveSnippetToFolder(snippetId: number, folderId: number | null): Promise<void> {
    return invoke('move_snippet_to_folder', { snippetId, folderId });
  }

  getExcludedApps(): Promise<ExcludedApp[]> {
    return invoke<ExcludedApp[]>('get_excluded_apps');
  }

  addExcludedApp(processName: string): Promise<ExcludedApp> {
    return invoke<ExcludedApp>('add_excluded_app', { processName });
  }

  removeExcludedApp(id: number): Promise<void> {
    return invoke('remove_excluded_app', { id });
  }

  getCapturePaused(): Promise<boolean> {
    return invoke<boolean>('get_capture_paused');
  }

  toggleCapturePaused(): Promise<boolean> {
    return invoke<boolean>('toggle_capture_paused');
  }

  onCapturePausedChanged(handler: (paused: boolean) => void): Promise<UnlistenFn> {
    return listen<boolean>('capture-paused-changed', (event) => handler(event.payload));
  }
}
