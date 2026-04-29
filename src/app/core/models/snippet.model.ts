export interface Snippet {
  id: number;
  title: string;
  content: string;
  createdAt: number;
  sortOrder: number;
  folderId: number | null;
}
