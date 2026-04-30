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
  private _initialised = false;

  async init(): Promise<void> {
    if (this._initialised) return;
    this._initialised = true;
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
    this._clipboardChanged$.complete();
    this._popupShown$.complete();
    this._capturePausedChanged$.complete();
    this._windowMoved$.complete();
  }
}
