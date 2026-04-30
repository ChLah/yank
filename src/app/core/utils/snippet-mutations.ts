import { Snippet } from '../models/snippet.model';
import { SnippetFolder } from '../models/snippet-folder.model';

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

export function computeMoveAndReorderSnippet(
  snippets: Snippet[],
  snippetId: number,
  targetFolderId: number | null,
  newIndex: number,
): Snippet[] {
  if (!snippets.some((s) => s.id === snippetId)) return snippets;
  const withNewFolder = snippets.map((s) =>
    s.id === snippetId ? { ...s, folderId: targetFolderId } : s,
  );
  const inTarget = withNewFolder
    .filter((s) => s.folderId === targetFolderId)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const reordered = moveItem(
    inTarget,
    inTarget.findIndex((s) => s.id === snippetId),
    newIndex,
  );
  const updatedById = new Map(reordered.map((s, i) => [s.id, i]));
  return withNewFolder.map((s) =>
    updatedById.has(s.id) ? { ...s, sortOrder: updatedById.get(s.id)! } : s,
  );
}

export function computeReorderFolders(
  folders: SnippetFolder[],
  id: number,
  newIndex: number,
): SnippetFolder[] {
  const sorted = [...folders].sort((a, b) => a.sortOrder - b.sortOrder);
  const fromIndex = sorted.findIndex((f) => f.id === id);
  if (fromIndex === -1) return folders;
  const reordered = moveItem(sorted, fromIndex, newIndex);
  const updatedById = new Map(reordered.map((f, i) => [f.id, i]));
  return folders.map((f) =>
    updatedById.has(f.id) ? { ...f, sortOrder: updatedById.get(f.id)! } : f,
  );
}
