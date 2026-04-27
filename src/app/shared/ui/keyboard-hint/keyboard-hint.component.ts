import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'app-keyboard-hint',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="flex items-center gap-1 text-[10px] text-muted-foreground whitespace-nowrap">
      <kbd class="inline-flex items-center px-1 py-0.5 bg-muted border border-border rounded text-[10px] font-mono text-muted-foreground leading-none">{{ key() }}</kbd>
      {{ label() }}
    </span>
  `,
})
export class KeyboardHintComponent {
  key = input.required<string>();
  label = input.required<string>();
}
