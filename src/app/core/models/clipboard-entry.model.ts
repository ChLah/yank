export type ClipboardKind = 'text' | 'image';

export interface ClipboardEntry {
  id: number;
  kind: ClipboardKind;
  content: string | null;
  thumbnail: string | null;
  width: number | null;
  height: number | null;
  hash: string;
  createdAt: number;
  lastUsedAt: number;
  pinned: boolean;
  sourceApp: string | null;
}
