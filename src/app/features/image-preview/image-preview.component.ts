import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideCheck, lucideCopy, lucideLoader, lucideX } from '@ng-icons/lucide';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmIcon } from '@spartan-ng/helm/icon';
import { TranslatePipe } from '@ngx-translate/core';
import { TauriBridgeService } from '../../core/services/tauri-bridge.service';
import { PageHeaderComponent } from '../../shared/ui/page-header/page-header.component';
import { LoadingSpinnerComponent } from '../../shared/ui/loading-spinner/loading-spinner.component';
import { EmptyStateComponent } from '../../shared/ui/empty-state/empty-state.component';

@Component({
  selector: 'app-image-preview',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgIcon, HlmIcon, HlmButton, TranslatePipe, PageHeaderComponent, LoadingSpinnerComponent, EmptyStateComponent],
  providers: [provideIcons({ lucideLoader, lucideCopy, lucideX, lucideCheck })],
  host: { '(keydown.escape)': 'onEscape()' },
  template: `
    <div class="flex flex-col h-full bg-zinc-950">

      <app-page-header variant="dark" [dragRegion]="false">
        <ng-container start>
          <span class="text-[13px] font-semibold text-zinc-200 tracking-tight">{{ 'IMAGE_PREVIEW.TITLE' | translate }}</span>
        </ng-container>
        <ng-container end>
          <button
            hlmBtn variant="outline" size="sm"
            class="flex items-center gap-1.5"
            [disabled]="copying()"
            (click)="copyToClipboard()"
          >
            @if (copying()) {
              <ng-icon hlm size="sm" name="lucideLoader" class="animate-spin" />
              {{ 'IMAGE_PREVIEW.COPYING' | translate }}
            } @else {
              <ng-icon hlm size="sm" name="lucideCopy" />
              {{ 'IMAGE_PREVIEW.COPY' | translate }}
            }
          </button>
          <button
            hlmBtn variant="ghost" size="sm"
            class="w-8 h-8 p-0 flex items-center justify-center"
            (click)="closeWindow()"
            [title]="'IMAGE_PREVIEW.CLOSE' | translate"
          >
            <ng-icon hlm size="sm" name="lucideX" />
          </button>
        </ng-container>
      </app-page-header>

      <!-- Image area -->
      <div class="flex-1 flex items-center justify-center p-8 overflow-auto">
        @if (loading()) {
          <div class="flex flex-col items-center gap-3">
            <app-loading-spinner variant="dark" />
            <span class="text-[13px] text-zinc-500">{{ 'IMAGE_PREVIEW.LOADING' | translate }}</span>
          </div>
        } @else if (error()) {
          <app-empty-state
            icon="lucideAlertCircle"
            [title]="'IMAGE_PREVIEW.ERROR' | translate"
            variant="destructive"
          />
        } @else if (imageSrc()) {
          <img
            [src]="imageSrc()!"
            alt="Clipboard image"
            class="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
          />
        }
      </div>

      @if (copied()) {
        <div class="fixed bottom-4 right-4 flex items-center gap-2 px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl">
          <ng-icon hlm size="sm" name="lucideCheck" class="text-green-400 shrink-0" />
          <span class="text-[12px] text-zinc-200">{{ 'IMAGE_PREVIEW.COPIED' | translate }}</span>
        </div>
      }
    </div>
  `,
})
export class ImagePreviewComponent {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private bridge = inject(TauriBridgeService);
  private cdr = inject(ChangeDetectorRef);

  protected imageSrc = signal<string | null>(null);
  protected loading = signal(true);
  protected error = signal(false);
  protected copying = signal(false);
  protected copied = signal(false);

  private entryId = 0;

  constructor() {
    // Use the observable so the component reacts to param changes when the
    // preview window is reused for a different image entry.
    this.route.queryParams.subscribe(params => {
      const id = params['id'];
      if (id) {
        this.entryId = Number(id);
        this.loadImage();
      }
    });
  }

  private async loadImage(): Promise<void> {
    this.loading.set(true);
    this.error.set(false);
    this.imageSrc.set(null);
    try {
      const src = await this.bridge.getEntryImage(this.entryId);
      this.imageSrc.set(src);
    } catch {
      this.error.set(true);
    } finally {
      this.loading.set(false);
      // Explicit markForCheck so OnPush picks up signal updates from async IPC.
      this.cdr.markForCheck();
    }
  }

  protected closeWindow(): void {
    this.router.navigate(['/']);
  }

  protected onEscape(): void {
    this.bridge.hidePopup();
    this.router.navigate(['/']);
  }

  protected async copyToClipboard(): Promise<void> {
    this.copying.set(true);
    try {
      await this.bridge.setClipboard(this.entryId);
      await this.bridge.hidePopup();
      this.router.navigate(['/']);
    } finally {
      this.copying.set(false);
    }
  }
}
