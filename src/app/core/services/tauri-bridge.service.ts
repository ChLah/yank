import { Injectable } from '@angular/core';
import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { ClipboardEntry } from '../models/clipboard-entry.model';
import { AppSettings } from '../models/settings.model';

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

  onClipboardChanged(handler: () => void): Promise<UnlistenFn> {
    return listen('clipboard-changed', handler);
  }

  onPopupShown(handler: () => void): Promise<UnlistenFn> {
    return listen('popup-shown', handler);
  }
}
