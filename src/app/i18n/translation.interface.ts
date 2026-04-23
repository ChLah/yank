export interface Translation {
  [key: string]: any;
  SETTINGS: {
    TITLE: string;
    SHORTCUT_LABEL: string;
    SHORTCUT_PLACEHOLDER: string;
    SHORTCUT_HINT: string;
    MAX_ENTRIES_LABEL: string;
    MAX_ENTRIES_RANGE: string;
    LANGUAGE_LABEL: string;
    LANGUAGE_SYSTEM: string;
    LANGUAGE_EN: string;
    LANGUAGE_DE: string;
    THEME_LABEL: string;
    THEME_SYSTEM: string;
    THEME_LIGHT: string;
    THEME_DARK: string;
    SAVE: string;
    SAVING: string;
    SAVED: string;
  };
  CLIPBOARD: {
    TITLE: string;
    TAB_RECENT: string;
    TAB_PINNED: string;
    FILTER_ALL: string;
    FILTER_TEXT: string;
    FILTER_IMAGE: string;
    SEARCH_PLACEHOLDER: string;
    ERROR_LOAD: string;
    TRY_AGAIN: string;
    EMPTY_PINNED: string;
    EMPTY_PINNED_HINT: string;
    EMPTY_NO_MATCHES: string;
    EMPTY_NOTHING: string;
    HINT_NAV: string;
    HINT_PASTE: string;
    HINT_DELETE: string;
    HINT_PIN: string;
    HINT_SEARCH: string;
    HINT_CLOSE: string;
  };
  ENTRY: {
    IMAGE: string;
    TOGGLE_PIN: string;
    DELETE: string;
    TIME_JUST_NOW: string;
    TIME_MINUTES: string;
    TIME_HOURS: string;
    TIME_DAYS: string;
  };
  IMAGE_PREVIEW: {
    TITLE: string;
    COPY: string;
    COPYING: string;
    LOADING: string;
    ERROR: string;
    CLOSE: string;
    COPIED: string;
  };
}
