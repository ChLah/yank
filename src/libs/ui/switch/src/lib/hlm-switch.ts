import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  model,
  output,
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
      (checkedChange)="checkedChange.emit($event)"
    >
      <brn-switch-thumb
        class="block size-4 rounded-full bg-background shadow-md ring-0 transition-transform data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0.5"
      />
    </brn-switch>
  `,
})
export class HlmSwitch {
  readonly id = input<string | null>(null);
  readonly checked = model<boolean>(false);
  readonly disabled = input<boolean, BooleanInput>(false, { transform: booleanAttribute });
  readonly userClass = input<ClassValue>('', { alias: 'class' });
  readonly checkedChange = output<boolean>();

  protected readonly _computedClass = computed(() =>
    hlm(
      'relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-green-500 data-[state=unchecked]:bg-red-500',
      this.userClass(),
    ),
  );
}

export const HlmSwitchImports = [HlmSwitch] as const;
