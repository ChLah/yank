import { computeReorderSnippets, computeMoveSnippetToFolder } from './snippet-mutations';
import { Snippet } from '../models/snippet.model';

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
