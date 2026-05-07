export type MergeSeparator = 'newline' | 'bullet' | 'comma';

/**
 * Joins clipboard contents with the chosen separator.
 *
 * Each item is trimmed; items that become empty after trim are dropped.
 */
export function mergeEntries(contents: string[], separator: MergeSeparator): string {
  const trimmed = contents.map((s) => s.trim()).filter((s) => s.length > 0);
  switch (separator) {
    case 'newline':
      return trimmed.join('\n');
    case 'bullet':
      return trimmed.map((s) => `- ${s}`).join('\n');
    case 'comma':
      return trimmed.join(', ');
  }
}
