import { Injectable } from '@angular/core';
import { Theme } from '../models/settings.model';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  applyTheme(theme: Theme): void {
    const root = document.documentElement;
    root.classList.remove('dark', 'light');
    if (theme !== 'system') {
      root.classList.add(theme);
    }
  }
}
