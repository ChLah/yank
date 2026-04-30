# TauriEventBus Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Centralise all Tauri event subscriptions in a single `TauriEventBus` service so listeners are live before the app renders, eliminating scattered `UnlistenFn` bookkeeping across services and components.

**Architecture:** A new `TauriEventBus` injectable owns every `listen()` call and exposes named RxJS `Observable` streams (backed by `Subject`s). It is initialised via `APP_INITIALIZER` so all streams are active before the first render. Consumers subscribe to named streams instead of calling `bridge.on*()` directly; the three `on*` methods are then deleted from `TauriBridgeService`.

**Tech Stack:** Angular 21, RxJS 7, Tauri v2 (`@tauri-apps/api/event`, `@tauri-apps/api/window`), Vitest

---

## File Map

| Action | Path | Responsibility |
|---|---|---|
| **Create** | `src/app/core/services/tauri-event-bus.service.ts` | Owns all `listen()` calls, exposes typed Observable streams |
| **Create** | `src/app/core/services/tauri-event-bus.service.spec.ts` | Verifies `init()` wires subjects to bridge calls |
| **Modify** | `src/app/core/services/tauri-bridge.service.ts` | Delete `onClipboardChanged`, `onPopupShown`, `onCapturePausedChanged` |
| **Modify** | `src/app/app.config.ts` | Register `TauriEventBus.init()` via `APP_INITIALIZER` |
| **Modify** | `src/app/core/services/clipboard.service.ts` | Inject `TauriEventBus`; remove `setupListeners`, `UnlistenFn` fields, `OnDestroy` |
| **Modify** | `src/app/features/clipboard-list/clipboard-list.component.ts` | Inject bus; remove `unlistenPopupShown`, `unlistenCapturePaused`, `unlistenWindowMoved` |
| **Modify** | `src/app/features/clipboard-list/clipboard-tab.component.ts` | Inject bus; remove `bridge.onPopupShown` call and `unlistenPopupShown` |
| **Modify** | `src/app/features/clipboard-list/snippets-tab.component.ts` | Inject bus; remove `bridge.onPopupShown` call and `unlistenPopupShown` |
| **Modify** | `src/app/app.ts` | Inject bus; subscribe to `bus.popupShown$` instead of `bridge.onPopupShown` |

---

## Task 1: Create TauriEventBus — service skeleton + test

**Files:**
- Create: `src/app/core/services/tauri-event-bus.service.ts`
- Create: `src/app/core/services/tauri-event-bus.service.spec.ts`

- [ ] **Step 1.1: Write the failing test**

