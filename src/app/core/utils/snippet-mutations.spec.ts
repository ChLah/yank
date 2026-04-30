import {
  computeReorderSnippets,
  computeMoveSnippetToFolder,
  computeMoveAndReorderSnippet,
  computeReorderFolders,
} from './snippet-mutations';
import { Snippet } from '../models/snippet.model';
import { SnippetFolder } from '../models/snippet-folder.model';

function makeSnippet(partial: Partial<Snippet>): Snippet {
  return {
    id: 0,
    title: '',
    content: '',
    createdAt: 0,
    sortOrder: 0,
    folderId: null,
    ...partial,
  };
}

describe('computeReorderSnippets', () => {
  it('moves item within its folder and recalculates sortOrder', () => {
    const snippets = [
      makeSnippet({ id: 1, folderId: null, sortOrder: 0 }),
      makeSnippet({ id: 2, folderId: null, sortOrder: 1 }),
      makeSnippet({ id: 3, folderId: null, sortOrder: 2 }),
    ];
    const result = computeReorderSnippets(snippets, 1, 2);
    expect(result.find((s) => s.id === 1)?.sortOrder).toBe(2);
    expect(result.find((s) => s.id === 2)?.sortOrder).toBe(0);
    expect(result.find((s) => s.id === 3)?.sortOrder).toBe(1);
  });

  it('does not affect snippets in other folders', () => {
    const snippets = [
      makeSnippet({ id: 1, folderId: null, sortOrder: 0 }),
      makeSnippet({ id: 2, folderId: null, sortOrder: 1 }),
      makeSnippet({ id: 3, folderId: 10, sortOrder: 0 }),
    ];
    const result = computeReorderSnippets(snippets, 1, 1);
    expect(result.find((s) => s.id === 3)?.folderId).toBe(10);
    expect(result.find((s) => s.id === 3)?.sortOrder).toBe(0);
  });

  it('returns unchanged array when snippet id is not found', () => {
    const snippets = [makeSnippet({ id: 1, sortOrder: 0 })];
    const result = computeReorderSnippets(snippets, 99, 0);
    expect(result).toEqual(snippets);
  });
});

describe('computeMoveSnippetToFolder', () => {
  it('updates folderId of the target snippet', () => {
    const snippets = [
      makeSnippet({ id: 1, folderId: null }),
      makeSnippet({ id: 2, folderId: null }),
    ];
    const result = computeMoveSnippetToFolder(snippets, 1, 10);
    expect(result.find((s) => s.id === 1)?.folderId).toBe(10);
  });

  it('does not modify other snippets', () => {
    const snippets = [
      makeSnippet({ id: 1, folderId: null }),
      makeSnippet({ id: 2, folderId: null }),
    ];
    const result = computeMoveSnippetToFolder(snippets, 1, 10);
    expect(result.find((s) => s.id === 2)?.folderId).toBeNull();
  });

  it('sets folderId to null when moving to general', () => {
    const snippets = [makeSnippet({ id: 1, folderId: 10 })];
    const result = computeMoveSnippetToFolder(snippets, 1, null);
    expect(result.find((s) => s.id === 1)?.folderId).toBeNull();
  });
});

describe('computeMoveAndReorderSnippet', () => {
  it('updates folderId and places snippet at the given index in the target folder', () => {
    const snippets = [
      makeSnippet({ id: 1, folderId: null, sortOrder: 0 }),
      makeSnippet({ id: 2, folderId: 10, sortOrder: 0 }),
      makeSnippet({ id: 3, folderId: 10, sortOrder: 1 }),
    ];
    const result = computeMoveAndReorderSnippet(snippets, 1, 10, 0);
    expect(result.find((s) => s.id === 1)?.folderId).toBe(10);
    expect(result.find((s) => s.id === 1)?.sortOrder).toBe(0);
    expect(result.find((s) => s.id === 2)?.sortOrder).toBe(1);
    expect(result.find((s) => s.id === 3)?.sortOrder).toBe(2);
  });

  it('does not change snippets outside the target folder', () => {
    const snippets = [
      makeSnippet({ id: 1, folderId: null, sortOrder: 0 }),
      makeSnippet({ id: 2, folderId: 10, sortOrder: 0 }),
      makeSnippet({ id: 3, folderId: 20, sortOrder: 0 }),
    ];
    const result = computeMoveAndReorderSnippet(snippets, 1, 10, 0);
    expect(result.find((s) => s.id === 3)?.sortOrder).toBe(0);
    expect(result.find((s) => s.id === 3)?.folderId).toBe(20);
  });

  it('appends to end when newIndex equals the destination folder length', () => {
    const snippets = [
      makeSnippet({ id: 1, folderId: null, sortOrder: 0 }),
      makeSnippet({ id: 2, folderId: 10, sortOrder: 0 }),
    ];
    const result = computeMoveAndReorderSnippet(snippets, 1, 10, 1);
    expect(result.find((s) => s.id === 1)?.sortOrder).toBe(1);
    expect(result.find((s) => s.id === 2)?.sortOrder).toBe(0);
  });

  it('returns unchanged array when snippet id is not found', () => {
    const snippets = [makeSnippet({ id: 1, folderId: null, sortOrder: 0 })];
    const result = computeMoveAndReorderSnippet(snippets, 99, 10, 0);
    expect(result).toEqual(snippets);
  });
});

function makeFolder(partial: Partial<SnippetFolder>): SnippetFolder {
  return { id: 0, name: '', sortOrder: 0, ...partial };
}

describe('computeReorderFolders', () => {
  it('moves folder and recalculates sortOrder for all affected folders', () => {
    const folders = [
      makeFolder({ id: 1, sortOrder: 0 }),
      makeFolder({ id: 2, sortOrder: 1 }),
      makeFolder({ id: 3, sortOrder: 2 }),
    ];
    const result = computeReorderFolders(folders, 1, 2);
    expect(result.find((f) => f.id === 1)?.sortOrder).toBe(2);
    expect(result.find((f) => f.id === 2)?.sortOrder).toBe(0);
    expect(result.find((f) => f.id === 3)?.sortOrder).toBe(1);
  });

  it('returns unchanged array when folder id is not found', () => {
    const folders = [makeFolder({ id: 1, sortOrder: 0 })];
    const result = computeReorderFolders(folders, 99, 0);
    expect(result).toEqual(folders);
  });
});
