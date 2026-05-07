import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { HlmButton } from '@spartan-ng/helm/button';
import { UpdaterService } from '../../core/services/updater.service';
import { TauriEventBus } from '../../core/services/tauri-event-bus.service';

@Component({
  selector: 'app-update-banner',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, HlmButton],
  template: `
    @if (visible()) {
      @let pending = updater.availableUpdate();
      @if (pending) {
        <div
          class="flex items-center justify-between gap-3 px-3.5 py-2 bg-primary/10 border-b border-border text-[12px]"
        >
          <span class="text-foreground">
            {{ 'UPDATER.BANNER_READY' | translate: { version: pending.version } }}
          </span>
          <span class="flex items-center gap-2 shrink-0">
            <button hlmBtn size="sm" variant="ghost" (click)="onDismiss()">
              {{ 'UPDATER.BANNER_DISMISS' | translate }}
            </button>
            <button hlmBtn size="sm" (click)="onRestart()">
              {{ 'UPDATER.BANNER_RESTART' | translate }}
            </button>
          </span>
        </div>
      }
    }
  `,
})
export class UpdateBannerComponent {
  protected updater = inject(UpdaterService);
  private dismissed = signal(false);

  protected visible = computed(() => this.updater.isReady() && !this.dismissed());

  constructor() {
    inject(TauriEventBus)
      .popupShown$.pipe(takeUntilDestroyed())
      .subscribe(() => this.dismissed.set(false));
  }

  protected onDismiss(): void {
    this.dismissed.set(true);
  }

  protected onRestart(): void {
    void this.updater.restartNow();
  }
}
