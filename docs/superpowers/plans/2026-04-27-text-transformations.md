# Text Transformations Before Paste — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow users to paste a transformed version of a text clipboard entry by pressing Shift+Enter, choosing a transform from an overlay picker, and optionally saving the result back to history.

**Architecture:** A new `TransformService` (pure functions, no state) powers a `TransformPickerComponent` (standalone overlay) that is rendered inline inside `ClipboardListComponent` for the selected entry. Two new Tauri commands (`set_clipboard_text`, `update_entry_content`) handle the clipboard write and optional DB update. No new Tauri plugins required — `arboard` is already a dependency.

**Tech Stack:** Angular 21 (signals, standalone components, `afterNextRender`), Tauri 2, arboard 3, rusqlite 0.32, Vitest, ngx-translate

---

## File Structure

**New frontend files:**
- `src/app/core/services/transform.service.ts` — `TransformService`: 8 pure transform functions, `TransformOption[]` list, `TransformResult` type
- `src/app/core/services/transform.service.spec.ts` — unit tests for all 8 transforms including error cases
- `src/app/features/clipboard-list/transform-picker.component.ts` — standalone overlay component: keyboard navigation, inline error display, "Save to history" checkbox

**Modified frontend files:**
- `src/app/i18n/translation.interface.ts` — add `TRANSFORM` section to `Translation` interface
- `src/app/i18n/en.ts` — English strings for TRANSFORM namespace
- `src/app/i18n/de.ts` — German strings for TRANSFORM namespace
- `src/app/core/services/tauri-bridge.service.ts` — add `setClipboardText()` and `updateEntryContent()`
- `src/app/features/clipboard-list/clipboard-list.component.ts` — Shift+Enter trigger, picker rendering, apply/cancel handlers, duplicate error banner

**Modified backend files:**
- `src-tauri/src/store/sqlite_store.rs` — add `update_entry_content()` method with hash collision detection
- `src-tauri/src/commands.rs` — add `set_clipboard_text` and `update_entry_content` command handlers
- `src-tauri/src/lib.rs` — register both new commands in `invoke_handler`

---

## Task 1: TransformService — pure transform functions

**Files:**
- Create: `src/app/core/services/transform.service.ts`
- Create: `src/app/core/services/transform.service.spec.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/app/core/services/transform.service.spec.ts`:

```typescript
import { TransformService } from './transform.service';

describe('TransformService', () => {
  let service: TransformService;

  beforeEach(() => { service = new TransformService(); });

  it('strip-whitespace trims and collapses internal spaces', () => {
    expect(service.apply('strip-whitespace', '  hello   world  ')).toEqual({ ok: true, value: 'hello world' });
  });

  it('uppercase converts to upper case', () => {
    expect(service.apply('uppercase', 'hello world')).toEqual({ ok: true, value: 'HELLO WORLD' });
  });

  it('lowercase converts to lower case', () => {
    expect(service.apply('lowercase', 'HELLO WORLD')).toEqual({ ok: true, value: 'hello world' });
  });

  it('title-case capitalizes first letter of each word', () => {
    expect(service.apply('title-case', 'hello world foo')).toEqual({ ok: true, value: 'Hello World Foo' });
  });

  it('url-encode encodes special characters', () => {
    expect(service.apply('url-encode', 'hello world&foo=1')).toEqual({ ok: true, value: 'hello%20world%26foo%3D1' });
  });

  it('url-decode decodes an encoded string', () => {
    expect(service.apply('url-decode', 'hello%20world')).toEqual({ ok: true, value: 'hello world' });
  });

  it('url-decode returns error on invalid encoding', () => {
    const r = service.apply('url-decode', '%invalid');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('TRANSFORM.ERROR_URL_DECODE');
  });

  it('json-format formats valid JSON with 2-space indent', () => {
    expect(service.apply('json-format', '{"a":1}')).toEqual({ ok: true, value: '{\n  "a": 1\n}' });
  });

  it('json-format returns error on invalid JSON', () => {
    const r = service.apply('json-format', 'not json');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('TRANSFORM.ERROR_JSON');
  });

  it('strip-html removes all HTML tags', () => {
    expect(service.apply('strip-html', '<b>hello</b> <i>world</i>')).toEqual({ ok: true, value: 'hello world' });
  });

  it('options list contains all 8 transforms', () => {
    expect(service.options).toHaveLength(8);
    const ids = service.options.map(o => o.id);
    expect(ids).toContain('strip-whitespace');
    expect(ids).toContain('json-format');
    expect(ids).toContain('strip-html');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test
```

