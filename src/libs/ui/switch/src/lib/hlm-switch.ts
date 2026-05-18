import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  model,
} from '@angular/core';
import type { BooleanInput } from '@angular/cdk/coercion';
import { BrnSwitchImports } from '@spartan-ng/brain/switch';
import { hlm } from '@spartan-ng/helm/utils';
import type { ClassValue } from 'clsx';

@Component({
  selector: 'hlm-switch',
  imports: [BrnSwitchImports],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <brn-switch
      [id]="id()"
      [checked]="checked()"
      [disabled]="disabled()"
      [class]="_computedClass()"
      (checkedChange)="checked.set($event)"
    >
      <brn-switch-thumb
        class="block size-4 rounded-full bg-background shadow-md ring-0 transition-transform group-data-[state=checked]:translate-x-4 group-data-[state=unchecked]:translate-x-0.5"
      />
    </brn-switch>
  `,
})
export class HlmSwitch {
  public readonly id = input<string | null>(null);
  public readonly checked = model<boolean>(false);
  public readonly disabled = input<boolean, BooleanInput>(false, { transform: booleanAttribute });
  public readonly userClass = input<ClassValue>('', { alias: 'class' });

  protected readonly _computedClass = computed(() =>
    hlm(
      'group relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=unchecked]:bg-input',
      this.userClass(),
    ),
  );
}
