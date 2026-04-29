# Snippet Drag & Drop Reordering — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users reorder snippets via a drag handle; persist the new order to SQLite via a `reorder_snippet` Tauri command.

**Architecture:** Angular CDK `CdkDropList`/`CdkDrag` handles drag UX. A grip icon (`lucideGripVertical`) inside `SnippetItemComponent` carries `cdkDragHandle`; the wrapper div in `ClipboardListComponent` carries `cdkDrag`. On drop, the component optimistically updates `SnippetsService.snippets.value` then calls the backend; on error it reloads to restore truth. The backend receives `(id, new_index)`, repositions the item in the full ordered list, and reassigns dense `sort_order` values 0, 1, 2 … in one pass.

**Tech Stack:** Angular 19, `@angular/cdk/drag-drop` (already installed), Rust/Tauri, `rusqlite`

---

## File Map

| File | Change |
|---|---|
| `src-tauri/src/store/sqlite_store.rs` | Add `reorder_snippet` method + tests |
| `src-tauri/src/commands.rs` | Add `reorder_snippet` command |
| `src-tauri/src/lib.rs` | Register `reorder_snippet` in `invoke_handler!` |
| `src/app/core/services/tauri-bridge.service.ts` | Add `reorderSnippet` bridge method |
| `src/app/core/services/snippets.service.ts` | Add `reorderSnippet` service method |
| `src/app/features/clipboard-list/snippet-item.component.ts` | Add `CdkDragHandle` + grip icon |
| `src/app/features/clipboard-list/clipboard-list.component.ts` | Add `CdkDropList`/`CdkDrag`, drop handler |

---

## Task 1: Backend store — `reorder_snippet`

**Files:**
- Modify: `src-tauri/src/store/sqlite_store.rs`

- [ ] **Step 1: Write the failing tests**

Add the following tests at the bottom of the `#[cfg(test)]` block in `sqlite_store.rs` (after `test_update_snippet_unknown_id_returns_error`, before the closing `}`):

```rust
#[test]
fn test_reorder_snippet_move_to_end() {
    let store = in_memory_store();
    let s1 = store.create_snippet("A", "a").unwrap();
    let s2 = store.create_snippet("B", "b").unwrap();
    let s3 = store.create_snippet("C", "c").unwrap();

    store.reorder_snippet(s1.id, 2).unwrap();

    let snippets = store.get_snippets().unwrap();
    assert_eq!(snippets[0].id, s2.id);
    assert_eq!(snippets[1].id, s3.id);
    assert_eq!(snippets[2].id, s1.id);
    // sort_orders are dense 0-based
    assert_eq!(snippets[0].sort_order, 0);
    assert_eq!(snippets[1].sort_order, 1);
    assert_eq!(snippets[2].sort_order, 2);
}

#[test]
fn test_reorder_snippet_move_to_front() {
    let store = in_memory_store();
    let s1 = store.create_snippet("A", "a").unwrap();
    let s2 = store.create_snippet("B", "b").unwrap();
    let s3 = store.create_snippet("C", "c").unwrap();

    store.reorder_snippet(s3.id, 0).unwrap();

    let snippets = store.get_snippets().unwrap();
    assert_eq!(snippets[0].id, s3.id);
    assert_eq!(snippets[1].id, s1.id);
    assert_eq!(snippets[2].id, s2.id);
}

#[test]
fn test_reorder_snippet_normalizes_duplicates() {
    let store = in_memory_store();
    // Manually create snippets with the same sort_order to simulate duplicates
    let conn = store.conn.lock().unwrap();
    conn.execute(
        "INSERT INTO snippets (title, content, created_at, sort_order) VALUES ('A', 'a', 0, 5)",
        [],
    ).unwrap();
    let id_a = conn.last_insert_rowid();
    conn.execute(
        "INSERT INTO snippets (title, content, created_at, sort_order) VALUES ('B', 'b', 1, 5)",
        [],
    ).unwrap();
    let id_b = conn.last_insert_rowid();
    drop(conn);

    // Reorder: move id_b to index 0
    store.reorder_snippet(id_b, 0).unwrap();

    let snippets = store.get_snippets().unwrap();
    assert_eq!(snippets[0].id, id_b);
    assert_eq!(snippets[1].id, id_a);
    assert_eq!(snippets[0].sort_order, 0);
    assert_eq!(snippets[1].sort_order, 1);
}

#[test]
fn test_reorder_snippet_unknown_id_returns_error() {
    let store = in_memory_store();
    store.create_snippet("A", "a").unwrap();
    let result = store.reorder_snippet(9999, 0);
    assert!(result.is_err());
}

#[test]
fn test_reorder_snippet_clamps_out_of_bounds_index() {
    let store = in_memory_store();
    let s1 = store.create_snippet("A", "a").unwrap();
    let s2 = store.create_snippet("B", "b").unwrap();

    // new_index 99 should clamp to last valid position (1)
    store.reorder_snippet(s1.id, 99).unwrap();

    let snippets = store.get_snippets().unwrap();
    assert_eq!(snippets[0].id, s2.id);
    assert_eq!(snippets[1].id, s1.id);
}
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd src-tauri && cargo test reorder_snippet 2>&1
```