Expected: FAIL — `Cannot find module './transform.service'`

- [ ] **Step 3: Implement the service**

Create `src/app/core/services/transform.service.ts`:

```typescript
import { Injectable } from '@angular/core';

export type TransformId =
  | 'strip-whitespace'
  | 'uppercase'
  | 'lowercase'
  | 'title-case'
  | 'url-encode'
  | 'url-decode'
  | 'json-format'
  | 'strip-html';

export interface TransformOption {
  id: TransformId;
  labelKey: string;
}

export type TransformResult =
  | { ok: true; value: string }
  | { ok: false; error: string };

@Injectable({ providedIn: 'root' })
export class TransformService {
  readonly options: TransformOption[] = [
    { id: 'strip-whitespace', labelKey: 'TRANSFORM.STRIP_WHITESPACE' },
    { id: 'uppercase',        labelKey: 'TRANSFORM.UPPERCASE' },
    { id: 'lowercase',        labelKey: 'TRANSFORM.LOWERCASE' },
    { id: 'title-case',       labelKey: 'TRANSFORM.TITLE_CASE' },
    { id: 'url-encode',       labelKey: 'TRANSFORM.URL_ENCODE' },
    { id: 'url-decode',       labelKey: 'TRANSFORM.URL_DECODE' },
    { id: 'json-format',      labelKey: 'TRANSFORM.JSON_FORMAT' },
    { id: 'strip-html',       labelKey: 'TRANSFORM.STRIP_HTML' },
  ];

  apply(id: TransformId, content: string): TransformResult {
    switch (id) {
      case 'strip-whitespace':
        return { ok: true, value: content.trim().replace(/\s+/g, ' ') };
      case 'uppercase':
        return { ok: true, value: content.toUpperCase() };
      case 'lowercase':
        return { ok: true, value: content.toLowerCase() };
      case 'title-case':
        return { ok: true, value: content.replace(/\b\w/g, c => c.toUpperCase()) };
      case 'url-encode':
        return { ok: true, value: encodeURIComponent(content) };
      case 'url-decode':
        try {
          return { ok: true, value: decodeURIComponent(content) };
        } catch {
          return { ok: false, error: 'TRANSFORM.ERROR_URL_DECODE' };
        }
      case 'json-format':
        try {
          return { ok: true, value: JSON.stringify(JSON.parse(content), null, 2) };
        } catch {
          return { ok: false, error: 'TRANSFORM.ERROR_JSON' };
        }
      case 'strip-html':
        return { ok: true, value: content.replace(/<[^>]+>/g, '') };
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm test
```

Expected: All 11 `TransformService` tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/core/services/transform.service.ts src/app/core/services/transform.service.spec.ts
git commit -m "feat(transforms): add TransformService with 8 pure text transforms"
```

---

## Task 2: i18n — TRANSFORM translation keys

**Files:**
- Modify: `src/app/i18n/translation.interface.ts`
- Modify: `src/app/i18n/en.ts`
- Modify: `src/app/i18n/de.ts`

- [ ] **Step 1: Add TRANSFORM to the Translation interface**

In `src/app/i18n/translation.interface.ts`, add after the `IMAGE_PREVIEW` block:

```typescript
  TRANSFORM: {
    STRIP_WHITESPACE: string;
    UPPERCASE: string;
    LOWERCASE: string;
    TITLE_CASE: string;
    URL_ENCODE: string;
    URL_DECODE: string;
    JSON_FORMAT: string;
    STRIP_HTML: string;
    SAVE_TO_HISTORY: string;
    ERROR_JSON: string;
    ERROR_URL_DECODE: string;
    HINT: string;
    DUPLICATE_ERROR: string;
  };
