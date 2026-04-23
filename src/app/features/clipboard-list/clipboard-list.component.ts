import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnInit,
  ViewChild,
  computed,
  inject,
  signal,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ClipboardEntryComponent } from './clipboard-entry.component';
import { ClipboardService } from '../../core/services/clipboard.service';
import { TauriBridgeService } from '../../core/services/tauri-bridge.service';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmBadge } from '@spartan-ng/helm/badge';

@Component({
  selector: 'app-clipboard-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ClipboardEntryComponent, RouterLink, HlmButton, HlmBadge],
  host: {
    '(keydown)': 'onKeyDown($event)',
    'tabindex': '0',
    'class': 'block outline-none h-full',
  },
  template: `
    <div class="flex flex-col h-full bg-zinc-950 rounded-xl overflow-hidden border border-zinc-800 shadow-2xl">

      <!-- Header -->
      <div class="px-3.5 h-11 flex items-center justify-between shrink-0 bg-zinc-900 border-b border-zinc-800">
        <div class="flex items-center gap-2">
          <svg class="w-3.5 h-3.5 text-zinc-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          <span class="text-[13px] font-semibold text-zinc-200 tracking-tight">Clipboard</span>
          @if (entries().length > 0) {
            <span hlmBadge variant="secondary">{{ entries().length }}</span>
          }
        </div>
        <a routerLink="/settings" class="p-1.5 rounded-md text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800 transition-colors">
          <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </a>
      </div>

      <!-- Content -->
      <div class="flex-1 overflow-y-auto scrollbar-thin" #listContainer>

        @if (clipboard.entries.isLoading()) {
          <div class="py-1">
            @for (skeleton of skeletons; track $index) {
              <div class="flex items-center gap-3 pl-5 pr-4 py-2.5 border-l-2 border-l-transparent">
                <div class="flex-1 space-y-1.5">
                  <div class="h-3 bg-zinc-800 rounded animate-pulse" [style.width.%]="65 + ($index % 3) * 10"></div>
                  <div class="h-2 bg-zinc-800 rounded animate-pulse w-12 opacity-50"></div>
                </div>
              </div>
            }
          </div>
        } @else if (clipboard.entries.error()) {
          <div class="flex flex-col items-center justify-center h-full py-10 text-center">
            <div class="w-9 h-9 rounded-full bg-red-500/10 flex items-center justify-center mb-3">
              <svg class="w-4 h-4 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <p class="text-[13px] text-zinc-400 mb-1.5">Failed to load history</p>
            <button hlmBtn variant="link" size="sm" (click)="clipboard.entries.reload()">
              Try again
            </button>
          </div>
        } @else if (entries().length === 0) {
          <div class="flex flex-col items-center justify-center h-full py-10 text-center gap-3">
            <div class="w-10 h-10 rounded-xl bg-zinc-900 flex items-center justify-center">
              <svg class="w-5 h-5 text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
                  d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <p class="text-[13px] text-zinc-500">Nothing copied yet</p>
          </div>
        } @else {
          <div class="py-1">
            @for (entry of entries(); track entry.id; let i = $index) {
              <div class="entry-item">
                <app-clipboard-entry
                  [entry]="entry"
                  [selected]="selectedIndex() === i"
                  (select)="selectEntry(i)"
                  (delete)="deleteEntry(i)"
                />
              </div>
            }
          </div>
        }
      </div>

      <!-- Footer -->
      <div class="h-9 px-3.5 flex items-center gap-2.5 shrink-0 bg-zinc-900 border-t border-zinc-800">
        <span class="flex items-center gap-1.5 text-[11px] text-zinc-600">
          <kbd class="inline-flex items-center px-1 py-0.5 bg-zinc-800 border border-zinc-700 rounded text-[10px] font-mono text-zinc-500 leading-none">↑↓</kbd>
          navigate
        </span>
        <span class="flex items-center gap-1.5 text-[11px] text-zinc-600">
          <kbd class="inline-flex items-center px-1 py-0.5 bg-zinc-800 border border-zinc-700 rounded text-[10px] font-mono text-zinc-500 leading-none">↵</kbd>
          paste
        </span>
        <span class="flex items-center gap-1.5 text-[11px] text-zinc-600">
          <kbd class="inline-flex items-center px-1 py-0.5 bg-zinc-800 border border-zinc-700 rounded text-[10px] font-mono text-zinc-500 leading-none">⌫</kbd>
          delete
        </span>
        <span class="flex items-center gap-1.5 text-[11px] text-zinc-600 ml-auto">
          <kbd class="inline-flex items-center px-1 py-0.5 bg-zinc-800 border border-zinc-700 rounded text-[10px] font-mono text-zinc-500 leading-none">Esc</kbd>
          close
        </span>
      </div>
    </div>
  `,
})
export class ClipboardListComponent implements OnInit {
  protected clipboard = inject(ClipboardService);
  private bridge = inject(TauriBridgeService);
  private router = inject(Router);

  protected selectedIndex = signal(0);
  protected skeletons = Array(5);

  protected entries = computed(() => this.clipboard.entries.value() ?? []);

  @ViewChild('listContainer') listContainer!: ElementRef<HTMLElement>;

  ngOnInit(): void {
    // Focus the component so keyboard events work immediately
    (document.querySelector('[tabindex="0"]') as HTMLElement | null)?.focus();
  }

  protected selectEntry(index: number): void {
    this.selectedIndex.set(index);
    const entry = this.entries()[index];
    if (!entry) return;
    if (entry.kind === 'image') {
      this.router.navigate(['/preview'], { queryParams: { id: entry.id } });
    } else {
      this.clipboard.setClipboard(entry.id);
    }
  }

  protected deleteEntry(index: number): void {
    const entry = this.entries()[index];
    if (!entry) return;
    this.clipboard.deleteEntry(entry.id);
    // Adjust selectedIndex if needed
    const newLen = this.entries().length - 1;
    if (this.selectedIndex() >= newLen && newLen > 0) {
      this.selectedIndex.set(newLen - 1);
    }
  }

  protected onKeyDown(event: KeyboardEvent): void {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.moveSelection(1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.moveSelection(-1);
        break;
      case 'Enter':
        event.preventDefault();
        this.copySelected();
        break;
      case 'Delete':
        event.preventDefault();
        this.deleteEntry(this.selectedIndex());
        break;
      case 'Escape':
        event.preventDefault();
        this.bridge.hidePopup();
        break;
    }
  }

  private moveSelection(delta: number): void {
    const len = this.entries().length;
    if (len === 0) return;
    const next = Math.max(0, Math.min(len - 1, this.selectedIndex() + delta));
    this.selectedIndex.set(next);
    this.scrollSelectedIntoView();
  }

  private copySelected(): void {
    const entry = this.entries()[this.selectedIndex()];
    if (!entry) return;
    this.clipboard.setClipboard(entry.id);
  }

  private scrollSelectedIntoView(): void {
    if (!this.listContainer) return;
    const items = this.listContainer.nativeElement.querySelectorAll<HTMLElement>('.entry-item');
    const item = items[this.selectedIndex()];
    item?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
}