Expected: compile error ("no method named `reorder_snippet`").

- [ ] **Step 3: Implement `reorder_snippet`**

In `sqlite_store.rs`, add the method after `delete_snippet` (around line 533):

```rust
pub fn reorder_snippet(&self, id: i64, new_index: usize) -> Result<(), rusqlite::Error> {
    let conn = self.conn.lock().unwrap();

    // Collect ordered IDs; statement is dropped at end of block
    let ids: Vec<i64> = {
        let mut stmt = conn.prepare(
            "SELECT id FROM snippets ORDER BY sort_order ASC, id ASC",
        )?;
        stmt.query_map([], |row| row.get(0))?
            .collect::<Result<Vec<_>, _>>()?
    };

    let current_pos = ids
        .iter()
        .position(|&x| x == id)
        .ok_or(rusqlite::Error::QueryReturnedNoRows)?;

    let mut ids = ids;
    ids.remove(current_pos);
    let clamped = new_index.min(ids.len());
    ids.insert(clamped, id);

    for (i, &snippet_id) in ids.iter().enumerate() {
        conn.execute(
            "UPDATE snippets SET sort_order = ?1 WHERE id = ?2",
            params![i as i64, snippet_id],
        )?;
    }

    Ok(())
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd src-tauri && cargo test reorder_snippet 2>&1
```

Expected: 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/store/sqlite_store.rs
git commit -m "feat(backend): add reorder_snippet store method"
```

---

## Task 2: Tauri command + registration

**Files:**
- Modify: `src-tauri/src/commands.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Add the command**

In `commands.rs`, add after `delete_snippet` (after line 122):

```rust
#[tauri::command]
pub fn reorder_snippet(id: i64, new_index: usize, store: StoreState) -> Result<(), String> {
    store.reorder_snippet(id, new_index).map_err(|e| e.to_string())
}
```

- [ ] **Step 2: Register the command**

In `lib.rs`, add `commands::reorder_snippet` to the `invoke_handler!` list (after `commands::delete_snippet`, around line 131):

```rust
commands::delete_snippet,
commands::reorder_snippet,
```

- [ ] **Step 3: Build to confirm it compiles**

```bash
cd src-tauri && cargo build 2>&1
```

Expected: compiles without errors.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/commands.rs src-tauri/src/lib.rs
git commit -m "feat(backend): expose reorder_snippet as Tauri command"
```

---

## Task 3: TypeScript service layer

**Files:**
- Modify: `src/app/core/services/tauri-bridge.service.ts`
- Modify: `src/app/core/services/snippets.service.ts`

- [ ] **Step 1: Add bridge method**

In `tauri-bridge.service.ts`, add after `deleteSnippet` (after line 86):

```typescript
reorderSnippet(id: number, newIndex: number): Promise<void> {
  return invoke('reorder_snippet', { id, newIndex });
}
```

- [ ] **Step 2: Add service method**

Replace the entire contents of `snippets.service.ts` with:

```typescript
import { Injectable, inject, resource } from '@angular/core';
import { Snippet } from '../models/snippet.model';
import { TauriBridgeService } from './tauri-bridge.service';