Create `src/app/core/services/tauri-event-bus.service.spec.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Subject } from 'rxjs';
import { TauriEventBus } from './tauri-event-bus.service';

// Vitest automatically hoists vi.mock calls
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(),
}));
vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: vi.fn(),
}));

import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';

describe('TauriEventBus', () => {
  let bus: TauriEventBus;
  const mockUnlisten = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    (listen as ReturnType<typeof vi.fn>).mockResolvedValue(mockUnlisten);
    (getCurrentWindow as ReturnType<typeof vi.fn>).mockReturnValue({
      onMoved: vi.fn().mockResolvedValue(mockUnlisten),
    });
    bus = new TauriEventBus();
  });

  it('exposes clipboardChanged$ as an Observable', () => {
    expect(bus.clipboardChanged$).toBeDefined();
    expect(typeof bus.clipboardChanged$.subscribe).toBe('function');
  });

  it('exposes popupShown$ as an Observable', () => {
    expect(bus.popupShown$).toBeDefined();
    expect(typeof bus.popupShown$.subscribe).toBe('function');
  });

  it('exposes capturePausedChanged$ as an Observable', () => {
    expect(bus.capturePausedChanged$).toBeDefined();
    expect(typeof bus.capturePausedChanged$.subscribe).toBe('function');
  });

  it('exposes windowMoved$ as an Observable', () => {
    expect(bus.windowMoved$).toBeDefined();
    expect(typeof bus.windowMoved$.subscribe).toBe('function');
  });

  it('init() calls listen for clipboard-changed', async () => {
    await bus.init();
    expect(listen).toHaveBeenCalledWith('clipboard-changed', expect.any(Function));
  });

  it('init() calls listen for popup-shown', async () => {
    await bus.init();
    expect(listen).toHaveBeenCalledWith('popup-shown', expect.any(Function));
  });

  it('init() calls listen for capture-paused-changed', async () => {
    await bus.init();
    expect(listen).toHaveBeenCalledWith('capture-paused-changed', expect.any(Function));
  });

  it('init() registers window onMoved listener', async () => {
    const mockWindow = { onMoved: vi.fn().mockResolvedValue(mockUnlisten) };
    (getCurrentWindow as ReturnType<typeof vi.fn>).mockReturnValue(mockWindow);
    await bus.init();
    expect(mockWindow.onMoved).toHaveBeenCalled();
  });

  it('clipboardChanged$ emits when clipboard-changed fires', async () => {
    let capturedHandler!: () => void;
    (listen as ReturnType<typeof vi.fn>).mockImplementation((event, handler) => {
      if (event === 'clipboard-changed') capturedHandler = handler;
      return Promise.resolve(mockUnlisten);
    });
    await bus.init();
    const emissions: void[] = [];
    bus.clipboardChanged$.subscribe(() => emissions.push());
    capturedHandler();
    expect(emissions).toHaveLength(1);
  });

  it('capturePausedChanged$ emits the boolean payload', async () => {
    let capturedHandler!: (event: { payload: boolean }) => void;
    (listen as ReturnType<typeof vi.fn>).mockImplementation((event, handler) => {
      if (event === 'capture-paused-changed') capturedHandler = handler;
      return Promise.resolve(mockUnlisten);
    });
    await bus.init();
    const emissions: boolean[] = [];
    bus.capturePausedChanged$.subscribe((v) => emissions.push(v));
    capturedHandler({ payload: true });
    capturedHandler({ payload: false });
    expect(emissions).toEqual([true, false]);
  });

  it('windowMoved$ emits x/y from window onMoved', async () => {
    let capturedMovedHandler!: (event: { payload: { x: number; y: number } }) => void;
    const mockWindow = {
      onMoved: vi.fn().mockImplementation((handler) => {
        capturedMovedHandler = handler;
        return Promise.resolve(mockUnlisten);
      }),
    };
    (getCurrentWindow as ReturnType<typeof vi.fn>).mockReturnValue(mockWindow);
    await bus.init();
    const emissions: { x: number; y: number }[] = [];
    bus.windowMoved$.subscribe((v) => emissions.push(v));
    capturedMovedHandler({ payload: { x: 100, y: 200 } });
    expect(emissions).toEqual([{ x: 100, y: 200 }]);
  });

  it('ngOnDestroy() calls every unlisten function returned by init()', async () => {
    const unlistenClipboard = vi.fn();
    const unlistenPopup = vi.fn();
    const unlistenCapture = vi.fn();
    const unlistenMoved = vi.fn();
    let callCount = 0;
    const fns = [unlistenClipboard, unlistenPopup, unlistenCapture];
    (listen as ReturnType<typeof vi.fn>).mockImplementation(() =>
      Promise.resolve(fns[callCount++]),
    );
    const mockWindow = { onMoved: vi.fn().mockResolvedValue(unlistenMoved) };
    (getCurrentWindow as ReturnType<typeof vi.fn>).mockReturnValue(mockWindow);
    await bus.init();
    bus.ngOnDestroy();
    expect(unlistenClipboard).toHaveBeenCalledOnce();
    expect(unlistenPopup).toHaveBeenCalledOnce();
    expect(unlistenCapture).toHaveBeenCalledOnce();
    expect(unlistenMoved).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 1.2: Run test to verify it fails**

```
pnpm test -- tauri-event-bus.service.spec
```

Expected: FAIL — `TauriEventBus` not found.

- [ ] **Step 1.3: Create the service**

Create `src/app/core/services/tauri-event-bus.service.ts`:

```typescript
import { Injectable, OnDestroy } from '@angular/core';
import { Observable, Subject } from 'rxjs';
import { UnlistenFn, listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';

@Injectable({ providedIn: 'root' })
export class TauriEventBus implements OnDestroy {
  private readonly _clipboardChanged$ = new Subject<void>();
  private readonly _popupShown$ = new Subject<void>();
  private readonly _capturePausedChanged$ = new Subject<boolean>();
  private readonly _windowMoved$ = new Subject<{ x: number; y: number }>();

  readonly clipboardChanged$: Observable<void> = this._clipboardChanged$.asObservable();
  readonly popupShown$: Observable<void> = this._popupShown$.asObservable();
  readonly capturePausedChanged$: Observable<boolean> = this._capturePausedChanged$.asObservable();
  readonly windowMoved$: Observable<{ x: number; y: number }> = this._windowMoved$.asObservable();

  private readonly _unlisteners: UnlistenFn[] = [];

  async init(): Promise<void> {
    const unlisteners = await Promise.all([
      listen('clipboard-changed', () => this._clipboardChanged$.next()),
      listen('popup-shown', () => this._popupShown$.next()),
      listen<boolean>('capture-paused-changed', (event) =>
        this._capturePausedChanged$.next(event.payload),
      ),
      getCurrentWindow().onMoved(({ payload }) =>
        this._windowMoved$.next({ x: payload.x, y: payload.y }),
      ),
    ]);
    this._unlisteners.push(...unlisteners);
  }

  ngOnDestroy(): void {
    this._unlisteners.forEach((fn) => fn());
  }
}
```

- [ ] **Step 1.4: Run tests to verify they pass**

```
pnpm test -- tauri-event-bus.service.spec
```

Expected: All tests PASS.

- [ ] **Step 1.5: Format and commit**

```bash
pnpm prettier --write src/app/core/services/tauri-event-bus.service.ts src/app/core/services/tauri-event-bus.service.spec.ts
git add src/app/core/services/tauri-event-bus.service.ts src/app/core/services/tauri-event-bus.service.spec.ts
git commit -m "feat: add TauriEventBus — centralised Tauri event streams"
```

---

## Task 2: Wire TauriEventBus into APP_INITIALIZER

**Files:**
- Modify: `src/app/app.config.ts`

- [ ] **Step 2.1: Add APP_INITIALIZER for bus.init()**

Replace the content of `src/app/app.config.ts`:

```typescript
import { APP_INITIALIZER, ApplicationConfig, inject, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withHashLocation } from '@angular/router';
import { TranslateLoader, provideTranslateService } from '@ngx-translate/core';
import { routes } from './app.routes';
import { TypescriptTranslateLoader } from './i18n/translate-loader';
import { I18nService } from './core/services/i18n.service';
import { ThemeService } from './core/services/theme.service';
import { TauriBridgeService } from './core/services/tauri-bridge.service';
import { TauriEventBus } from './core/services/tauri-event-bus.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withHashLocation()),
    provideTranslateService({
      defaultLanguage: 'en',
      loader: { provide: TranslateLoader, useClass: TypescriptTranslateLoader },
    }),
    {
      provide: APP_INITIALIZER,
      useFactory: () => { const svc = inject(I18nService); return () => svc.init(); },
      multi: true,
    },
    {
      provide: APP_INITIALIZER,
      useFactory: () => {
        const bridge = inject(TauriBridgeService);
        const theme = inject(ThemeService);
        return async () => {
          const settings = await bridge.getSettings();
          theme.applyTheme(settings.theme);
        };
      },
      multi: true,
    },
    {
      provide: APP_INITIALIZER,
      useFactory: (bus: TauriEventBus) => () => bus.init(),
      deps: [TauriEventBus],
      multi: true,
    },
  ],
};
```

- [ ] **Step 2.2: Run full test suite**

```
pnpm test
```

Expected: All tests PASS (no compilation errors).

- [ ] **Step 2.3: Format and commit**

```bash
pnpm prettier --write src/app/app.config.ts
git add src/app/app.config.ts
git commit -m "feat: register TauriEventBus.init() via APP_INITIALIZER"
```

---

## Task 3: Migrate ClipboardService to use TauriEventBus

**Files:**
- Modify: `src/app/core/services/clipboard.service.ts`

- [ ] **Step 3.1: Rewrite clipboard.service.ts**

Replace the full content of `src/app/core/services/clipboard.service.ts`:

```typescript
import { Injectable, computed, inject, resource } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TauriBridgeService } from './tauri-bridge.service';
import { TauriEventBus } from './tauri-event-bus.service';
import { ClipboardEntry, ClipboardKind } from '../models/clipboard-entry.model';

