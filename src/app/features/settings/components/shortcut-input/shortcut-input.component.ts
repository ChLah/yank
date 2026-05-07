import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideX } from '@ng-icons/lucide';
import { TranslatePipe } from '@ngx-translate/core';
import { HlmIcon } from '@spartan-ng/helm/icon';
import { HlmInput } from '@spartan-ng/helm/input';
import { ShortcutCaptureGuardDirective } from './shortcut-capture-guard.directive';

const MODIFIER_CODES = new Set([
  'ControlLeft',
  'ControlRight',
  'AltLeft',
  'AltRight',
  'ShiftLeft',
  'ShiftRight',
  'MetaLeft',
  'MetaRight',
]);

@Component({
  selector: 'app-shortcut-input',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgIcon, HlmIcon, HlmInput, TranslatePipe, ShortcutCaptureGuardDirective],
  providers: [provideIcons({ lucideX })],
  template: `
    <div class="space-y-1.5">
      <div class="relative w-full">
        <input
          hlmInput
          appShortcutCaptureGuard
          type="text"
          [value]="value()"
          class="w-full font-mono"
          [class.pr-8]="clearable() && value()"
          [placeholder]="'SETTINGS.SHORTCUT_PLACEHOLDER' | translate"
          (keydown)="onKeydown($event)"
          readonly
        />
        @if (clearable() && value()) {
          <button
            type="button"
            class="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            (click)="valueChange.emit('')"
          >
            <ng-icon hlm size="sm" name="lucideX" />
          </button>
        }
      </div>
      <p class="text-[11px] text-muted-foreground">
        {{ 'SETTINGS.SHORTCUT_HINT' | translate }}
      </p>
    </div>
  `,
})
export class ShortcutInputComponent {
  value = input.required<string>();
  /** When true, pressing a bare key (no modifiers) clears the value, and a clear button is shown. */
  clearable = input<boolean>(false);

  valueChange = output<string>();

  protected onKeydown(event: KeyboardEvent): void {
    event.preventDefault();
    if (MODIFIER_CODES.has(event.code)) return;

    const parts: string[] = [];
    if (event.ctrlKey) parts.push('Ctrl');
    if (event.altKey) parts.push('Alt');
    if (event.shiftKey) parts.push('Shift');
    if (event.metaKey) parts.push('Super');

    if (parts.length === 0) {
      if (this.clearable()) this.valueChange.emit('');
      return;
    }

    const cleanKey = event.code.startsWith('Key') ? event.code.slice(3) : event.code;
    parts.push(cleanKey);
    this.valueChange.emit(parts.join('+'));
  }
}
