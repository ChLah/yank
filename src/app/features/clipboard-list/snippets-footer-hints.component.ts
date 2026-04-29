import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { KeyboardHintComponent } from '../../shared/ui/keyboard-hint/keyboard-hint.component';

@Component({
  selector: 'app-snippets-footer-hints',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [KeyboardHintComponent, TranslatePipe],
  template: `
    <div class="flex items-center gap-2">
      <app-keyboard-hint key="↑↓" [label]="'CLIPBOARD.HINT_NAV' | translate" />
      <app-keyboard-hint key="↵" [label]="'SNIPPETS.HINT_PASTE' | translate" />
      <app-keyboard-hint key="E" [label]="'SNIPPETS.HINT_EDIT' | translate" />
      <app-keyboard-hint key="⌫" [label]="'SNIPPETS.HINT_DELETE' | translate" />
      <app-keyboard-hint key="N" [label]="'SNIPPETS.HINT_NEW' | translate" />
      <app-keyboard-hint key="Esc" [label]="'CLIPBOARD.HINT_CLOSE' | translate" class="ml-auto" />
    </div>
  `,
})
export class SnippetsFooterHintsComponent {}