export type ClipboardKindFilter = 'all' | ClipboardKind;

@Injectable({ providedIn: 'root' })
export class ClipboardService {
  private bridge = inject(TauriBridgeService);
  private bus = inject(TauriEventBus);

  private readonly _entries = resource({
    loader: () => this.bridge.getEntries(),
  });

  readonly isLoading = computed(() => this._entries.isLoading());
  readonly error = computed(() => this._entries.error());
  readonly count = computed(() => this._entries.value()?.length ?? 0);

  constructor() {
    this.bus.clipboardChanged$.pipe(takeUntilDestroyed()).subscribe(() => this._entries.reload());
    this.bus.popupShown$.pipe(takeUntilDestroyed()).subscribe(() => this._entries.reload());
  }

  reload(): void {
    this._entries.reload();
  }

  async setClipboard(id: number): Promise<void> {
    await this.bridge.setClipboard(id);
    await this.bridge.hidePopup();
  }

  async deleteEntry(id: number): Promise<void> {
    await this.bridge.deleteEntry(id);
    this._entries.reload();
  }

  async togglePin(id: number): Promise<void> {
    await this.bridge.togglePin(id);
    this._entries.reload();
  }

  filterEntries(pinnedOnly: boolean, kind: ClipboardKindFilter, search: string): ClipboardEntry[] {
    return filterClipboardEntries(this._entries.value() ?? [], pinnedOnly, kind, search);
  }
}

