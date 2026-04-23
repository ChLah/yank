import { ChangeDetectionStrategy, Component, inject, OnInit } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { TauriBridgeService } from './core/services/tauri-bridge.service';

@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet],
  host: { 'class': 'block h-full' },
  template: `<router-outlet />`,
})
export class App implements OnInit {
  private router = inject(Router);
  private bridge = inject(TauriBridgeService);

  ngOnInit(): void {
    this.bridge.onPopupShown(() => this.router.navigate(['/']));
  }
}
