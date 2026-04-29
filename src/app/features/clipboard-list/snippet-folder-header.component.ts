import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideChevronDown, lucideChevronRight, lucideTrash2 } from '@ng-icons/lucide';
import { TranslatePipe } from '@ngx-translate/core';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmIcon } from '@spartan-ng/helm/icon';
import { SnippetFolder } from '../../core/models/snippet-folder.model';

@Component({
  selector: 'app-snippet-folder-header',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgIcon, HlmIcon, HlmButton, TranslatePipe],
  providers: [provideIcons({ lucideChevronDown, lucideChevronRight, lucideTrash2 })],
  template: `
    <div class="flex items-center gap-1 w-full min-w-0 h-7 px-2">
      <button
        class="shrink-0 text-muted-foreground hover:text-foreground transition-colors p-0.5"
        (click)="$event.stopPropagation(); toggleCollapse.emit()"
      >
        <ng-icon hlm size="xs" [name]="isExpanded() ? 'lucideChevronDown' : 'lucideChevronRight'" />
      </button>

      @if (editingName()) {
        <input
          #nameInput
          type="text"
          [value]="pendingName()"
          (input)="pendingName.set($any($event.target).value)"
          (keydown)="onNameKeyDown($event)"
          (blur)="saveName()"
          class="flex-1 min-w-0 bg-muted/50 text-[12px] font-semibold text-foreground rounded px-1.5 py-0.5 outline-none focus:ring-1 focus:ring-brand/50"
        />
      } @else if (confirmingDelete()) {
        <span class="text-[11px] text-destructive flex-1 min-w-0 truncate">
          {{ 'SNIPPETS.FOLDER_DELETE_CONFIRM' | translate: { name: folder().name } }}
        </span>
        <button
          hlmBtn
          variant="destructive"
          size="xs"
          class="shrink-0 text-[11px] h-5 px-1.5"
          (click)="$event.stopPropagation(); confirmDelete()"
        >
          {{ 'SNIPPETS.FOLDER_DELETE_YES' | translate }}
        </button>
        <button
          hlmBtn
          variant="ghost"
          size="xs"
          class="shrink-0 text-[11px] h-5 px-1.5"
          (click)="$event.stopPropagation(); confirmingDelete.set(false)"
        >
          {{ 'SNIPPETS.FOLDER_DELETE_CANCEL' | translate }}
        </button>
      } @else {
        <span
          class="flex-1 min-w-0 text-[12px] font-semibold text-muted-foreground truncate select-none"
          [class.cursor-pointer]="!isGeneral()"
          (click)="$event.stopPropagation(); startEdit()"
        >
          {{ isGeneral() ? ('SNIPPETS.FOLDER_GENERAL' | translate) : folder().name }}
        </span>
        @if (!isGeneral()) {
          <button
            class="opacity-0 group-hover:opacity-100 shrink-0 text-muted-foreground hover:text-destructive transition-opacity p-0.5"
            (click)="$event.stopPropagation(); confirmingDelete.set(true)"
          >
            <ng-icon hlm size="xs" name="lucideTrash2" />
          </button>
        }
      }
    </div>
  `,
})
export class SnippetFolderHeaderComponent {
  folder = input.required<SnippetFolder>();
  isGeneral = input<boolean>(false);
  isExpanded = input.required<boolean>();

  toggleCollapse = output<void>();
  rename = output<string>();
  delete = output<void>();

  private injector = inject(Injector);
  protected editingName = signal(false);
  protected pendingName = signal('');
  protected confirmingDelete = signal(false);
  protected nameInput = viewChild<ElementRef<HTMLInputElement>>('nameInput');

  protected startEdit(): void {
    if (this.isGeneral()) return;
    this.pendingName.set(this.folder().name);
    this.editingName.set(true);
    afterNextRender(
      () => {
        this.nameInput()?.nativeElement.focus();
        this.nameInput()?.nativeElement.select();
      },
      { injector: this.injector },
    );
  }

  protected saveName(): void {
    const trimmed = this.pendingName().trim();
    if (trimmed && trimmed !== this.folder().name) {
      this.rename.emit(trimmed);
    }
    this.editingName.set(false);
  }

  protected onNameKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      this.saveName();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      this.editingName.set(false);
    }
  }

  protected confirmDelete(): void {
    this.confirmingDelete.set(false);
    this.delete.emit();
  }
}
