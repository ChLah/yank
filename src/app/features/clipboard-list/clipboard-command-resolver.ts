export type ClipboardKeyContext =
  | { mode: 'normal' }
  | { mode: 'searching' }
  | { mode: 'editing'; entryId: number }
  | { mode: 'transform-picker' };

export type ClipboardCommand =
  | { type: 'move-up' }
  | { type: 'move-down' }
  | { type: 'copy-selected' }
  | { type: 'open-transform-picker' }
  | { type: 'delete-selected' }
  | { type: 'pin-selected' }
  | { type: 'enter-edit' }
  | { type: 'trigger-ocr' }
  | { type: 'quick-paste'; digit: number }
  | { type: 'start-search'; char: string }
  | { type: 'exit-search' }
  | { type: 'cancel-edit' }
  | { type: 'hide-popup' };

export function resolveClipboardCommand(
  event: KeyboardEvent,
  context: ClipboardKeyContext,
): ClipboardCommand | null {
  if (event.ctrlKey && event.key === 'Tab') return null;

  if (context.mode === 'transform-picker') return null;

  if (context.mode === 'editing') {
    if (event.key === 'Escape' || event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      return { type: 'cancel-edit' };
    }
    return null;
  }

  const quickPasteDigit = resolveQuickPasteDigit(event);
  if (quickPasteDigit !== null) return { type: 'quick-paste', digit: quickPasteDigit };

  if (context.mode === 'searching') {
    switch (event.key) {
      case 'ArrowDown':
        return { type: 'move-down' };
      case 'ArrowUp':
        return { type: 'move-up' };
      case 'Enter':
        return event.shiftKey ? { type: 'open-transform-picker' } : { type: 'copy-selected' };
      case 'Escape':
        return { type: 'exit-search' };
      default:
        return null;
    }
  }

  // normal mode
  switch (event.key) {
    case 'ArrowDown':
      return { type: 'move-down' };
    case 'ArrowUp':
      return { type: 'move-up' };
    case 'Enter':
      return event.shiftKey ? { type: 'open-transform-picker' } : { type: 'copy-selected' };
    case 'Delete':
      return { type: 'delete-selected' };
    case 'Escape':
      return { type: 'hide-popup' };
  }

  if (event.ctrlKey && !event.shiftKey && !event.altKey && !event.metaKey) {
    const k = event.key.toLowerCase();
    if (k === 'p') return { type: 'pin-selected' };
    if (k === 'e') return { type: 'enter-edit' };
    if (k === 'o') return { type: 'trigger-ocr' };
    return null;
  }

  if (event.key.length === 1 && !event.ctrlKey && !event.altKey && !event.metaKey) {
    return { type: 'start-search', char: event.key };
  }

  return null;
}

function resolveQuickPasteDigit(event: KeyboardEvent): number | null {
  if (!event.ctrlKey || event.shiftKey || event.altKey || event.metaKey) return null;
  const digit = parseInt(event.key, 10);
  return digit >= 1 && digit <= 9 ? digit : null;
}
