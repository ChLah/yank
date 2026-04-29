import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { TranslatePipe } from '@ngx-translate/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideX } from '@ng-icons/lucide';
import { HlmIcon } from '@spartan-ng/helm/icon';
import { HlmInput } from '@spartan-ng/helm/input';
import { toast } from '@spartan-ng/brain/sonner';
import { ExcludedAppsService } from '../../../../core/services/excluded-apps.service';

@Component({
  selector: 'app-excluded-apps',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, TranslatePipe, NgIcon, HlmIcon, HlmInput],
  providers: [provideIcons({ lucideX })],
  template: `
    <div class="space-y-2">
      @for (app of service.excludedApps.value() ?? []; track app.id) {
        <div class="flex items-center gap-2 text-[12px]">
          <span class="flex-1 font-mono text-foreground">{{ app.processName }}</span>
          <span class="text-muted-foreground">
            {{
              'SETTINGS.EXCLUDED_APPS_ADDED'
                | translate: { date: (app.createdAt * 1000 | date: 'mediumDate') }
            }}
          </span>
          <button
            class="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            (click)="remove(app.id)"
          >
            <ng-icon hlm size="xs" name="lucideX" />
          </button>
        </div>
      }
      <div class="flex gap-2">
        <input
          hlmInput
          type="text"
          [value]="inputValue()"
          (input)="inputValue.set($any($event.target).value)"
          [placeholder]="'SETTINGS.EXCLUDED_APPS_PLACEHOLDER' | translate"
          (keydown.enter)="add()"
          class="flex-1 font-mono text-[12px]"
        />
        <button
          class="px-3 py-1 text-[12px] rounded-md bg-muted hover:bg-muted/80 text-foreground transition-colors"
          (click)="add()"
        >
          {{ 'SETTINGS.EXCLUDED_APPS_ADD' | translate }}
        </button>
      </div>
    </div>
  `,
})
export class ExcludedAppsComponent {
  protected service = inject(ExcludedAppsService);
  protected inputValue = signal('');

  protected add(): void {
    const value = this.inputValue().trim();
    if (!value) return;
    this.service
      .addExcludedApp(value)
      .then(() => this.inputValue.set(''))
      .catch((e: unknown) => toast.error(String(e)));
  }

  protected async remove(id: number): Promise<void> {
    try {
      await this.service.removeExcludedApp(id);
    } catch (e: unknown) {
      toast.error(String(e));
    }
  }
}
