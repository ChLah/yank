// src/app/core/models/settings.model.ts
export type Language = 'en' | 'de';

export interface AppSettings {
  shortcut: string;
  maxEntries: number;
  language: Language | null;
}

export const DEFAULT_SETTINGS: AppSettings = {
  shortcut: 'Ctrl+SEMICOLON',
  maxEntries: 20,
  language: null,
};
