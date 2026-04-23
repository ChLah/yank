import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./features/clipboard-list/clipboard-list.component').then(
        (m) => m.ClipboardListComponent
      ),
  },
  {
    path: 'settings',
    loadComponent: () =>
      import('./features/settings/settings.component').then(
        (m) => m.SettingsComponent
      ),
  },
  {
    path: 'preview',
    loadComponent: () =>
      import('./features/image-preview/image-preview.component').then(
        (m) => m.ImagePreviewComponent
      ),
  },
  { path: '**', redirectTo: '' },
];
