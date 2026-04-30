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
    bus.clipboardChanged$.subscribe(() => emissions.push(undefined as void));
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

  it('ngOnDestroy() completes all streams', async () => {
    await bus.init();
    let completed = 0;
    bus.clipboardChanged$.subscribe({ complete: () => completed++ });
    bus.popupShown$.subscribe({ complete: () => completed++ });
    bus.capturePausedChanged$.subscribe({ complete: () => completed++ });
    bus.windowMoved$.subscribe({ complete: () => completed++ });
    bus.ngOnDestroy();
    expect(completed).toBe(4);
  });
});
