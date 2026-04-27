export type Language = 'en' | 'de';
export type Theme = 'dark' | 'light' | 'system';

export interface AppSettings {
  shortcut: string;
  maxEntries: number;
  language: Language | null;
  theme: Theme;
  autostart: boolean;
  deleteAfterMaxEntries: boolean;
  deleteAfterDays: boolean;
  maxDays: number;
}

export const DEFAULT_SETTINGS: AppSettings = {
  shortcut: 'Ctrl+SEMICOLON',
  maxEntries: 20,
  language: null,
  theme: 'system',
  autostart: false,
  deleteAfterMaxEntries: true,
  deleteAfterDays: false,
  maxDays: 30,
};
