import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { HlmCheckboxImports } from '@spartan-ng/helm/checkbox';
import { HlmLabel } from '@spartan-ng/helm/label';

@Component({
  selector: 'app-setting-checkbox',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  imports: [HlmCheckboxImports, HlmLabel],
  template: `
    <div class="flex items-center gap-2">
      <hlm-checkbox
        [id]="id()"
        [checked]="checked()"
        (checkedChange)="checkedChange.emit($event)"
      />
      <label hlmLabel [for]="id()" class="uppercase tracking-wider cursor-pointer">{{ label() }}</label>
    </div>
  `,
})
export class SettingCheckboxComponent {
  id = input.required<string>();
  label = input.required<string>();
  checked = input.required<boolean>();
  checkedChange = output<boolean>();
}