export function filterClipboardEntries(
  entries: ClipboardEntry[],
  pinnedOnly: boolean,
  kind: ClipboardKindFilter,
  search: string,
): ClipboardEntry[] {
  let list = entries;
  if (pinnedOnly) list = list.filter((e) => e.pinned);
  if (kind !== 'all') list = list.filter((e) => e.kind === kind);
  const q = search.toLowerCase().trim();
  if (q) list = list.filter((e) => e.content?.toLowerCase().includes(q));
  return list;
}
```

- [ ] **Step 3.2: Run full test suite**

```
pnpm test
```

Expected: All tests PASS (existing `filterClipboardEntries` tests still pass, no compilation errors).

- [ ] **Step 3.3: Format and commit**

```bash
pnpm prettier --write src/app/core/services/clipboard.service.ts
git add src/app/core/services/clipboard.service.ts
git commit -m "refactor: ClipboardService subscribes to TauriEventBus instead of bridge.on*"
```

---

## Task 4: Migrate ClipboardListComponent to use TauriEventBus

**Files:**
- Modify: `src/app/features/clipboard-list/clipboard-list.component.ts`

The component currently uses `bridge.onPopupShown`, `bridge.onCapturePausedChanged`, and `getCurrentWindow().onMoved()` — the first two move to the bus. The `windowMoved$` stream is already on the bus (registered in `init()`), so the component subscribes to `bus.windowMoved$` instead of calling `getCurrentWindow().onMoved()` directly.

- [ ] **Step 4.1: Rewrite clipboard-list.component.ts event handling**

In `src/app/features/clipboard-list/clipboard-list.component.ts`, make the following changes:

**Remove these imports:**
```typescript
import { OnDestroy, OnInit } from '@angular/core';  // keep OnInit, remove OnDestroy
import { UnlistenFn } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
```

**Add these imports:**
```typescript
import { DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TauriEventBus } from '../../core/services/tauri-event-bus.service';
```

**Remove the `TauriBridgeService` import** (it's no longer needed for events; check if it's still used for `getCapturePaused()` and `toggleCapturePaused()` — it is, so keep it).

**Replace the class declaration, fields, ngOnInit, and ngOnDestroy** with the following. The full rewritten class body (only the changed parts shown for clarity — keep all `protected` methods and `readonly tabs` unchanged):

```typescript
export class ClipboardListComponent implements OnInit {
  private clipboard = inject(ClipboardService);
  private bridge = inject(TauriBridgeService);
  private settings = inject(SettingsService);
  private bus = inject(TauriEventBus);
  private hostEl = inject(ElementRef);
  private moveDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private suppressPositionSave = false;