@Injectable({ providedIn: 'root' })
export class SnippetsService {
  private bridge = inject(TauriBridgeService);

  readonly snippets = resource({
    loader: () => this.bridge.getSnippets(),
  });

  async createSnippet(title: string, content: string): Promise<void> {
    await this.bridge.createSnippet(title, content);
    this.snippets.reload();
  }

  async updateSnippet(id: number, title: string, content: string): Promise<void> {
    await this.bridge.updateSnippet(id, title, content);
    this.snippets.reload();
  }

  async deleteSnippet(id: number): Promise<void> {
    await this.bridge.deleteSnippet(id);
    this.snippets.reload();
  }

  async reorderSnippet(reordered: Snippet[], id: number, newIndex: number): Promise<void> {
    this.snippets.value.set(reordered);
    try {
      await this.bridge.reorderSnippet(id, newIndex);
    } catch {
      this.snippets.reload();
    }
  }
}
```

- [ ] **Step 3: Run TypeScript tests**

```bash
npm test
```

Expected: all existing tests pass (no snippet service tests exist — that's fine, the service is covered by the Rust tests and integration).

- [ ] **Step 4: Commit**

```bash
git add src/app/core/services/tauri-bridge.service.ts src/app/core/services/snippets.service.ts
git commit -m "feat(services): add reorderSnippet to bridge and snippets service"
```

---

## Task 4: SnippetItemComponent — drag handle

**Files:**
- Modify: `src/app/features/clipboard-list/snippet-item.component.ts`

The `cdkDragHandle` directive uses Angular's DI hierarchy to register itself with the ancestor `CdkDrag` directive (via the `CDK_DRAG_PARENT` injection token provided by `CdkDrag`). Importing `CdkDragHandle` in this component and using it in the template is sufficient — no other wiring is needed here.

- [ ] **Step 1: Update imports and add grip icon**

Replace the entire contents of `snippet-item.component.ts` with:

```typescript
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  effect,
  inject,
  input,
  output,
  viewChild,
} from '@angular/core';
import { CdkDragHandle } from '@angular/cdk/drag-drop';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideGripVertical, lucideX } from '@ng-icons/lucide';
import { TranslatePipe } from '@ngx-translate/core';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmIcon } from '@spartan-ng/helm/icon';
import { Snippet } from '../../core/models/snippet.model';

@Component({
  selector: 'app-snippet-item',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CdkDragHandle, NgIcon, HlmIcon, HlmButton, TranslatePipe],
  providers: [provideIcons({ lucideGripVertical, lucideX })],
  template: `
    <div
      class="flex items-center gap-2 pl-2 pr-3 group transition-colors border-l-2"
      [class.cursor-pointer]="!editMode()"
      [class]="selected() ? 'border-l-brand bg-card' : 'border-l-transparent hover:bg-card/60'"
      (click)="onOuterClick()"
    >
      @if (editMode()) {
        <div class="flex-1 min-w-0 py-2 flex flex-col gap-1.5 pl-1.5" (click)="$event.stopPropagation()">
          <input
            #titleInput
            type="text"
            [value]="snippet().title"
            class="w-full bg-muted/50 text-[13px] font-medium text-foreground rounded-md px-2 py-1 outline-none focus:ring-1 focus:ring-brand/50"
            (keydown)="onTitleKeyDown($event)"
          />
          <textarea
            #contentTextarea
            [value]="snippet().content"
            rows="3"
            class="w-full bg-muted/50 text-[13px] text-foreground rounded-md px-2 py-1.5 resize-none outline-none focus:ring-1 focus:ring-brand/50 min-h-[60px]"
            (keydown)="onContentKeyDown($event)"
          ></textarea>
          <p class="text-[11px] text-muted-foreground">{{ 'SNIPPETS.EDIT_HINT' | translate }}</p>
        </div>
      } @else {
        <span
          cdkDragHandle
          class="opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing shrink-0 text-muted-foreground transition-opacity"
          [class.opacity-100]="selected()"
          (click)="$event.stopPropagation()"
        >
          <ng-icon hlm size="sm" name="lucideGripVertical" />
        </span>
        <div class="flex-1 min-w-0 py-2.5">
          <p class="text-[13px] font-medium text-foreground truncate leading-snug">{{ snippet().title }}</p>
          <p class="text-[11px] text-muted-foreground truncate mt-0.5">{{ snippet().content }}</p>
        </div>
        <button
          hlmBtn variant="ghost" size="icon"
          class="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-red-400 hover:bg-red-500/10"
          [class.opacity-100]="selected()"
          [title]="'ENTRY.DELETE' | translate"
          (click)="$event.stopPropagation(); delete.emit()"
        >
          <ng-icon hlm size="sm" name="lucideX" />
        </button>
      }
    </div>
  `,
})
export class SnippetItemComponent {
  snippet  = input.required<Snippet>();
  selected = input(false);
  editMode = input(false);

