import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { HlmToasterImports } from '@spartan-ng/helm/sonner';
import { TauriEventBus } from './core/services/tauri-event-bus.service';

@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, HlmToasterImports],
  host: { class: 'block h-full' },
  template: `
    <router-outlet />
    <hlm-toaster />
  `,
})
export class App {
  private router = inject(Router);

  constructor() {
    inject(TauriEventBus)
      .popupShown$.pipe(takeUntilDestroyed())
      .subscribe(() => this.router.navigate(['/']));
  }
}
