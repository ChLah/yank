export type Language = 'en' | 'de';
export type Theme = 'dark' | 'light' | 'system';

export interface AppSettings {
  shortcut: string;
  maxEntries: number;
  language: Language | null;
  theme: Theme;
}

export const DEFAULT_SETTINGS: AppSettings = {
  shortcut: 'Ctrl+SEMICOLON',
  maxEntries: 20,
  language: null,
  theme: 'system',
};
