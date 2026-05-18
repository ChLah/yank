export const SECTIONS = {
  general: { labelKey: 'SETTINGS.GROUP_GENERAL', icon: 'lucideSettings' },
  appearance: { labelKey: 'SETTINGS.GROUP_APPEARANCE', icon: 'lucidePalette' },
  history: { labelKey: 'SETTINGS.GROUP_HISTORY', icon: 'lucideHistory' },
  privacy: { labelKey: 'SETTINGS.GROUP_PRIVACY', icon: 'lucideShield' },
  updates: { labelKey: 'SETTINGS.GROUP_UPDATES', icon: 'lucideDownload' },
  statistics: { labelKey: 'SETTINGS.GROUP_STATISTICS', icon: 'lucideChartBar' },
} as const;

export type SectionKey = keyof typeof SECTIONS;

export const SECTION_KEYS = Object.keys(SECTIONS) as readonly SectionKey[];

export function isSectionKey(value: string | null | undefined): value is SectionKey {
  return value != null && value in SECTIONS;
}