  protected activeTab = signal<TabType>('recent');
  protected activeClipboardTab = computed(() => this.activeTab() as ClipboardTabType);
  protected captureIsPaused = signal(false);

  private selectedEntrySignal = signal<ClipboardEntry | null>(null);
  protected showOcrHint = computed(() => this.selectedEntrySignal()?.kind === 'image');

  protected entryCount = computed(() => this.clipboard.count());
  protected pinnedCount = computed(() => this.clipboard.filterEntries(true, 'all', '').length);

  private clipboardTabRef = viewChild(ClipboardTabComponent);
  private snippetsTabRef = viewChild(SnippetsTabComponent);

  protected readonly tabs = [
    { labelKey: 'CLIPBOARD.TAB_RECENT', value: 'recent' as TabType },
    { labelKey: 'CLIPBOARD.TAB_PINNED', value: 'pinned' as TabType },
    { labelKey: 'SNIPPETS.TAB', value: 'snippets' as TabType },
  ];

  constructor() {
    this.bus.popupShown$.pipe(takeUntilDestroyed()).subscribe(() => {
      this.activeTab.set('recent');
      this.selectedEntrySignal.set(null);
      this.bridge.getCapturePaused().then((paused) => this.captureIsPaused.set(paused));
      this.suppressPositionSave = true;
      setTimeout(() => (this.suppressPositionSave = false), 600);
      setTimeout(() => this.focusActiveTab());
    });

    this.bus.capturePausedChanged$.pipe(takeUntilDestroyed()).subscribe((paused) => {
      this.captureIsPaused.set(paused);
    });

    this.bus.windowMoved$.pipe(takeUntilDestroyed()).subscribe(({ x, y }) => {
      if (this.suppressPositionSave) return;
      if (this.moveDebounceTimer) clearTimeout(this.moveDebounceTimer);
      this.moveDebounceTimer = setTimeout(() => {
        if (this.settings.settings.value()?.windowPosition === 'last') {
          this.bridge.saveWindowPosition(x, y);
        }
      }, 300);
    });
  }

