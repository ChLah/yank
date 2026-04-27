import { ChangeDetectionStrategy, Component, inject, OnInit } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { BrnSonnerImports } from '@spartan-ng/brain/sonner';
import { TauriBridgeService } from './core/services/tauri-bridge.service';

@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, BrnSonnerImports],
  host: { 'class': 'block h-full' },
  template: `
    <router-outlet />
    <brn-sonner-toaster richColors />
  `,
})
export class App implements OnInit {
  private router = inject(Router);
  private bridge = inject(TauriBridgeService);

  ngOnInit(): void {
    this.bridge.onPopupShown(() => this.router.navigate(['/']));
  }
}