  select      = output<void>();
  delete      = output<void>();
  editConfirm = output<{ title: string; content: string }>();
  editCancel  = output<void>();

  private titleInput      = viewChild<ElementRef<HTMLInputElement>>('titleInput');
  private contentTextarea = viewChild<ElementRef<HTMLTextAreaElement>>('contentTextarea');
  private injector        = inject(Injector);

  constructor() {
    effect(() => {
      if (this.editMode()) {
        afterNextRender(() => {
          this.titleInput()?.nativeElement.focus();
        }, { injector: this.injector });
      }
    });
  }

  protected onOuterClick(): void {
    if (!this.editMode()) this.select.emit();
  }

  protected onTitleKeyDown(event: KeyboardEvent): void {
    const action = resolveSnippetTitleKey(event.key, event.ctrlKey);
    if (!action) return;
    event.preventDefault();
    event.stopPropagation();
    if (action === 'cancel') {
      this.editCancel.emit();
    } else if (action === 'submit') {
      this.emitConfirm();
    } else {
      this.contentTextarea()?.nativeElement.focus();
    }
  }

  protected onContentKeyDown(event: KeyboardEvent): void {
    const action = resolveSnippetContentKey(event.key, event.ctrlKey);
    if (!action) return;
    event.preventDefault();
    event.stopPropagation();
    if (action === 'cancel') {
      this.editCancel.emit();
    } else {
      this.emitConfirm();
    }
  }

  private emitConfirm(): void {
    const title   = this.titleInput()?.nativeElement.value ?? '';
    const content = this.contentTextarea()?.nativeElement.value ?? '';
    this.editConfirm.emit({ title, content });
  }
}

export function resolveSnippetTitleKey(
  key: string,
  ctrlKey: boolean,
): 'submit' | 'move-to-content' | 'cancel' | null {
  if (key === 'Escape') return 'cancel';
  if (key === 'Enter' && ctrlKey) return 'submit';
  if ((key === 'Enter' || key === 'Tab') && !ctrlKey) return 'move-to-content';
  return null;
}