  ngOnInit(): void {
    this.bridge.getCapturePaused().then((paused) => this.captureIsPaused.set(paused));
    this.focusActiveTab();
  }
```

The `ngOnDestroy` method and all three `unlisten*` private fields are removed entirely. The `moveDebounceTimer` cleanup on destroy is lost — add it back via `DestroyRef`:

**In constructor, after the three bus subscriptions, add:**
```typescript
    inject(DestroyRef).onDestroy(() => {
      if (this.moveDebounceTimer) clearTimeout(this.moveDebounceTimer);
    });
```

**Full final constructor block:**
```typescript
  constructor() {
    this.bus.popupShown$.pipe(takeUntilDestroyed()).subscribe(() => {
      this.activeTab.set('recent');
      this.selectedEntrySignal.set(null);
      this.bridge.getCapturePaused().then((paused) => this.captureIsPaused.set(paused));
      this.suppressPositionSave = true;
      setTimeout(() => (this.suppressPositionSave = false), 600);
      setTimeout(() => this.focusActiveTab());
    });

    this.bus.capturePausedChanged$.pipe(takeUntilDestroyed()).subscribe((paused) => {
      this.captureIsPaused.set(paused);
    });

    this.bus.windowMoved$.pipe(takeUntilDestroyed()).subscribe(({ x, y }) => {
      if (this.suppressPositionSave) return;
      if (this.moveDebounceTimer) clearTimeout(this.moveDebounceTimer);
      this.moveDebounceTimer = setTimeout(() => {
        if (this.settings.settings.value()?.windowPosition === 'last') {
          this.bridge.saveWindowPosition(x, y);
        }
      }, 300);
    });

    inject(DestroyRef).onDestroy(() => {
      if (this.moveDebounceTimer) clearTimeout(this.moveDebounceTimer);
    });
  }
```

**Final imports block for the file:**
```typescript
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  OnInit,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideClipboard, lucideSettings } from '@ng-icons/lucide';
import { TranslatePipe } from '@ngx-translate/core';
import { HlmIcon } from '@spartan-ng/helm/icon';
import { HlmBadge } from '@spartan-ng/helm/badge';
import { HlmTabs, HlmTabsList, HlmTabsTrigger } from '@spartan-ng/helm/tabs';
import { HlmSwitchImports } from '@spartan-ng/helm/switch';
import { ClipboardTabComponent, ClipboardTabType } from './clipboard-tab.component';
import { SnippetsTabComponent } from './snippets-tab.component';
import { ClipboardFooterHintsComponent } from './clipboard-footer-hints.component';
import { SnippetsFooterHintsComponent } from './snippets-footer-hints.component';
import { PageHeaderComponent } from '../../shared/ui/page-header/page-header.component';
import { ClipboardService } from '../../core/services/clipboard.service';
import { TauriBridgeService } from '../../core/services/tauri-bridge.service';
import { TauriEventBus } from '../../core/services/tauri-event-bus.service';
import { SettingsService } from '../../core/services/settings.service';
import { ClipboardEntry } from '../../core/models/clipboard-entry.model';
```

- [ ] **Step 4.2: Run full test suite**

```
pnpm test
```

Expected: All tests PASS.

- [ ] **Step 4.3: Format and commit**

```bash
pnpm prettier --write src/app/features/clipboard-list/clipboard-list.component.ts
git add src/app/features/clipboard-list/clipboard-list.component.ts
git commit -m "refactor: ClipboardListComponent subscribes to TauriEventBus streams"
```

---

## Task 5: Migrate ClipboardTabComponent and SnippetsTabComponent

**Files:**
- Modify: `src/app/features/clipboard-list/clipboard-tab.component.ts`
- Modify: `src/app/features/clipboard-list/snippets-tab.component.ts`

Both components have the same pattern: they call `bridge.onPopupShown(() => this.resetState())` in `ngOnInit` and unlisten in `ngOnDestroy`.

- [ ] **Step 5.1: Find the relevant section in clipboard-tab.component.ts**

Open `src/app/features/clipboard-list/clipboard-tab.component.ts`. Find:
1. The `private bridge = inject(TauriBridgeService)` field declaration
2. The `private unlistenPopupShown?: UnlistenFn` field
3. The `ngOnInit()` method where `bridge.onPopupShown(...)` is called
4. The `ngOnDestroy()` method where `this.unlistenPopupShown?.()` is called
5. The `import { UnlistenFn } from '@tauri-apps/api/event'` import (if present)

- [ ] **Step 5.2: Edit clipboard-tab.component.ts**

Make these changes:

1. **Add import** for `TauriEventBus` and RxJS interop:
```typescript
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TauriEventBus } from '../../core/services/tauri-event-bus.service';
```

2. **Remove** `import { UnlistenFn } from '@tauri-apps/api/event'` (if present)

3. **Remove** the field `private unlistenPopupShown?: UnlistenFn;`

4. **Add field** `private bus = inject(TauriEventBus);`

5. **Replace** the `ngOnInit` subscription block. The original:
```typescript
ngOnInit(): void {
  this.bridge
    .onPopupShown(() => this.resetState())
    .then((fn) => {
      this.unlistenPopupShown = fn;
    });
}
```
Becomes a **constructor** subscription (remove `ngOnInit` if it has no other logic, or keep it and move the subscription to constructor):
```typescript
constructor() {
  this.bus.popupShown$.pipe(takeUntilDestroyed()).subscribe(() => this.resetState());
}
```
**Note:** If `ngOnInit` has other code besides the popup listener, keep `ngOnInit` for that other code and only move the popup subscription to the constructor.

6. **Remove** `ngOnDestroy()` if its only content was `this.unlistenPopupShown?.()`. If it has other cleanup, keep it and only remove that line.

7. **Remove** `OnDestroy` from the `implements` clause if it's now unused. Keep `OnInit` only if `ngOnInit` still has content.

- [ ] **Step 5.3: Edit snippets-tab.component.ts**

Apply the exact same changes as Step 5.2 to `src/app/features/clipboard-list/snippets-tab.component.ts`:

1. **Add import** for `TauriEventBus` and RxJS interop:
```typescript
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TauriEventBus } from '../../core/services/tauri-event-bus.service';
```

2. **Remove** `import { UnlistenFn } from '@tauri-apps/api/event'` (if present)

3. **Remove** the field `private unlistenPopupShown?: UnlistenFn;`

4. **Add field** `private bus = inject(TauriEventBus);`

5. **Replace** the `ngOnInit` subscription block:
```typescript
// Before:
ngOnInit(): void {
  this.snippetsService.reload();
  this.bridge
    .onPopupShown(() => this.resetState())
    .then((fn) => {
      this.unlistenPopupShown = fn;
    });
}

