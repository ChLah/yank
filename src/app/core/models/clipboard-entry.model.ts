export type ClipboardKind = 'text' | 'image';

export interface ClipboardEntry {
  id: number;
  kind: ClipboardKind;
  /** Text content; null for image entries */
  content: string | null;
  /** Base64 data URL thumbnail; null for text entries */
  thumbnail: string | null;
  width: number | null;
  height: number | null;
  hash: string;
  createdAt: number;
  lastUsedAt: number;
}
