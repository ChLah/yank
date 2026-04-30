import { Snippet } from '../models/snippet.model';

function moveItem<T>(arr: T[], from: number, to: number): T[] {
  const result = [...arr];
  const [item] = result.splice(from, 1);
  result.splice(to, 0, item);
  return result;
}

export function computeReorderSnippets(
  snippets: Snippet[],
  id: number,
  newIndex: number,
): Snippet[] {
  const snippet = snippets.find((s) => s.id === id);
  if (!snippet) return snippets;
  const inFolder = snippets
    .filter((s) => s.folderId === snippet.folderId)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const reordered = moveItem(
    inFolder,
    inFolder.findIndex((s) => s.id === id),
    newIndex,
  );
  const updatedById = new Map(reordered.map((s, i) => [s.id, i]));
  return snippets.map((s) =>
    updatedById.has(s.id) ? { ...s, sortOrder: updatedById.get(s.id)! } : s,
  );
}

export function computeMoveSnippetToFolder(
  snippets: Snippet[],
  snippetId: number,
  targetFolderId: number | null,
): Snippet[] {
  return snippets.map((s) => (s.id === snippetId ? { ...s, folderId: targetFolderId } : s));
}
