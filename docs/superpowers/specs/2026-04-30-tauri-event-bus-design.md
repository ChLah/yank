# TauriEventBus Design

**Date:** 2026-04-30
**Status:** Approved

## Problem

Event subscriptions are scattered across multiple services and components. `ClipboardService`, `SnippetsService`, `ClipboardListComponent`, `ClipboardTabComponent`, and `SnippetsTabComponent` all call `bridge.on*()` directly, each storing their own `UnlistenFn` and calling it in `ngOnDestroy()`. This creates three problems:

1. **No lifecycle guarantee** — Listeners are registered asynchronously in constructors. There is a window between construction and when the listener is actually active. If an event fires in that window, it is silently dropped.
2. **Accidental double-registration** — Nothing prevents a service from registering the same Tauri event twice if it is constructed more than once. There is no deduplication guard.
3. **Untestable reactions** — Any service or component that reacts to Tauri events cannot be tested without either running a real Tauri backend or mocking the bridge's `on*` methods, which are async and return `UnlistenFn`s — awkward to fake.

## Goal

Introduce a `TauriEventBus` module that:
- Owns all Tauri `listen()` calls
- Exposes named, typed RxJS `Observable` streams — callers never see Tauri event name strings
- Initialises via Angular's `APP_INITIALIZER` so all listeners are live before the app renders
- Is trivially mockable in tests by substituting plain `Subject` instances

## Decisions

| Question | Decision |
|---|---|
| Stream type | RxJS `Observable` (backed by `Subject` internally). Consumers bridge to signals via `toSignal()` where needed. |
| Initialisation | `init(): Promise<void>` method registered via `APP_INITIALIZER`. App does not render until resolved. |
| Listener ownership | `TauriEventBus` owns all `listen()` calls. `TauriBridgeService.on*` methods are deleted. |
| Test pattern | Inject a mock bus object with plain `Subject`s. Tests call `.next()` directly to push events. |
| Scope | All Tauri events — including `windowMoved` from the Tauri window API — flow through the bus. |

---

## Interface

```ts
@Injectable({ providedIn: 'root' })
export class TauriEventBus {
  readonly clipboardChanged$: Observable<void>;
  readonly popupShown$: Observable<void>;
  readonly capturePausedChanged$: Observable<boolean>;
  readonly windowMoved$: Observable<{ x: number; y: number }>;

  async init(): Promise<void>;
}
```

Internally each stream is a `Subject` exposed via `.asObservable()`.

---

## APP_INITIALIZER wiring

```ts
// app.config.ts
{
  provide: APP_INITIALIZER,
  useFactory: (bus: TauriEventBus) => () => bus.init(),
  deps: [TauriEventBus],
  multi: true,
}
```

---

## Migration: what changes

### `TauriBridgeService`
Remove `onClipboardChanged`, `onPopupShown`, `onCapturePausedChanged`. The bridge retains only `invoke`-based command methods.

### `ClipboardService`
- Remove `setupListeners()`, `unlistenClipboardChanged`, `unlistenPopupShown`, `OnDestroy`
- Inject `TauriEventBus`
- Subscribe to `bus.clipboardChanged$` and `bus.popupShown$` in constructor (or via `effect()`)

### `ClipboardListComponent`
- Remove `unlistenPopupShown`, `unlistenCapturePaused`, `unlistenWindowMoved` and their `ngOnDestroy` cleanup
- Inject `TauriEventBus`
- Use `toSignal(bus.capturePausedChanged$)` for `captureIsPaused`
- Subscribe to `bus.windowMoved$` for position saving

### `ClipboardTabComponent`, `SnippetsTabComponent`
- Remove direct `bridge.onPopupShown()` calls and `unlistenPopupShown` fields
- Subscribe to `bus.popupShown$` instead

### `app.ts`
- Remove `bridge.onPopupShown()` call (currently routes to `/` on popup shown)
- Subscribe to `bus.popupShown$` instead

---

## Test pattern

```ts
const mockBus = {
  clipboardChanged$: new Subject<void>(),
  popupShown$: new Subject<void>(),
  capturePausedChanged$: new Subject<boolean>(),
  windowMoved$: new Subject<{ x: number; y: number }>(),
};

// In test:
mockBus.clipboardChanged$.next();
```

No `UnlistenFn`, no async bridge setup, no Tauri runtime required.

---

## File location

```
src/app/core/services/tauri-event-bus.service.ts
src/app/core/services/tauri-event-bus.service.spec.ts  ← optional: verify init() registers streams
```
