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

const STORAGE_KEY           = 'cgp_music_muted';
const VOLUME_STORAGE_KEY    = 'cgp_music_volume';
const POSITION_STORAGE_KEY  = 'cgp_music_pos';
const DEFAULT_VOLUME        = 0.3;
const POS_SAVE_INTERVAL_MS  = 5_000;   // save position every 5 s while playing
const POS_MAX_AGE_MS        = 3_600_000; // discard saved position older than 1 h

class MusicManager {
  private audio: HTMLAudioElement | null       = null;
  private currentUrl: string | null            = null;
  private _muted: boolean;
  private _volume: number;
  /** True once the first user gesture has unlocked the audio context */
  private unlocked = false;

  // ── Preview ─────────────────────────────────────────────────────────────────
  private previewAudio: HTMLAudioElement | null    = null;
  private previewTimer: ReturnType<typeof setTimeout> | null = null;
  private _previewingId: string | null             = null; // track id being previewed

  private listeners = new Set<() => void>();
  private posInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this._muted  = this.readMuted();
    this._volume = this.readVolume();

    // Save position just before the page unloads for maximum accuracy.
    window.addEventListener('beforeunload', () => {
      if (this.audio && this.currentUrl && !this.audio.paused) {
        this.writePosition(this.currentUrl, this.audio.currentTime);
      }
    });

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

  private readVolume(): number {
    try {
      const raw = localStorage.getItem(VOLUME_STORAGE_KEY);
      if (raw === null) return DEFAULT_VOLUME;
      const parsed = parseFloat(raw);
      return isNaN(parsed) ? DEFAULT_VOLUME : Math.min(1, Math.max(0, parsed));
    } catch { return DEFAULT_VOLUME; }
  }

  private writeVolume(v: number): void {
    try { localStorage.setItem(VOLUME_STORAGE_KEY, String(v)); } catch {}
  }

  private readPosition(url: string): number {
    try {
      const raw = localStorage.getItem(POSITION_STORAGE_KEY);
      if (!raw) return 0;
      const { url: savedUrl, pos, savedAt } = JSON.parse(raw) as { url: string; pos: number; savedAt: number };
      if (savedUrl !== url) return 0;
      if (Date.now() - savedAt > POS_MAX_AGE_MS) return 0;
      return typeof pos === 'number' && pos > 0 ? pos : 0;
    } catch { return 0; }
  }

  private writePosition(url: string, pos: number): void {
    try { localStorage.setItem(POSITION_STORAGE_KEY, JSON.stringify({ url, pos, savedAt: Date.now() })); } catch {}
  }

  private startPositionSave(): void {
    if (this.posInterval) clearInterval(this.posInterval);
    this.posInterval = setInterval(() => {
      if (this.audio && this.currentUrl && !this.audio.paused) {
        this.writePosition(this.currentUrl, this.audio.currentTime);
      }
    }, POS_SAVE_INTERVAL_MS);
  }

  private stopPositionSave(): void {
    if (this.posInterval) { clearInterval(this.posInterval); this.posInterval = null; }
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

  /** Current background volume, 0–1. */
  get volume(): number { return this._volume; }

  /** ID of the track currently being previewed, or null. */
  get previewingId(): string | null { return this._previewingId; }

  /**
   * Set background music volume (0–1). Persists to localStorage.
   * Has no effect on preview clips.
   */
  setVolume(v: number): void {
    const clamped = Math.min(1, Math.max(0, v));
    this._volume = clamped;
    this.writeVolume(clamped);
    if (this.audio) this.audio.volume = clamped;
    if (this.previewAudio) this.previewAudio.volume = clamped;
    this.notify();
  }

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

    if (!url) {
      // Track cleared (e.g. route unmount): pause but keep the audio element
      // intact so the same track can resume seamlessly if re-equipped.
      this.audio?.pause();
      return;
    }

    // Check if the existing audio element already has this URL loaded.
    // This handles the case where a route transition temporarily sets the
    // URL to null and then back to the same track — we can resume in place
    // rather than restarting from the beginning.
    if (this.audio) {
      const resolvedUrl = (() => {
        try { return new URL(url, window.location.href).href; } catch { return url; }
      })();
      if (this.audio.src === resolvedUrl || this.audio.src === url) {
        // Same track is already loaded — just resume from current position
        if (this.unlocked && !this._muted) {
          this.audio.play().catch(() => {});
        }
        return;
      }
      // Different track: tear down the old element
      this.stopPositionSave();
      this.audio.pause();
      this.audio.src = '';
      this.audio = null;
    }

    if (this.unlocked && !this._muted) {
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
    el.volume  = this._volume;
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
    this.stopPositionSave();
    if (this.audio) {
      this.audio.pause();
      this.audio.src = '';
    }
    const el = new Audio(url);
    el.loop    = true;
    el.volume  = this._volume;
    el.preload = 'auto';
    // Restore saved playback position once metadata is available
    const savedPos = this.readPosition(url);
    if (savedPos > 0) {
      el.addEventListener('loadedmetadata', () => {
        if (savedPos < el.duration) el.currentTime = savedPos;
      }, { once: true });
    }
    // Silently ignore 404 / autoplay errors (file not uploaded yet)
    el.addEventListener('error', () => {}, { once: true });
    this.audio = el;
    el.play().catch(() => {});
    this.startPositionSave();
  }
}

/** App-wide singleton. Import and use directly everywhere. */
export const music = new MusicManager();