export function resolveSnippetContentKey(
  key: string,
  ctrlKey: boolean,
): 'submit' | 'cancel' | null {
  if (key === 'Escape') return 'cancel';
  if (key === 'Enter' && ctrlKey) return 'submit';
  return null;
}
```

Note: `pl-3.5` on the outer div changed to `pl-2` to accommodate the grip icon width. The `pl-1.5` is added inside the edit-mode form div to restore the visual indent in edit mode.

- [ ] **Step 2: Run existing snippet tests**

```bash
npm test
```

Expected: all tests in `snippet-item.component.spec.ts` still pass (they only test the pure key-resolver functions, which are unchanged).

- [ ] **Step 3: Commit**

```bash
git add src/app/features/clipboard-list/snippet-item.component.ts
git commit -m "feat(ui): add drag handle to SnippetItemComponent"
```

---

## Task 5: ClipboardListComponent — drop list + handler

**Files:**
- Modify: `src/app/features/clipboard-list/clipboard-list.component.ts`

- [ ] **Step 1: Add CDK imports to the component**

In `clipboard-list.component.ts`, add to the existing import block at the top:

```typescript
import { CdkDropList, CdkDrag, CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';
```

Add `CdkDropList` and `CdkDrag` to the component's `imports` array (inside `@Component`). The existing `imports` array starts around line 42 — add the two CDK directives to it:

```typescript
imports: [
  CdkDropList,
  CdkDrag,
  ClipboardEntryComponent,
  // ... rest of existing imports unchanged
],
```

- [ ] **Step 2: Apply `cdkDropList` and `cdkDrag` in the template**

Find the snippet list section in the template (around line 203). Change:

```html
<div class="py-1">
  @if (showNewSnippetForm()) {
    <app-new-snippet-form
      (saved)="onSnippetCreated($event)"
      (cancelled)="onSnippetFormCancelled()"
    />
  }
  @for (snippet of allSnippets(); track snippet.id; let i = $index) {
    <div class="snippet-item">
      <app-snippet-item
        [snippet]="snippet"
        [selected]="snippetSelectedIndex() === i"
        [editMode]="editingSnippetId() === snippet.id"
        (select)="selectSnippet(i)"
        (delete)="deleteSnippetByIndex(i)"
        (editConfirm)="onSnippetEditConfirm($event)"
        (editCancel)="onSnippetEditCancel()"
      />
    </div>
  }
</div>
```

To:

```html
<div
  cdkDropList
  (cdkDropListDropped)="onSnippetDrop($event)"
  class="py-1"
>
  @if (showNewSnippetForm()) {
    <app-new-snippet-form
      (saved)="onSnippetCreated($event)"
      (cancelled)="onSnippetFormCancelled()"
    />
  }
  @for (snippet of allSnippets(); track snippet.id; let i = $index) {
    <div
      class="snippet-item"
      cdkDrag
      [cdkDragData]="snippet"
      [cdkDragDisabled]="editingSnippetId() !== null"
    >
      <app-snippet-item
        [snippet]="snippet"
        [selected]="snippetSelectedIndex() === i"
        [editMode]="editingSnippetId() === snippet.id"
        (select)="selectSnippet(i)"
        (delete)="deleteSnippetByIndex(i)"
        (editConfirm)="onSnippetEditConfirm($event)"
        (editCancel)="onSnippetEditCancel()"
      />
    </div>
  }
</div>
```

- [ ] **Step 3: Add the drop handler method**

In the component class (in `clipboard-list.component.ts`), add `onSnippetDrop` near the other snippet methods (e.g., after `onSnippetEditCancel`):

```typescript
protected onSnippetDrop(event: CdkDragDrop<Snippet[]>): void {
  if (event.previousIndex === event.currentIndex) return;
  const snippet = event.item.data as Snippet;
  const reordered = [...this.allSnippets()];
  moveItemInArray(reordered, event.previousIndex, event.currentIndex);
  this.snippetsService.reorderSnippet(reordered, snippet.id, event.currentIndex);
}
```

- [ ] **Step 4: Run TypeScript build check**

```bash
npx ng build --configuration development 2>&1 | tail -20
```

Expected: builds without type errors.

- [ ] **Step 5: Run tests**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/app/features/clipboard-list/clipboard-list.component.ts
git commit -m "feat(ui): add drag-and-drop reordering to snippets list"
```

---

## Self-Review

**Spec coverage check:**
- ✅ Grip handle (`lucideGripVertical`, hover-visible, hidden in edit mode) — Task 4
- ✅ Backend `reorder_snippet(id, new_index)` normalizes all sort_orders — Task 1
- ✅ Tauri command exposed and registered — Task 2
- ✅ Optimistic update via `snippets.value.set()` — Task 3
- ✅ Error recovery via `snippets.reload()` — Task 3
- ✅ Duplicate sort_orders normalized on first drag — Task 1 (test: `test_reorder_snippet_normalizes_duplicates`)
- ✅ Drag disabled in edit mode (`[cdkDragDisabled]="editingSnippetId() !== null"`) — Task 5
- ✅ Click-to-select unaffected (`cdkDragHandle` scopes drag to grip icon only) — Task 4
- ✅ `sort_order` always assigned on create, no schema change needed — existing behavior

**Placeholder scan:** No TBDs, all code is complete.

**Type consistency:** `Snippet[]` used consistently across all tasks. `reorderSnippet(reordered: Snippet[], id: number, newIndex: number)` defined in Task 3, called with matching signature in Task 5. `CdkDragDrop<Snippet[]>` event type matches `[cdkDragData]="snippet"` binding.
