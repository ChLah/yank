import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { HlmButton } from '@spartan-ng/helm/button';
import { TauriBridgeService } from '../../core/services/tauri-bridge.service';

@Component({
  selector: 'app-image-preview',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [HlmButton],
  host: { '(keydown.escape)': 'onEscape()' },
  template: `
    <div class="flex flex-col h-full bg-zinc-950">

      <!-- Toolbar -->
      <div class="px-3.5 h-11 flex items-center justify-between shrink-0 bg-zinc-900 border-b border-zinc-800">
        <span class="text-[13px] font-semibold text-zinc-200 tracking-tight">Image Preview</span>
        <div class="flex items-center gap-2">
          <button
            hlmBtn variant="outline" size="sm"
            class="flex items-center gap-1.5"
            [disabled]="copying()"
            (click)="copyToClipboard()"
          >
            @if (copying()) {
              <svg class="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
              </svg>
              Copying…
            } @else {
              <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
              </svg>
              Copy
            }
          </button>
          <button
            hlmBtn variant="ghost" size="sm"
            class="w-8 h-8 p-0 flex items-center justify-center"
            (click)="closeWindow()"
            title="Close"
          >
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      <!-- Image area -->
      <div class="flex-1 flex items-center justify-center p-8 overflow-auto">
        @if (loading()) {
          <div class="flex flex-col items-center gap-3">
            <div class="w-5 h-5 border-2 border-zinc-800 border-t-zinc-500 rounded-full animate-spin"></div>
            <span class="text-[13px] text-zinc-500">Loading…</span>
          </div>
        } @else if (error()) {
          <div class="flex flex-col items-center gap-3">
            <div class="w-9 h-9 rounded-full bg-red-500/10 flex items-center justify-center">
              <svg class="w-4 h-4 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <p class="text-[13px] text-zinc-400">Failed to load image</p>
          </div>
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
          <svg class="w-3.5 h-3.5 text-green-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
          </svg>
          <span class="text-[12px] text-zinc-200">Copied to clipboard</span>
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
