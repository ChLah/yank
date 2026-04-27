import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { HlmLabel } from '@spartan-ng/helm/label';

@Component({
  selector: 'app-setting-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [HlmLabel],
  template: `
    <div class="space-y-1.5">
      @if (label()) {
        <label hlmLabel class="block uppercase tracking-wider">{{ label() }}</label>
      }
      <ng-content />
      @if (hint()) {
        <p class="text-[11px] text-muted-foreground">{{ hint() }}</p>
      }
    </div>
  `,
})
export class SettingFieldComponent {
  label = input<string>();
  hint = input<string>();
}
