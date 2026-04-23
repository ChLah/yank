export interface AppSettings {
  shortcut: string;
  maxEntries: number;
}

export const DEFAULT_SETTINGS: AppSettings = {
  shortcut: 'Ctrl+SEMICOLON',
  maxEntries: 20,
};
