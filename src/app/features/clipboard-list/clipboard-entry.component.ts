import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core';
import { HlmButton } from '@spartan-ng/helm/button';
import { ClipboardEntry } from '../../core/models/clipboard-entry.model';

@Component({
  selector: 'app-clipboard-entry',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [HlmButton],
  template: `
    <div
      class="flex items-center gap-2 pl-3.5 pr-3 cursor-pointer group transition-colors border-l-2"
      [class]="selected() ? 'border-l-indigo-500 bg-zinc-900' : 'border-l-transparent hover:bg-zinc-900/60'"
      (click)="select.emit()"
    >
      @if (entry().kind === 'image') {
        <div class="shrink-0 w-8 h-8 rounded-md overflow-hidden bg-zinc-800 flex items-center justify-center my-2">
          @if (entry().thumbnail) {
            <img [src]="entry().thumbnail!" alt="Clipboard image" class="w-full h-full object-cover" />
          } @else {
            <svg class="w-4 h-4 text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          }
        </div>
        <div class="flex-1 min-w-0 py-2">
          <p class="text-[13px] font-medium text-zinc-300 leading-snug">Image</p>
          @if (imageDimensions()) {
            <p class="text-[11px] text-zinc-600 mt-0.5">{{ imageDimensions() }}</p>
          }
        </div>
      } @else {
        <div class="flex-1 min-w-0 py-2.5">
          <p class="text-[13px] text-zinc-300 truncate leading-snug">{{ entry().content }}</p>
        </div>
      }

      <div class="flex items-center gap-1 shrink-0">
        <span class="text-[11px] text-zinc-600 tabular-nums">{{ relativeTime() }}</span>

        <!-- Pin button -->
        <button
          hlmBtn variant="ghost" size="icon"
          [class]="pinButtonClass()"
          title="Toggle pin (P)"
          (click)="$event.stopPropagation(); pin.emit()"
        >
          @if (entry().pinned) {
            <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"/>
            </svg>
          } @else {
            <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"/>
            </svg>
          }
        </button>

        <!-- Delete button -->
        <button
          hlmBtn variant="ghost" size="icon"
          class="opacity-0 group-hover:opacity-100 transition-opacity text-zinc-700 hover:text-red-400 hover:bg-red-500/10"
          [class.opacity-100]="selected()"
          title="Delete (Del)"
          (click)="$event.stopPropagation(); delete.emit()"
        >
          <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  `,
})
export class ClipboardEntryComponent {
  entry = input.required<ClipboardEntry>();
  selected = input(false);

  select = output<void>();
  delete = output<void>();
  pin    = output<void>();

  relativeTime = computed(() => formatRelativeTime(this.entry().lastUsedAt));

  imageDimensions = computed(() => {
    const e = this.entry();
    if (e.width && e.height) return `${e.width} × ${e.height}`;
    return null;
  });

  protected pinButtonClass = computed(() => {
    const alwaysVisible = this.selected() || this.entry().pinned;
    const visibility = alwaysVisible ? 'opacity-100' : 'opacity-0 group-hover:opacity-100';
    const color = this.entry().pinned
      ? 'text-indigo-400 hover:text-indigo-300'
      : 'text-zinc-600 hover:text-zinc-400';
    return `${visibility} transition-opacity ${color}`;
  });
}

function formatRelativeTime(unixSeconds: number): string {
  const diffMs = Date.now() - unixSeconds * 1000;
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return 'just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${Math.floor(diffHr / 24)}d ago`;
}
