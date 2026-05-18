import { Directive, OnDestroy, inject } from '@angular/core';
import { toast } from '@spartan-ng/brain/sonner';
import { TauriBridgeService } from '../../../../core/services/tauri-bridge.service';

/**
 * Suspends global shortcut handling while the host element is focused.
 *
 * Without this, typing a shortcut combination into an input would also
 * trigger the OS-level global shortcut (since `event.preventDefault()`
 * only stops browser-level handling).
 */
@Directive({
  selector: '[appShortcutCaptureGuard]',
  host: {
    '(focus)': 'onFocus()',
    '(blur)': 'onBlur()',
  },
})
export class ShortcutCaptureGuardDirective implements OnDestroy {
  private bridge = inject(TauriBridgeService);

  protected onFocus(): void {
    this.bridge.setEditingShortcut(true).catch((e) => toast.error(String(e)));
  }

  protected onBlur(): void {
    this.bridge.setEditingShortcut(false).catch((e) => toast.error(String(e)));
  }

  // If the host element is removed (e.g. section switch, window close) while
  // focused, the browser's blur event may not round-trip its IPC before the
  // directive is torn down, leaving the global `editing_shortcut` flag stuck
  // at true and silently blocking every global shortcut. Reset defensively.
  ngOnDestroy(): void {
    this.bridge.setEditingShortcut(false).catch(() => {});
  }
}
