import {
  ChangeDetectionStrategy,
  Component,
  inject,
  linkedSignal,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideChevronLeft } from '@ng-icons/lucide';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmIcon } from '@spartan-ng/helm/icon';
import { HlmInput } from '@spartan-ng/helm/input';
import { HlmLabel } from '@spartan-ng/helm/label';
import { HlmAlert, HlmAlertDescription } from '@spartan-ng/helm/alert';
import { SettingsService } from '../../core/services/settings.service';

@Component({
  selector: 'app-settings',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, NgIcon, HlmIcon, HlmButton, HlmInput, HlmLabel, HlmAlert, HlmAlertDescription],
  providers: [provideIcons({ lucideChevronLeft })],
  template: `
    <div class="flex flex-col h-screen bg-zinc-950">

      <!-- Header -->
      <div class="px-3.5 h-11 flex items-center gap-2 shrink-0 bg-zinc-900 border-b border-zinc-800">
        <a routerLink="/" class="p-1 rounded-md text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800 transition-colors">
          <ng-icon hlm size="sm" name="lucideChevronLeft" />
        </a>
        <span class="text-[13px] font-semibold text-zinc-200 tracking-tight">Settings</span>
      </div>

      @if (settingsService.settings.isLoading()) {
        <div class="flex-1 flex items-center justify-center">
          <div class="w-5 h-5 border-2 border-zinc-800 border-t-zinc-500 rounded-full animate-spin"></div>
        </div>
      } @else {
        <form (ngSubmit)="save()" class="flex-1 flex flex-col p-5 gap-5 overflow-y-auto">

          <!-- Global Shortcut -->
          <div class="space-y-1.5">
            <label hlmLabel class="block uppercase tracking-wider">Global Shortcut</label>
            <input
              hlmInput
              type="text"
              [value]="shortcut()"
              class="w-full font-mono"
              placeholder="Click and press keys…"
              (keydown)="captureShortcut($event)"
              readonly
            />
            <p class="text-[11px] text-zinc-600">
              Click the field, then press your desired key combination.
            </p>
          </div>

          <!-- Max entries -->
          <div class="space-y-1.5">
            <label hlmLabel class="block uppercase tracking-wider">History Limit</label>
            <div class="flex items-center gap-3">
              <input
                hlmInput
                #maxInput
                type="number"
                [value]="maxEntries()"
                (input)="maxEntries.set(maxInput.valueAsNumber)"
                min="5"
                max="100"
                class="w-24"
              />
              <span class="text-[12px] text-zinc-600">entries (5 – 100)</span>
            </div>
          </div>

          @if (error()) {
            <hlm-alert variant="destructive">
              <p hlmAlertDescription>{{ error() }}</p>
            </hlm-alert>
          }

          @if (saved()) {
            <hlm-alert>
              <p hlmAlertDescription>Settings saved</p>
            </hlm-alert>
          }

          <div class="mt-auto">
            <button hlmBtn type="submit" class="w-full" [disabled]="!shortcut() || saving()">
              {{ saving() ? 'Saving…' : 'Save' }}
            </button>
          </div>
        </form>
      }
    </div>
  `,
})
export class SettingsComponent {
  protected settingsService = inject(SettingsService);

  protected shortcut = linkedSignal(() => this.settingsService.settings.value()?.shortcut ?? '');
  protected maxEntries = linkedSignal(() => this.settingsService.settings.value()?.maxEntries ?? 20);
  protected saving = signal(false);
  protected saved = signal(false);
  protected error = signal<string | null>(null);

  protected captureShortcut(event: KeyboardEvent): void {
    event.preventDefault();
    const parts: string[] = [];
    if (event.ctrlKey) parts.push('Ctrl');
    if (event.altKey) parts.push('Alt');
    if (event.shiftKey) parts.push('Shift');
    if (event.metaKey) parts.push('Super');

    const key = event.code;
    if (!['ControlLeft', 'ControlRight', 'AltLeft', 'AltRight',
          'ShiftLeft', 'ShiftRight', 'MetaLeft', 'MetaRight'].includes(key)) {
      const cleanKey = key.startsWith('Key') ? key.slice(3) : key;
      parts.push(cleanKey);
    }

    if (parts.length > 1) {
      this.shortcut.set(parts.join('+'));
    }
  }

  protected async save(): Promise<void> {
    if (!this.shortcut()) return;
    this.saving.set(true);
    this.error.set(null);
    this.saved.set(false);
    try {
      await this.settingsService.saveSettings({
        shortcut: this.shortcut(),
        maxEntries: this.maxEntries(),
        language: null,
      });
      this.saved.set(true);
      setTimeout(() => this.saved.set(false), 2000);
    } catch (e) {
      this.error.set(String(e));
    } finally {
      this.saving.set(false);
    }
  }
}
