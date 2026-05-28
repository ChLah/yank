export type Language = 'en' | 'de';
export type Theme = 'dark' | 'light' | 'system';
export type WindowPositionMode = 'cursor' | 'last';

export interface AppSettings {
  shortcut: string;
  pauseShortcut: string;
  maxEntries: number;
  language: Language | null;
  theme: Theme;
  autostart: boolean;
  deleteAfterMaxEntries: boolean;
  deleteAfterDays: boolean;
  maxDays: number;
  windowPosition: WindowPositionMode;
  autoCheckUpdates: boolean;
  autoPaste: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = {
  shortcut: 'Ctrl+Semicolon',
  pauseShortcut: '',
  maxEntries: 20,
  language: null,
  theme: 'system',
  autostart: false,
  deleteAfterMaxEntries: true,
  deleteAfterDays: false,
  maxDays: 30,
  windowPosition: 'cursor',
  autoCheckUpdates: true,
  autoPaste: true,
};
