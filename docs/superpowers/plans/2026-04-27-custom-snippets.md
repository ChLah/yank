# Custom Snippets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Snippets tab alongside Recent and Pinned where users define reusable text templates with optional `{{placeholder}}` variables filled in interactively at paste time.

**Architecture:** A new `snippets` SQLite table stores title/content/sort_order. Four Tauri commands expose CRUD to the frontend. A new `SnippetsService` (Angular resource pattern) wraps the commands. `ClipboardListComponent` gains a third tab with its own keyboard handler; a standalone `NewSnippetFormComponent` handles inline creation, `SnippetItemComponent` handles inline edit, and `PlaceholderOverlayComponent` handles fill-in before paste. The search bar is hidden when the Snippets tab is active. Filled snippets are pasted via `set_clipboard_text` directly so they never appear in clipboard history.

**Tech Stack:** Rust (rusqlite), Tauri 2 commands, Angular 18 (signals, resource API, OnPush), Tailwind CSS / spartan-ng.

---

## File Structure

**New files:**
- `src/app/core/services/snippets.service.ts` — `SnippetsService` with resource signal and CRUD methods
- `src/app/features/clipboard-list/new-snippet-form.component.ts` — inline creation form (N key)
- `src/app/features/clipboard-list/snippet-item.component.ts` — single snippet row with inline edit (E key)
- `src/app/features/clipboard-list/snippet-item.component.spec.ts` — unit tests for snippet item
- `src/app/features/clipboard-list/placeholder-overlay.component.ts` — fill-in overlay for `{{...}}` tokens
- `src/app/features/clipboard-list/placeholder-overlay.component.spec.ts` — unit tests for placeholder parsing

**Modified files:**
- `src-tauri/src/models.rs` — add `Snippet` struct
- `src-tauri/src/store/sqlite_store.rs` — `snippets` table DDL, migration, and four CRUD methods
- `src-tauri/src/commands.rs` — four snippet Tauri commands
- `src-tauri/src/lib.rs` — register snippet commands in invoke handler
- `src/app/core/services/tauri-bridge.service.ts` — four snippet bridge methods
- `src/app/features/clipboard-list/clipboard-list.component.ts` — Snippets tab, keyboard routing, paste logic, hidden search bar

---

## Task 1: Rust model and SQLite schema

**Files:**
- Modify: `src-tauri/src/models.rs`
- Modify: `src-tauri/src/store/sqlite_store.rs`