// After:
constructor() {
  this.bus.popupShown$.pipe(takeUntilDestroyed()).subscribe(() => this.resetState());
}

ngOnInit(): void {
  this.snippetsService.reload();
}
```

6. **Remove** `ngOnDestroy()` if its only content was `this.unlistenPopupShown?.()`.

7. **Update** the `implements` clause: remove `OnDestroy` if no longer needed.

- [ ] **Step 5.4: Run full test suite**

```
pnpm test
```

Expected: All tests PASS.

- [ ] **Step 5.5: Format and commit**

```bash
pnpm prettier --write src/app/features/clipboard-list/clipboard-tab.component.ts src/app/features/clipboard-list/snippets-tab.component.ts
git add src/app/features/clipboard-list/clipboard-tab.component.ts src/app/features/clipboard-list/snippets-tab.component.ts
git commit -m "refactor: clipboard-tab and snippets-tab subscribe to TauriEventBus.popupShown$"
```

---

## Task 6: Migrate app.ts

**Files:**
- Modify: `src/app/app.ts`

The current `app.ts` calls `bridge.onPopupShown(() => this.router.navigate(['/']))` in `ngOnInit` without storing the `UnlistenFn` — a memory leak. Replace this with a bus subscription.

- [ ] **Step 6.1: Rewrite app.ts**

Replace the full content of `src/app/app.ts`:

```typescript
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { HlmToasterImports } from '@spartan-ng/helm/sonner';
import { TauriEventBus } from './core/services/tauri-event-bus.service';

