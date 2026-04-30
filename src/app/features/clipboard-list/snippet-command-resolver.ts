export type SnippetKeyContext =
  | { mode: 'normal' }
  | { mode: 'editing'; snippetId: number }
  | { mode: 'adding-snippet' }
  | { mode: 'placeholder-overlay' }
  | { mode: 'adding-folder' };

export type SnippetCommand =
  | { type: 'move-up' }
  | { type: 'move-down' }
  | { type: 'paste-selected' }
  | { type: 'delete-selected' }
  | { type: 'enter-edit' }
  | { type: 'cancel-edit' }
  | { type: 'new-snippet' }
  | { type: 'hide-popup' };

export function resolveSnippetCommand(
  event: KeyboardEvent,
  context: SnippetKeyContext,
): SnippetCommand | null {
  if (event.ctrlKey && event.key === 'Tab') return null;

  if (
    context.mode === 'adding-snippet' ||
    context.mode === 'placeholder-overlay' ||
    context.mode === 'adding-folder'
  ) {
    return null;
  }

  if (context.mode === 'editing') {
    if (event.key === 'Escape' || event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      return { type: 'cancel-edit' };
    }
    return null;
  }

  // normal mode
  switch (event.key) {
    case 'ArrowDown':
      return { type: 'move-down' };
    case 'ArrowUp':
      return { type: 'move-up' };
    case 'Enter':
      return { type: 'paste-selected' };
    case 'Delete':
      return { type: 'delete-selected' };
    case 'Escape':
      return { type: 'hide-popup' };
  }

  if (event.key.length === 1 && !event.ctrlKey && !event.altKey && !event.metaKey) {
    const k = event.key.toLowerCase();
    if (k === 'e') return { type: 'enter-edit' };
    if (k === 'n') return { type: 'new-snippet' };
  }

  return null;
}
