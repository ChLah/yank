# Ctrl+P / Ctrl+E Shortcut Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace bare `P` (pin) and `E` (edit) shortcuts with `Ctrl+P` and `Ctrl+E` so they no longer interfere with the type-to-search feature.

**Architecture:** The keyboard handler in `clipboard-list.component.ts` currently reserves `P` and `E` in the `default` branch and excludes them from starting a search. Moving those bindings under a `ctrlKey` guard lets all bare letter keys flow into search while keeping the actions reachable. Tooltip text and footer hint keys are updated in the same commit for consistency.

**Tech Stack:** Angular 17+, TypeScript, ngx-translate (i18n via `translate` pipe), inline templates in `.ts` files.

---

## File Map

| File | Change |
|------|--------|
| `src/app/features/clipboard-list/clipboard-list.component.ts` | Keyboard handler + template keyboard-hint keys |
| `src/app/features/clipboard-list/clipboard-list.component.spec.ts` | No new pure helpers → no new unit tests needed |
| `src/app/i18n/en.ts` | Update `EMPTY_PINNED_HINT` and `ENTRY.TOGGLE_PIN` strings |
| `src/app/i18n/de.ts` | Same strings in German |

---

### Task 1: Update the keyboard handler

**Files:**
- Modify: `src/app/features/clipboard-list/clipboard-list.component.ts:434-455`

The current `default` case guards `P` and `E` behind `!event.ctrlKey`, preventing them from triggering search. The new structure separates the two concerns: Ctrl-only combos handle pin/edit first; bare printable keys (including `p` and `e`) always start search.

- [ ] **Step 1: Locate the current default case**

Lines 434–455 in `clipboard-list.component.ts`:

```typescript
      default:
        if (event.key.length === 1 && !event.ctrlKey && !event.altKey && !event.metaKey) {
          if (event.key.toLowerCase() === 'p') {
            event.preventDefault();
            this.pinSelected();
          } else if (event.key.toLowerCase() === 'e') {
            event.preventDefault();
            this.enterEditMode();
          } else {
            this.isSearching.set(true);
            this.searchQuery.set(event.key);
            setTimeout(() => {
              const input = this.searchInput()?.nativeElement;
              if (input) {
                input.value = this.searchQuery();
                input.focus();
                input.setSelectionRange(input.value.length, input.value.length);
              }
            }, 0);
          }
        }
```

- [ ] **Step 2: Replace with Ctrl-guarded handlers + unconditional search fallback**

Replace the entire `default:` block with:

```typescript
      default:
        if (event.ctrlKey && !event.shiftKey && !event.altKey && !event.metaKey) {
          if (event.key.toLowerCase() === 'p') {
            event.preventDefault();
            this.pinSelected();
          } else if (event.key.toLowerCase() === 'e') {
            event.preventDefault();
            this.enterEditMode();
          }
        } else if (event.key.length === 1 && !event.ctrlKey && !event.altKey && !event.metaKey) {
          this.isSearching.set(true);
          this.searchQuery.set(event.key);
          setTimeout(() => {
            const input = this.searchInput()?.nativeElement;
            if (input) {
              input.value = this.searchQuery();
              input.focus();
              input.setSelectionRange(input.value.length, input.value.length);
            }
          }, 0);
        }
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

---

### Task 2: Update footer keyboard-hint keys in the template

**Files:**
- Modify: `src/app/features/clipboard-list/clipboard-list.component.ts:209-210`

- [ ] **Step 1: Find the two hint elements**

Lines 209–210 in `clipboard-list.component.ts`:

```html
          <app-keyboard-hint key="P" [label]="'CLIPBOARD.HINT_PIN' | translate" />
          <app-keyboard-hint key="E" [label]="'CLIPBOARD.HINT_EDIT' | translate" />
```

- [ ] **Step 2: Change key values to Ctrl+P and Ctrl+E**

```html
          <app-keyboard-hint key="Ctrl+P" [label]="'CLIPBOARD.HINT_PIN' | translate" />
          <app-keyboard-hint key="Ctrl+E" [label]="'CLIPBOARD.HINT_EDIT' | translate" />
```

---

### Task 3: Update i18n strings

**Files:**
- Modify: `src/app/i18n/en.ts`
- Modify: `src/app/i18n/de.ts`

Two strings reference the bare `P` key explicitly:
- `CLIPBOARD.EMPTY_PINNED_HINT` — shown when the pinned tab is empty
- `ENTRY.TOGGLE_PIN` — tooltip on the pin button inside each entry card

- [ ] **Step 1: Update English strings**

In `src/app/i18n/en.ts`, change:

```typescript
    EMPTY_PINNED_HINT: 'Select an entry and press P',
```
to:
```typescript
    EMPTY_PINNED_HINT: 'Select an entry and press Ctrl+P',
```

And change:
```typescript
    TOGGLE_PIN: 'Toggle pin (P)',
```
to:
```typescript
    TOGGLE_PIN: 'Toggle pin (Ctrl+P)',
```

- [ ] **Step 2: Update German strings**

In `src/app/i18n/de.ts`, change:

```typescript
    EMPTY_PINNED_HINT: 'Eintrag wählen und P drücken',
```
to:
```typescript
    EMPTY_PINNED_HINT: 'Eintrag wählen und Ctrl+P drücken',
```

And change:
```typescript
    TOGGLE_PIN: 'Pinnen umschalten (P)',
```
to:
```typescript
    TOGGLE_PIN: 'Pinnen umschalten (Ctrl+P)',
```

---

### Task 4: Commit

- [ ] **Step 1: Stage and commit all changes**

```bash
git add src/app/features/clipboard-list/clipboard-list.component.ts \
        src/app/i18n/en.ts \
        src/app/i18n/de.ts
git commit -m "feat: require Ctrl modifier for pin (Ctrl+P) and edit (Ctrl+E) shortcuts"
```

- [ ] **Step 2: Manual smoke test**

Start the app and verify:
1. Pressing `p` or `e` alone now starts a search (filter bar opens, character appears)
2. Pressing `Ctrl+P` on a selected entry toggles its pin state
3. Pressing `Ctrl+E` on a selected text entry enters edit mode
4. Footer hints show `Ctrl+P pin` and `Ctrl+E edit`
5. Pin button tooltip reads "Toggle pin (Ctrl+P)"
6. Empty Pinned tab shows "Select an entry and press Ctrl+P"