@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, HlmToasterImports],
  host: { class: 'block h-full' },
  template: `
    <router-outlet />
    <hlm-toaster />
  `,
})
export class App {
  private router = inject(Router);

  constructor() {
    inject(TauriEventBus)
      .popupShown$.pipe(takeUntilDestroyed())
      .subscribe(() => this.router.navigate(['/']));
  }
}
```

- [ ] **Step 6.2: Run full test suite**

```
pnpm test
```

Expected: All tests PASS.

- [ ] **Step 6.3: Format and commit**

```bash
pnpm prettier --write src/app/app.ts
git add src/app/app.ts
git commit -m "fix: app.ts subscribes to TauriEventBus.popupShown$ — fixes listener leak"
```

---

## Task 7: Delete on* methods from TauriBridgeService

**Files:**
- Modify: `src/app/core/services/tauri-bridge.service.ts`

Now that all callers have been migrated, delete the three event-listener methods from the bridge.

- [ ] **Step 7.1: Remove the three on* methods**

In `src/app/core/services/tauri-bridge.service.ts`, delete:
- `onClipboardChanged(handler: () => void): Promise<UnlistenFn>` and its body
- `onPopupShown(handler: () => void): Promise<UnlistenFn>` and its body
- `onCapturePausedChanged(handler: (paused: boolean) => void): Promise<UnlistenFn>` and its body

Also remove the now-unused imports:
- `listen` from `@tauri-apps/api/event` (if no other `listen` calls remain)
- `UnlistenFn` from `@tauri-apps/api/event`

- [ ] **Step 7.2: Run full test suite**

```
pnpm test
```

Expected: All tests PASS. TypeScript compilation succeeds with no errors referencing deleted methods.

- [ ] **Step 7.3: Format and commit**

```bash
pnpm prettier --write src/app/core/services/tauri-bridge.service.ts
git add src/app/core/services/tauri-bridge.service.ts
git commit -m "refactor: remove on* event methods from TauriBridgeService"
```

---

## Self-Review

### Spec coverage check

| Spec requirement | Task |
|---|---|
| `TauriEventBus` with `clipboardChanged$`, `popupShown$`, `capturePausedChanged$`, `windowMoved$` | Task 1 |
| `init(): Promise<void>` called via `APP_INITIALIZER` | Tasks 1 + 2 |
| Remove `onClipboardChanged`, `onPopupShown`, `onCapturePausedChanged` from bridge | Task 7 |
| `ClipboardService` subscribes to bus streams | Task 3 |
| `ClipboardListComponent` subscribes to bus streams, removes unlisten fields | Task 4 |
| `ClipboardTabComponent` subscribes to `bus.popupShown$` | Task 5 |
| `SnippetsTabComponent` subscribes to `bus.popupShown$` | Task 5 |
| `app.ts` subscribes to `bus.popupShown$` | Task 6 |
| Test pattern with plain `Subject`s | Task 1 (spec file) |
| File at `src/app/core/services/tauri-event-bus.service.ts` | Task 1 |

All spec requirements covered. ✓

### Placeholder scan

No TBD, TODO, or "implement later" markers. All code blocks are complete.

### Type consistency

- `TauriEventBus` fields: `clipboardChanged$: Observable<void>`, `popupShown$: Observable<void>`, `capturePausedChanged$: Observable<boolean>`, `windowMoved$: Observable<{ x: number; y: number }>` — consistent across Task 1 (service), Task 3 (ClipboardService consumer), Task 4 (ClipboardListComponent consumer), Task 5 (tab components), Task 6 (app.ts).
- `takeUntilDestroyed()` pattern used consistently in Tasks 3, 4, 5, 6.
- `DestroyRef` + `onDestroy` used in Task 4 for timer cleanup (correct: `takeUntilDestroyed` handles RxJS subscriptions but not raw `setTimeout` refs).