```

- [ ] **Step 2: Add English strings**

In `src/app/i18n/en.ts`, add after the `IMAGE_PREVIEW` block (before the closing `}`):

```typescript
  TRANSFORM: {
    STRIP_WHITESPACE: 'Strip whitespace',
    UPPERCASE: 'UPPERCASE',
    LOWERCASE: 'lowercase',
    TITLE_CASE: 'Title Case',
    URL_ENCODE: 'URL Encode',
    URL_DECODE: 'URL Decode',
    JSON_FORMAT: 'JSON Format',
    STRIP_HTML: 'Strip HTML',
    SAVE_TO_HISTORY: 'Save to history',
    ERROR_JSON: 'Not valid JSON',
    ERROR_URL_DECODE: 'Invalid URL encoding',
    HINT: 'transform',
    DUPLICATE_ERROR: 'A duplicate entry already exists.',
  },
```

- [ ] **Step 3: Add German strings**

In `src/app/i18n/de.ts`, add after the `IMAGE_PREVIEW` block (before the closing `}`):

```typescript
  TRANSFORM: {
    STRIP_WHITESPACE: 'Leerzeichen entfernen',
    UPPERCASE: 'GROSSBUCHSTABEN',
    LOWERCASE: 'kleinbuchstaben',
    TITLE_CASE: 'Großschreibung',
    URL_ENCODE: 'URL kodieren',
    URL_DECODE: 'URL dekodieren',
    JSON_FORMAT: 'JSON formatieren',
    STRIP_HTML: 'HTML entfernen',
    SAVE_TO_HISTORY: 'Im Verlauf speichern',
    ERROR_JSON: 'Ungültiges JSON',
    ERROR_URL_DECODE: 'Ungültige URL-Kodierung',
    HINT: 'transformieren',
    DUPLICATE_ERROR: 'Ein identischer Eintrag existiert bereits.',
  },
```

- [ ] **Step 4: Run tests to verify TypeScript compiles**

```bash
pnpm test
```

Expected: All tests PASS (TypeScript compilation verifies the interface is satisfied)

- [ ] **Step 5: Commit**

```bash
git add src/app/i18n/translation.interface.ts src/app/i18n/en.ts src/app/i18n/de.ts
git commit -m "feat(i18n): add TRANSFORM translation keys (en + de)"
```

---

## Task 3: TauriBridgeService — two new IPC methods

**Files:**
- Modify: `src/app/core/services/tauri-bridge.service.ts`

- [ ] **Step 1: Add `setClipboardText` and `updateEntryContent` methods**

Open `src/app/core/services/tauri-bridge.service.ts`. After the `saveWindowPosition` method (line 54), add:

```typescript
  setClipboardText(text: string): Promise<void> {
    return invoke('set_clipboard_text', { text });
  }

  updateEntryContent(id: number, content: string): Promise<void> {
    return invoke('update_entry_content', { id, content });
  }
```

- [ ] **Step 2: Run tests to verify no regressions**

```bash
pnpm test
```

Expected: All tests PASS

- [ ] **Step 3: Commit**

```bash
git add src/app/core/services/tauri-bridge.service.ts
git commit -m "feat(bridge): add setClipboardText and updateEntryContent IPC methods"
```

---

## Task 4: TransformPickerComponent — overlay UI

**Files:**
- Create: `src/app/features/clipboard-list/transform-picker.component.ts`
- Create: `src/app/features/clipboard-list/transform-picker.component.spec.ts`

- [ ] **Step 1: Write failing test**

Create `src/app/features/clipboard-list/transform-picker.component.spec.ts`:

```typescript
import { TransformPickerComponent } from './transform-picker.component';

