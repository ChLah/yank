import { Injectable, computed, signal } from '@angular/core';
import { getVersion } from '@tauri-apps/api/app';
import { check, type Update } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';

export type UpdaterState = 'idle' | 'checking' | 'downloading' | 'ready' | 'up-to-date' | 'error';

/** Hard cap on the manifest fetch so the Settings button doesn't hang
 *  indefinitely when the server is unreachable. */
const CHECK_TIMEOUT_MS = 10_000;

interface AvailableUpdate {
  version: string;
  notes: string | null;
  date: string | null;
}

@Injectable({ providedIn: 'root' })
export class UpdaterService {
  private readonly _state = signal<UpdaterState>('idle');
  private readonly _currentVersion = signal<string>('');
  private readonly _availableUpdate = signal<AvailableUpdate | null>(null);
  private readonly _downloadProgress = signal<{ downloaded: number; total: number | null }>({
    downloaded: 0,
    total: null,
  });
  private readonly _errorMessage = signal<string | null>(null);
  private update: Update | null = null;

  readonly state = this._state.asReadonly();
  readonly currentVersion = this._currentVersion.asReadonly();
  readonly availableUpdate = this._availableUpdate.asReadonly();
  readonly downloadProgress = this._downloadProgress.asReadonly();
  readonly errorMessage = this._errorMessage.asReadonly();
  readonly isReady = computed(() => this._state() === 'ready');

  async loadCurrentVersion(): Promise<void> {
    try {
      this._currentVersion.set(await getVersion());
    } catch (e) {
      console.warn('UpdaterService: failed to read current version', e);
    }
  }

  /** Startup auto-check. Silent on failure (per design).
   *  Downloads in the background so the banner can offer "Restart to install"
   *  the next time the popup opens — never runs the installer unprompted. */
  async autoCheck(): Promise<void> {
    try {
      const found = await this.runCheck();
      if (found) {
        await this.runDownload();
      }
    } catch (e) {
      console.warn('UpdaterService: auto-check failed', e);
    }
  }

  /** Manual check from Settings. Same shape as autoCheck but surfaces errors. */
  async checkNow(): Promise<void> {
    this._errorMessage.set(null);
    try {
      const found = await this.runCheck();
      if (found) {
        await this.runDownload();
      }
    } catch (e) {
      this._errorMessage.set(String(e));
      this._state.set('error');
    }
  }

  /** Run the installer for a previously-downloaded update and exit.
   *  Only invoked from explicit user action (banner or Settings button). */
  async restartNow(): Promise<void> {
    try {
      if (this.update && this._state() === 'ready') {
        // Tauri's install() runs the installer and exits the current process;
        // the installer relaunches the new binary itself.
        await this.update.install();
      } else {
        // Fallback: no pending update, just relaunch the current binary.
        await relaunch();
      }
    } catch (e) {
      this._errorMessage.set(String(e));
      this._state.set('error');
    }
  }

  private async runCheck(): Promise<boolean> {
    this._state.set('checking');
    // The Tauri updater's `timeout` only covers the underlying HTTP request,
    // so we also race the whole call against a wall-clock timer to guarantee
    // the UI never sticks in 'checking' if reqwest hangs in DNS / TCP setup.
    const update = await Promise.race([
      check({ timeout: CHECK_TIMEOUT_MS }),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error(`Update check timed out after ${CHECK_TIMEOUT_MS / 1000}s`)),
          CHECK_TIMEOUT_MS,
        ),
      ),
    ]);
    if (!update) {
      this._state.set('up-to-date');
      this._availableUpdate.set(null);
      return false;
    }
    this.update = update;
    this._availableUpdate.set({
      version: update.version,
      notes: update.body ?? null,
      date: update.date ?? null,
    });
    return true;
  }

  private async runDownload(): Promise<void> {
    if (!this.update) return;
    this._state.set('downloading');
    this._downloadProgress.set({ downloaded: 0, total: null });

    let downloaded = 0;
    let total: number | null = null;

    // download() (vs downloadAndInstall) stages the installer without
    // running it, so the user sees the banner and chooses when to restart.
    await this.update.download((event) => {
      switch (event.event) {
        case 'Started':
          total = event.data.contentLength ?? null;
          this._downloadProgress.set({ downloaded: 0, total });
          break;
        case 'Progress':
          downloaded += event.data.chunkLength;
          this._downloadProgress.set({ downloaded, total });
          break;
        case 'Finished':
          this._downloadProgress.set({ downloaded: total ?? downloaded, total });
          break;
      }
    });

    this._state.set('ready');
  }
}
