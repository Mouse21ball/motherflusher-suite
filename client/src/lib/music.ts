/**
 * music.ts — Singleton background music manager.
 *
 * Tracks are identified by URL. Set the active track via setTrackUrl(url).
 * Passing null silences all music.
 *
 * Preview API: previewTrack(url, durationMs) plays a temporary clip (e.g. 15 s)
 * without interrupting the background track URL state.
 *
 * Mute preference persists to localStorage so the user's choice survives
 * across sessions.
 */

const STORAGE_KEY = 'cgp_music_muted';
const VOLUME       = 0.3;
const PREVIEW_VOL  = 0.5;

class MusicManager {
  private audio: HTMLAudioElement | null       = null;
  private currentUrl: string | null            = null;
  private _muted: boolean;
  /** True once the first user gesture has unlocked the audio context */
  private unlocked = false;

  // ── Preview ─────────────────────────────────────────────────────────────────
  private previewAudio: HTMLAudioElement | null    = null;
  private previewTimer: ReturnType<typeof setTimeout> | null = null;
  private _previewingId: string | null             = null; // track id being previewed

  private listeners = new Set<() => void>();

  constructor() {
    this._muted = this.readMuted();

    // Queue playback start on first user gesture (browser autoplay policy).
    const unlock = () => {
      if (this.unlocked) return;
      this.unlocked = true;
      if (!this._muted && this.currentUrl) {
        this.startAudio(this.currentUrl);
      }
      window.removeEventListener('click',      unlock, true);
      window.removeEventListener('touchstart', unlock, true);
      window.removeEventListener('keydown',    unlock, true);
    };
    window.addEventListener('click',      unlock, { capture: true, once: true });
    window.addEventListener('touchstart', unlock, { capture: true, once: true });
    window.addEventListener('keydown',    unlock, { capture: true, once: true });
  }

  // ── Persistence ─────────────────────────────────────────────────────────────

  private readMuted(): boolean {
    try { return localStorage.getItem(STORAGE_KEY) === '1'; } catch { return false; }
  }

  private writeMuted(v: boolean): void {
    try { localStorage.setItem(STORAGE_KEY, v ? '1' : '0'); } catch {}
  }

  // ── Subscriptions ────────────────────────────────────────────────────────────

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  }

  private notify(): void {
    this.listeners.forEach(fn => fn());
  }

  // ── Public API ───────────────────────────────────────────────────────────────

  get muted(): boolean { return this._muted; }

  /** ID of the track currently being previewed, or null. */
  get previewingId(): string | null { return this._previewingId; }

  /**
   * Set the background track to play (or null for silence).
   * Safe to call before user interaction — playback defers until unlocked.
   */
  setTrackUrl(url: string | null): void {
    if (this.currentUrl === url) {
      // Same URL — resume if stalled
      if (!this._muted && url && this.unlocked && this.audio?.paused) {
        this.audio.play().catch(() => {});
      }
      return;
    }

    this.currentUrl = url;

    // Tear down previous element
    if (this.audio) {
      this.audio.pause();
      this.audio.src = '';
      this.audio = null;
    }

    if (url && this.unlocked && !this._muted) {
      this.startAudio(url);
    }
  }

  /**
   * Play a preview clip for `durationMs` milliseconds.
   * Calling again while previewing replaces the current preview.
   * @param trackId  Identifier used to track which item is previewing (for UI state).
   */
  previewTrack(url: string, trackId: string, durationMs = 15_000): void {
    this.stopPreview();

    const el = new Audio(url);
    el.volume  = PREVIEW_VOL;
    el.preload = 'auto';
    el.addEventListener('error', () => {
      this.stopPreview();
    }, { once: true });
    el.play().catch(() => {});

    this.previewAudio   = el;
    this._previewingId  = trackId;
    this.previewTimer   = setTimeout(() => this.stopPreview(), durationMs);
    this.notify();
  }

  /** Stop any in-progress preview. */
  stopPreview(): void {
    if (this.previewTimer) {
      clearTimeout(this.previewTimer);
      this.previewTimer = null;
    }
    if (this.previewAudio) {
      this.previewAudio.pause();
      this.previewAudio.src = '';
      this.previewAudio = null;
    }
    this._previewingId = null;
    this.notify();
  }

  setMuted(muted: boolean): void {
    if (this._muted === muted) return;
    this._muted = muted;
    this.writeMuted(muted);

    if (muted) {
      this.audio?.pause();
    } else if (this.currentUrl && this.unlocked) {
      if (this.audio && !this.audio.paused) {
        // already rolling
      } else if (this.audio) {
        this.audio.play().catch(() => {});
      } else {
        this.startAudio(this.currentUrl);
      }
    }
    this.notify();
  }

  toggleMute(): void { this.setMuted(!this._muted); }

  // ── Internal ─────────────────────────────────────────────────────────────────

  private startAudio(url: string): void {
    if (this.audio) {
      this.audio.pause();
      this.audio.src = '';
    }
    const el = new Audio(url);
    el.loop    = true;
    el.volume  = VOLUME;
    el.preload = 'auto';
    // Silently ignore 404 / autoplay errors (file not uploaded yet)
    el.addEventListener('error', () => {}, { once: true });
    this.audio = el;
    el.play().catch(() => {});
  }
}

/** App-wide singleton. Import and use directly everywhere. */
export const music = new MusicManager();