describe('TransformPickerComponent', () => {
  it('is defined', () => {
    expect(TransformPickerComponent).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test
```

Expected: FAIL — `Cannot find module './transform-picker.component'`

- [ ] **Step 3: Implement the component**

Create `src/app/features/clipboard-list/transform-picker.component.ts`:

```typescript
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterNextRender,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { TransformService } from '../../core/services/transform.service';

@Component({
  selector: 'app-transform-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe],
  host: {
    class: 'absolute left-0 right-0 z-50 mt-0.5 bg-popover border border-border rounded-lg shadow-xl outline-none',
    tabindex: '0',
    '(keydown)': 'onKeyDown($event)',
  },
  template: `
    <div class="p-1.5">
      @for (opt of transformService.options; track opt.id; let i = $index) {
        <button
          type="button"
          class="w-full text-left text-[12px] px-2.5 py-1.5 rounded transition-colors"
          [class]="cursor() === i ? 'bg-accent text-accent-foreground' : 'text-foreground hover:bg-muted'"
          (click)="confirm(i)">
          {{ opt.labelKey | translate }}
        </button>
      }
    </div>
    @if (errorKey()) {
      <p class="text-[11px] text-destructive px-3 pb-1.5">{{ errorKey()! | translate }}</p>
    }
    <div class="border-t border-border px-3 py-2 flex items-center gap-2">
      <input
        type="checkbox"
        id="picker-save"
        class="accent-indigo-500 cursor-pointer"
        [checked]="saveToHistory()"
        (change)="saveToHistory.set(getChecked($event))"
      />
      <label for="picker-save" class="text-[11px] text-muted-foreground select-none cursor-pointer">
        {{ 'TRANSFORM.SAVE_TO_HISTORY' | translate }}
      </label>
    </div>
  `,
})
export class TransformPickerComponent {
  content = input.required<string>();

  applied  = output<{ transformedContent: string; saveToHistory: boolean }>();
  cancelled = output<void>();

  protected transformService = inject(TransformService);
  private el = inject(ElementRef<HTMLElement>);

  protected cursor       = signal(0);
  protected saveToHistory = signal(false);
  protected errorKey      = signal<string | null>(null);

  constructor() {
    afterNextRender(() => this.el.nativeElement.focus());
  }

  protected getChecked(event: Event): boolean {
    return (event.target as HTMLInputElement).checked;
  }

  protected confirm(index: number): void {
    this.cursor.set(index);
    this.applySelected();
  }

  protected onKeyDown(event: KeyboardEvent): void {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        event.stopPropagation();
        this.cursor.update(c => Math.min(c + 1, this.transformService.options.length - 1));
        break;
      case 'ArrowUp':
        event.preventDefault();
        event.stopPropagation();
        this.cursor.update(c => Math.max(c - 1, 0));
        break;
      case 'Enter':
        event.preventDefault();
        event.stopPropagation();
        this.applySelected();
        break;
      case 'Escape':
        event.preventDefault();
        event.stopPropagation();
        this.cancelled.emit();
        break;
    }
  }

  private applySelected(): void {
    const opt = this.transformService.options[this.cursor()];
    if (!opt) return;
    const result = this.transformService.apply(opt.id, this.content());
    if (!result.ok) {
      this.errorKey.set(result.error);
      return;
    }
    this.errorKey.set(null);
    this.applied.emit({ transformedContent: result.value, saveToHistory: this.saveToHistory() });
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm test
```

Expected: All tests PASS including the new `TransformPickerComponent` test

- [ ] **Step 5: Commit**

```bash
git add src/app/features/clipboard-list/transform-picker.component.ts src/app/features/clipboard-list/transform-picker.component.spec.ts
git commit -m "feat(transform-picker): add TransformPickerComponent overlay"
```

---

## Task 5: ClipboardListComponent — wire Shift+Enter, render picker, handle apply/cancel

**Files:**
- Modify: `src/app/features/clipboard-list/clipboard-list.component.ts`

- [ ] **Step 1: Add imports and new signals**

At the top of `clipboard-list.component.ts`, add `TransformPickerComponent` to the imports list:

```typescript
import { TransformPickerComponent } from './transform-picker.component';
```

In the `@Component` decorator `imports` array, add `TransformPickerComponent`:

```typescript
imports: [ClipboardEntryComponent, RouterLink, NgIcon, HlmIcon, HlmButton, HlmBadge, HlmTabs, HlmTabsList, HlmTabsTrigger, TranslatePipe, PageHeaderComponent, EmptyStateComponent, KeyboardHintComponent, TransformPickerComponent],
```

In the `host` object, add a click handler:

```typescript
host: {
  '(keydown)': 'onKeyDown($event)',
  '(click)':   'onHostClick()',
  'tabindex':  '0',
  'class':     'block outline-none h-full',
},
```

In the class body, add two new signals after `protected isSearching = signal(false);`:

```typescript
protected showTransformPicker = signal(false);
protected duplicateError      = signal(false);
```

- [ ] **Step 2: Update `onKeyDown` to handle Shift+Enter and guard for picker-open state**

Replace the entire `onKeyDown` method (lines 312–375 in the original) with:

```typescript
protected onKeyDown(event: KeyboardEvent): void {
  if (this.showTransformPicker()) return;

  if (this.isSearching()) {
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
        if (event.shiftKey) {
          this.openTransformPicker();
        } else {
          this.copySelected();
        }
        break;
      case 'Escape':
        event.preventDefault();
        this.clearSearch();
        break;
    }
    return;
  }

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
      if (event.shiftKey) {
        this.openTransformPicker();
      } else {
        this.copySelected();
      }
      break;
    case 'Delete':
      event.preventDefault();
      this.deleteEntry(this.selectedIndex());
      break;
    case 'Escape':
      event.preventDefault();
      this.bridge.hidePopup();
      break;
    default:
      if (event.key.length === 1 && !event.ctrlKey && !event.altKey && !event.metaKey) {
        if (event.key.toLowerCase() === 'p') {
          event.preventDefault();
          this.pinSelected();
        } else {
          this.isSearching.set(true);
          this.searchQuery.set(event.key);
          setTimeout(() => {
            const input = this.searchInput?.nativeElement;
            if (input) {
              input.value = this.searchQuery();
              input.focus();
              input.setSelectionRange(input.value.length, input.value.length);
            }
          }, 0);
        }
      }
  }
}
```

- [ ] **Step 3: Add picker-related methods**

After the existing `private copySelected()` method, add:

```typescript
protected onHostClick(): void {
  if (this.showTransformPicker()) {
    this.showTransformPicker.set(false);
    this.hostEl.nativeElement.focus();
  }
}

private openTransformPicker(): void {
  const entry = this.filteredEntries()[this.selectedIndex()];
  if (!entry || entry.kind !== 'text') return;
  this.showTransformPicker.set(true);
}

protected async onTransformApplied(event: { transformedContent: string; saveToHistory: boolean }): Promise<void> {
  this.showTransformPicker.set(false);
  const entry = this.filteredEntries()[this.selectedIndex()];
  if (!entry) return;

  await this.bridge.setClipboardText(event.transformedContent);

  if (event.saveToHistory) {
    try {
      await this.bridge.updateEntryContent(entry.id, event.transformedContent);
      this.clipboard.entries.reload();
    } catch {
      this.duplicateError.set(true);
      setTimeout(() => {
        this.duplicateError.set(false);
        this.bridge.hidePopup();
      }, 2000);
      return;
    }
  }

  this.bridge.hidePopup();
}

protected onTransformCancelled(): void {
  this.showTransformPicker.set(false);
  this.hostEl.nativeElement.focus();
}
```

- [ ] **Step 4: Update the template — entry list**

In the template, find the `@for` loop that contains the `entry-item` div:

```html
@for (entry of filteredEntries(); track entry.id; let i = $index) {
  <div class="entry-item">
    <app-clipboard-entry
      [entry]="entry"
      [selected]="selectedIndex() === i"
      (select)="selectEntry(i)"
      (delete)="deleteEntry(i)"
      (pin)="pinEntry(i)"
    />
  </div>
}
```

Replace with:

```html
@for (entry of filteredEntries(); track entry.id; let i = $index) {
  <div class="entry-item relative">
    <app-clipboard-entry
      [entry]="entry"
      [selected]="selectedIndex() === i"
      (select)="selectEntry(i)"
      (delete)="deleteEntry(i)"
      (pin)="pinEntry(i)"
    />
    @if (showTransformPicker() && selectedIndex() === i && entry.kind === 'text') {
      <app-transform-picker
        [content]="entry.content ?? ''"
        (applied)="onTransformApplied($event)"
        (cancelled)="onTransformCancelled()"
        (click)="$event.stopPropagation()"
      />
    }
  </div>
}
```

- [ ] **Step 5: Update the template — duplicate error banner and keyboard hint**

Find the duplicate error banner location: between the `<!-- Content -->` scroll area and the `<!-- Footer -->` div. Add the banner just before the footer `div`:

```html
@if (duplicateError()) {
  <div class="px-3.5 py-1.5 bg-destructive/10 border-t border-destructive/20 text-[11px] text-destructive shrink-0">
    {{ 'TRANSFORM.DUPLICATE_ERROR' | translate }}
  </div>
}
```

In the footer `div`, add a keyboard hint for Shift+Enter after the existing `HINT_PASTE` hint:

```html
<app-keyboard-hint key="↑↓" [label]="'CLIPBOARD.HINT_NAV' | translate" />
<app-keyboard-hint key="↵" [label]="'CLIPBOARD.HINT_PASTE' | translate" />
<app-keyboard-hint key="⇧↵" [label]="'TRANSFORM.HINT' | translate" />
<app-keyboard-hint key="⌫" [label]="'CLIPBOARD.HINT_DELETE' | translate" />
<app-keyboard-hint key="P" [label]="'CLIPBOARD.HINT_PIN' | translate" />
```

- [ ] **Step 6: Run tests to verify no regressions**

```bash
pnpm test
```

Expected: All tests PASS

- [ ] **Step 7: Commit**

```bash
git add src/app/features/clipboard-list/clipboard-list.component.ts
git commit -m "feat(clipboard-list): add Shift+Enter transform picker integration"
```

---

## Task 6: Rust — `set_clipboard_text` command

**Files:**
- Modify: `src-tauri/src/commands.rs`

- [ ] **Step 1: Add the command to `commands.rs`**

At the end of `src-tauri/src/commands.rs`, add:

```rust
#[tauri::command]
pub fn set_clipboard_text(text: String) -> Result<(), String> {
    let mut clipboard = arboard::Clipboard::new().map_err(|e| e.to_string())?;
    clipboard.set_text(text).map_err(|e| e.to_string())
}
```

- [ ] **Step 2: Verify it compiles**

```bash
cd src-tauri && cargo check
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/commands.rs
git commit -m "feat(rust): add set_clipboard_text Tauri command"
```

---

## Task 7: Rust — `update_entry_content` command + store method

**Files:**
- Modify: `src-tauri/src/store/sqlite_store.rs`
- Modify: `src-tauri/src/commands.rs`

- [ ] **Step 1: Write failing Rust tests**

In `src-tauri/src/store/sqlite_store.rs`, inside the `#[cfg(test)] mod tests` block (after the last existing test), add:

```rust
#[test]
fn test_update_entry_content() {
    let store = in_memory_store();
    store.save_entry(&text_payload("original")).unwrap();
    let id = store.get_all_entries().unwrap()[0].id;

    store.update_entry_content(id, "updated").unwrap();

    let entries = store.get_all_entries().unwrap();
    assert_eq!(entries[0].content.as_deref(), Some("updated"));
}

#[test]
fn test_update_entry_content_hash_collision() {
    let store = in_memory_store();
    store.save_entry(&text_payload("first")).unwrap();
    store.save_entry(&text_payload("second")).unwrap();
    let entries = store.get_all_entries().unwrap();
    let first_id = entries.iter().find(|e| e.content.as_deref() == Some("first")).unwrap().id;

    let err = store.update_entry_content(first_id, "second").unwrap_err();
    assert!(err.to_string().contains("duplicate"));
}
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd src-tauri && cargo test update_entry_content
```

Expected: FAIL — `no method named update_entry_content found`

- [ ] **Step 3: Implement `update_entry_content` in the store**

In `src-tauri/src/store/sqlite_store.rs`, add the following method to the `impl SqliteStore` block (after the `toggle_pin` method):

```rust
pub fn update_entry_content(&self, id: i64, content: &str) -> Result<(), Box<dyn std::error::Error>> {
    let new_hash = compute_hash(content.as_bytes());
    let conn = self.conn.lock().unwrap();
    let collision: Option<i64> = conn
        .query_row(
            "SELECT id FROM entries WHERE hash = ?1 AND id != ?2",
            params![new_hash, id],
            |row| row.get(0),
        )
        .ok();
    if collision.is_some() {
        return Err("duplicate".into());
    }
    conn.execute(
        "UPDATE entries SET content = ?1, hash = ?2 WHERE id = ?3",
        params![content.as_bytes(), new_hash, id],
    )?;
    Ok(())
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd src-tauri && cargo test update_entry_content
```

Expected: Both `test_update_entry_content` and `test_update_entry_content_hash_collision` PASS

- [ ] **Step 5: Add the Tauri command handler**

At the end of `src-tauri/src/commands.rs`, add:

```rust
#[tauri::command]
pub fn update_entry_content(id: i64, content: String, store: StoreState) -> Result<(), String> {
    store.update_entry_content(id, &content).map_err(|e| e.to_string())
}
```

- [ ] **Step 6: Verify it compiles**

```bash
cd src-tauri && cargo check
```

Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/store/sqlite_store.rs src-tauri/src/commands.rs
git commit -m "feat(rust): add update_entry_content store method and Tauri command"
```

---

## Task 8: Register new Rust commands in `lib.rs`

**Files:**
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Add both commands to the invoke_handler**

In `src-tauri/src/lib.rs`, find the `.invoke_handler(tauri::generate_handler![` block (lines 113–124) and add the two new commands:

```rust
.invoke_handler(tauri::generate_handler![
    commands::get_entries,
    commands::set_clipboard,
    commands::delete_entry,
    commands::get_settings,
    commands::save_settings,
    commands::open_image_preview,
    commands::get_entry_image,
    commands::hide_popup,
    commands::toggle_pin,
    commands::save_window_position,
    commands::set_clipboard_text,
    commands::update_entry_content,
])
```

- [ ] **Step 2: Verify the full backend compiles**

```bash
cd src-tauri && cargo check
```

Expected: no errors

- [ ] **Step 3: Run all Rust tests**

```bash
cd src-tauri && cargo test
```

Expected: All tests PASS

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/lib.rs
git commit -m "feat(rust): register set_clipboard_text and update_entry_content commands"
```

---

## Self-Review Against Spec

| Spec requirement | Covered by |
|---|---|
| `Shift+Enter` on text entry opens picker | Task 5, `onKeyDown` + `openTransformPicker()` |
| Ignored on image entries | Task 5, `openTransformPicker` checks `entry.kind !== 'text'` |
| Keyboard-navigable list (arrow keys + Enter) | Task 4, `TransformPickerComponent.onKeyDown` |
| Escape cancels | Task 4, `Escape` case emits `cancelled` |
| Click outside closes | Task 5, `onHostClick` + `stopPropagation` on picker |
| "Save to history" checkbox (default unchecked) | Task 4, `saveToHistory = signal(false)` |
| All 8 transforms | Task 1, `TransformService` |
| Strip whitespace: trim + collapse | Task 1 |
| JSON Format error state (inline, no close) | Task 4, `errorKey` signal stays set, picker stays open |
| URL Decode error state | Task 4, same error path |
| Unchecked: write to clipboard only | Task 5, `onTransformApplied` skips `updateEntryContent` |
| Checked: also update DB entry | Task 5, `onTransformApplied` calls `updateEntryContent` |
| Hash collision: toast, paste proceeds | Task 5, `duplicateError` banner + 2s delay before `hidePopup` |
| `set_clipboard_text` Tauri command | Task 6 |
| `update_entry_content` Tauri command | Task 7 |
| Hash recalculated on update | Task 7, `compute_hash` in store method |
| Popup closes after apply | Task 5, `hidePopup()` call |
| i18n for all new strings | Task 2 |
