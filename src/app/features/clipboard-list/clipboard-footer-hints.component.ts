import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { KeyboardHintComponent } from '../../shared/ui/keyboard-hint/keyboard-hint.component';

@Component({
  selector: 'app-clipboard-footer-hints',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [KeyboardHintComponent, TranslatePipe],
  template: `
    <div class="flex items-center gap-2">
      <app-keyboard-hint key="↑↓" [label]="'CLIPBOARD.HINT_NAV' | translate" />
      <app-keyboard-hint key="↵" [label]="primaryEnterLabel() | translate" />
      <app-keyboard-hint key="⇧↵" [label]="'TRANSFORM.HINT' | translate" />
      <app-keyboard-hint key="⌫" [label]="'CLIPBOARD.HINT_DELETE' | translate" />
      <span class="ml-auto text-[10px] text-muted-foreground whitespace-nowrap">
        {{ 'CLIPBOARD.HINT_SEARCH' | translate }}
      </span>
    </div>
    <div class="flex items-center gap-2">
      <app-keyboard-hint key="Ctrl+P" [label]="'CLIPBOARD.HINT_PIN' | translate" />
      <app-keyboard-hint key="Ctrl+E" [label]="'CLIPBOARD.HINT_EDIT' | translate" />
      @if (showOcrHint()) {
        <app-keyboard-hint key="Ctrl+O" [label]="'OCR.KEYBOARD_HINT' | translate" />
      }
      <app-keyboard-hint key="Ctrl+1–9" [label]="'CLIPBOARD.HINT_QUICK_PASTE' | translate" />
      <app-keyboard-hint key="Esc" [label]="'CLIPBOARD.HINT_CLOSE' | translate" class="ml-auto" />
    </div>
  `,
})
export class ClipboardFooterHintsComponent {
  showOcrHint = input(false);
  mergeMode = input(false);

  protected primaryEnterLabel = computed(() =>
    this.mergeMode() ? 'CLIPBOARD.HINT_MERGE' : 'CLIPBOARD.HINT_PASTE',
  );
}
