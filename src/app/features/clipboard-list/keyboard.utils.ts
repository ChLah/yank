export function resolveEditModeAction(key: string): 'cancel-navigate' | 'block' {
  return key === 'ArrowDown' || key === 'ArrowUp' ? 'cancel-navigate' : 'block';
}