- [x] **Step 1: Add `Snippet` struct to `models.rs`**

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Snippet {
    pub id: i64,
    pub title: String,
    pub content: String,
    pub created_at: i64,
    pub sort_order: i64,
}
```

- [x] **Step 2: Add `snippets` table to `run_migrations` in `sqlite_store.rs`**

```sql
CREATE TABLE IF NOT EXISTS snippets (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    title       TEXT    NOT NULL,
    content     TEXT    NOT NULL,
    created_at  INTEGER NOT NULL,
    sort_order  INTEGER NOT NULL DEFAULT 0
);
```

- [x] **Step 3: Implement the four CRUD methods on `SqliteStore`**

```rust
pub fn get_snippets(&self) -> Result<Vec<Snippet>, rusqlite::Error>
pub fn create_snippet(&self, title: &str, content: &str) -> Result<Snippet, rusqlite::Error>
pub fn update_snippet(&self, id: i64, title: &str, content: &str) -> Result<Snippet, rusqlite::Error>
pub fn delete_snippet(&self, id: i64) -> Result<(), rusqlite::Error>
```

- `get_snippets` orders by `sort_order ASC, id ASC`.
- `create_snippet` assigns `sort_order = MAX(sort_order) + 1` (or 0 on empty table).
- `update_snippet` touches only `title` and `content`; preserves `created_at` and `sort_order`.
- `delete_snippet` is a hard delete.

- [x] **Step 4: Run `cargo check` to verify compilation**

```bash
cd src-tauri && cargo check
```

- [x] **Step 5: Commit**

```bash
git add src-tauri/src/models.rs src-tauri/src/store/sqlite_store.rs
git commit -m "feat(snippets): add Snippet model, table schema, and store CRUD"
```

---

## Task 2: Tauri commands

**Files:**
- Modify: `src-tauri/src/commands.rs`
- Modify: `src-tauri/src/lib.rs`

- [x] **Step 1: Add four commands to `commands.rs`**

```rust
#[tauri::command]
pub fn get_snippets(store: StoreState) -> Result<Vec<Snippet>, String> {
    store.get_snippets().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_snippet(title: String, content: String, store: StoreState) -> Result<Snippet, String> {
    store.create_snippet(&title, &content).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_snippet(id: i64, title: String, content: String, store: StoreState) -> Result<Snippet, String> {
    store.update_snippet(id, &title, &content).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_snippet(id: i64, store: StoreState) -> Result<(), String> {
    store.delete_snippet(id).map_err(|e| e.to_string())
}
```

- [x] **Step 2: Register commands in `lib.rs` invoke handler**

Add all four to `tauri::generate_handler![...]`:
```rust
commands::get_snippets,
commands::create_snippet,
commands::update_snippet,
commands::delete_snippet,
```

- [x] **Step 3: Run `cargo check`**

- [x] **Step 4: Commit**

```bash
git add src-tauri/src/commands.rs src-tauri/src/lib.rs
git commit -m "feat(snippets): register get/create/update/delete Tauri commands"
```

---

## Task 3: TauriBridgeService methods

**Files:**
- Modify: `src/app/core/services/tauri-bridge.service.ts`

- [x] **Step 1: Add four bridge methods**

```typescript
getSnippets(): Promise<Snippet[]> {
  return invoke<Snippet[]>('get_snippets');
}
createSnippet(title: string, content: string): Promise<Snippet> {
  return invoke<Snippet>('create_snippet', { title, content });
}
updateSnippet(id: number, title: string, content: string): Promise<Snippet> {
  return invoke<Snippet>('update_snippet', { id, title, content });
}
deleteSnippet(id: number): Promise<void> {
  return invoke<void>('delete_snippet', { id });
}
```

- [x] **Step 2: Verify TypeScript**

```bash
pnpm exec tsc --noEmit
```

- [x] **Step 3: Commit**

```bash
git add src/app/core/services/tauri-bridge.service.ts
git commit -m "feat(snippets): add snippet methods to TauriBridgeService"
```

---

## Task 4: SnippetsService

**Files:**
- Create: `src/app/core/services/snippets.service.ts`

- [x] **Step 1: Create `SnippetsService` using Angular resource API**

```typescript
@Injectable({ providedIn: 'root' })
export class SnippetsService {
  private bridge = inject(TauriBridgeService);

  snippets = resource({ loader: () => this.bridge.getSnippets() });

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
}
```

- [x] **Step 2: Verify TypeScript**

```bash
pnpm exec tsc --noEmit
```

- [x] **Step 3: Commit**

```bash
git add src/app/core/services/snippets.service.ts
git commit -m "feat(snippets): add SnippetsService with resource-based signal"
```

---

## Task 5: PlaceholderOverlayComponent

**Files:**
- Create: `src/app/features/clipboard-list/placeholder-overlay.component.ts`
- Create: `src/app/features/clipboard-list/placeholder-overlay.component.spec.ts`

- [x] **Step 1: Write failing test for `extractPlaceholders`**

```typescript
describe('extractPlaceholders', () => {
  it('returns unique placeholder names in order of first appearance', () => {
    const result = extractPlaceholders('Dear {{recipient}}, see {{document}}. Regards {{recipient}}');
    expect(result).toEqual(['recipient', 'document']);
  });

  it('returns empty array when no placeholders', () => {
    expect(extractPlaceholders('Hello world')).toEqual([]);
  });
});
```

- [x] **Step 2: Implement `PlaceholderOverlayComponent`**

The component:
- Accepts `content: string` and emits `confirmed: string` / `cancelled: void`
- Calls `extractPlaceholders(content)` to build unique field list
- Renders one labeled `<input>` per placeholder
- On `Escape`, emits `cancelled`
- On `Enter`, substitutes all occurrences and emits `confirmed` with the result

```typescript
export function extractPlaceholders(content: string): string[] {
  const regex = /\{\{([a-zA-Z0-9_-]+)\}\}/g;
  const seen = new Set<string>();
  const result: string[] = [];
  for (const match of content.matchAll(regex)) {
    if (!seen.has(match[1])) { seen.add(match[1]); result.push(match[1]); }
  }
  return result;
}
```

- [x] **Step 3: Run tests to verify they pass**

```bash
pnpm test -- --testPathPattern placeholder-overlay
```

- [x] **Step 4: Commit**

```bash
git add src/app/features/clipboard-list/placeholder-overlay.component.ts src/app/features/clipboard-list/placeholder-overlay.component.spec.ts
git commit -m "feat(snippets): add PlaceholderOverlayComponent and extractPlaceholders"
```

---

## Task 6: NewSnippetFormComponent and SnippetItemComponent

**Files:**
- Create: `src/app/features/clipboard-list/new-snippet-form.component.ts`
- Create: `src/app/features/clipboard-list/snippet-item.component.ts`
- Create: `src/app/features/clipboard-list/snippet-item.component.spec.ts`

- [x] **Step 1: Implement `NewSnippetFormComponent`**

Inline form shown when the `N` key is pressed. Renders Title and Body fields with Save / Cancel buttons. Validation:
- Empty title is rejected with an inline error message.
- `Ctrl+Enter` in the Body field submits (same as Save).
- `Esc` cancels without saving.
- `Tab` cycles Title → Body → Save → Cancel.

Emits `saved: { title: string; content: string }` and `cancelled: void`.

- [x] **Step 2: Implement `SnippetItemComponent`**

Renders a single snippet row. Accepts `snippet: Snippet`, `selected: boolean`, `editMode: boolean`.
- In view mode: shows title + truncated content preview.
- In edit mode: shows inline textarea for title and body, Save / Cancel.

Emits `select`, `delete`, `editConfirm: { title; content }`, `editCancel`.

- [x] **Step 3: Add unit tests for `SnippetItemComponent`**

Test that edit mode input swap and keyboard handlers work correctly.

- [x] **Step 4: Commit**

```bash
git add src/app/features/clipboard-list/new-snippet-form.component.ts src/app/features/clipboard-list/snippet-item.component.ts src/app/features/clipboard-list/snippet-item.component.spec.ts
git commit -m "feat(snippets): add NewSnippetFormComponent and SnippetItemComponent"
```

---

## Task 7: Snippets tab in ClipboardListComponent

**Files:**
- Modify: `src/app/features/clipboard-list/clipboard-list.component.ts`

- [x] **Step 1: Add `'snippets'` to the `Tab` union and tab definitions**

```typescript
type Tab = 'recent' | 'pinned' | 'snippets';
```

Register the third tab entry in the tab definitions array.

- [x] **Step 2: Inject `SnippetsService` and add snippet state signals**

```typescript
protected snippetsService = inject(SnippetsService);
protected showNewSnippetForm = signal(false);
protected snippetSelectedIndex = signal(0);
protected editingSnippetId = signal<number | null>(null);
protected overlaySnippetId = signal<number | null>(null);
```

- [x] **Step 3: Hide search bar when Snippets tab is active**

Wrap the search bar with:
```html
@if (activeTab() !== 'snippets') { ... }
```

- [x] **Step 4: Add Snippets tab content to the template**

The tab content block renders:
- Loading skeleton when `snippets.isLoading()`
- Error state when `snippets.error()`
- `<app-new-snippet-form>` at the top when `showNewSnippetForm()`
- List of `<app-snippet-item>` for each snippet
- `<app-placeholder-overlay>` when `overlaySnippetId()` is set
- Empty state with instructions when snippet list is empty

- [x] **Step 5: Route Snippets tab keys in `onKeyDown`**

When `activeTab() === 'snippets'`:

| Key | Action |
|-----|--------|
| `ArrowUp` / `ArrowDown` | `moveSnippetSelection(±1)` |
| `Enter` | `pasteOrOverlaySnippet()` — checks `extractPlaceholders`; shows overlay or calls `bridge.setClipboardText` + `bridge.hidePopup` |
| `E` | `enterSnippetEditMode()` — sets `editingSnippetId` |
| `N` | `showNewSnippetForm.set(true)` |
| `Delete` | `deleteSnippetByIndex()` |
| `Esc` | `bridge.hidePopup()` or cancel active form |

- [x] **Step 6: Handle `Ctrl+Tab` / `Ctrl+Shift+Tab` to include Snippets tab**

`cycleTab(±1)` already cycles through all three tabs; no change needed once the tab is registered.

- [x] **Step 7: Wire save/cancel/confirm from child components**

- `NewSnippetFormComponent` `(saved)` → `snippetsService.createSnippet(title, content)` + `showNewSnippetForm.set(false)`
- `SnippetItemComponent` `(editConfirm)` → `snippetsService.updateSnippet(id, title, content)` + clear `editingSnippetId`
- `PlaceholderOverlayComponent` `(confirmed)` → `bridge.setClipboardText(result)` + `bridge.hidePopup()` (filled snippet is **not** added to history)
- `PlaceholderOverlayComponent` `(cancelled)` → clear `overlaySnippetId`

- [x] **Step 8: Verify TypeScript**

```bash
pnpm exec tsc --noEmit
```

- [x] **Step 9: Commit**

```bash
git add src/app/features/clipboard-list/clipboard-list.component.ts
git commit -m "feat(snippets): integrate Snippets tab into ClipboardListComponent"
```

---

## Task 8: Build verification

- [x] **Step 1: Run all Rust tests**

```bash
cd src-tauri && cargo test
```

- [x] **Step 2: Run all Angular tests**

```bash
pnpm test
```

- [x] **Step 3: Build the full app**

```bash
pnpm tauri build
```

- [x] **Step 4: Manual smoke test**

1. Launch the app (`pnpm tauri dev`)
2. Press `Ctrl+Tab` twice to reach the Snippets tab — verify search bar disappears
3. Press `N` — verify inline creation form appears with Title and Body fields
4. Fill in a title and body without `{{...}}` tokens, press Save — verify snippet appears in list
5. Press `Enter` on the snippet — verify it is pasted and the popup closes; confirm the entry does **not** appear in the Recent tab
6. Create a snippet with `{{recipient}}` and `{{document}}` in the body
7. Press `Enter` — verify the placeholder overlay appears with two labeled inputs
8. Fill in the fields and press `Enter` — verify the substituted text is pasted and popup closes
9. Press `Esc` in the overlay — verify it dismisses and returns to the snippet list
10. Press `E` on a snippet — verify inline edit mode
11. Press `Delete` on a snippet — verify it is removed

---

## Spec Coverage Checklist

| Spec requirement | Task |
|---|---|
| `Snippet` model (id, title, content, created_at, sort_order) | Task 1, Step 1 |
| `snippets` SQLite table with correct DDL | Task 1, Step 2 |
| `get_snippets` ordered by sort_order ASC, id ASC | Task 1, Step 3 |
| `create_snippet` auto-increments sort_order | Task 1, Step 3 |
| `update_snippet` title and content only | Task 1, Step 3 |
| `delete_snippet` hard delete | Task 1, Step 3 |
| Tauri commands registered | Task 2 |
| `SnippetsService` with `snippets` signal and CRUD | Task 4 |
| Snippets tab alongside Recent and Pinned | Task 7, Step 1 |
| `Ctrl+Tab` / `Ctrl+Shift+Tab` tab cycling | Task 7, Step 6 |
| Search bar hidden in Snippets tab | Task 7, Step 3 |
| `N` key opens inline creation form | Task 7, Step 5 |
| Inline form: Title + Body, Tab navigation, Ctrl+Enter submit, Esc cancel | Task 6, Step 1 |
| Empty title rejected with validation message | Task 6, Step 1 |
| `↑` / `↓` navigate snippets | Task 7, Step 5 |
| `Enter` pastes snippet (no placeholders) | Task 7, Step 5 |
| `Enter` opens placeholder overlay (when `{{...}}` found) | Task 7, Step 5 |
| `E` key enters inline edit mode | Task 7, Step 5 |
| `Delete` key deletes focused snippet | Task 7, Step 5 |
| `Esc` closes window / cancels form | Task 7, Step 5 |
| `{{name}}` placeholder syntax (letters, digits, hyphens, underscores) | Task 5, Step 1 |
| Placeholder names are case-sensitive | Task 5 (`extractPlaceholders` regex) |
| Multiple occurrences of same name → single field | Task 5 (`extractPlaceholders` dedup) |
| Overlay: one input per unique placeholder in order of appearance | Task 5, Step 2 |
| Overlay: `Enter` confirms, substitutes all occurrences, pastes result | Task 5 + Task 7, Step 7 |
| Overlay: `Esc` cancels and returns to snippet list | Task 7, Step 7 |
| Filled snippet pasted via `set_clipboard_text` (not added to history) | Task 7, Step 7 |
| Snippets permanent — never auto-deleted | Design constraint (no TTL in schema) |
| Snippet ordering via `sort_order` | Task 1, Step 3 |
