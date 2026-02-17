/**
 * A single audio playback layer with its own audio element, state,
 * playlist, shuffle, repeat, and volume controls.
 *
 * MusicPlayer uses two AudioLayer instances (primary + ambient)
 * to support simultaneous dual-layer playback.
 */
import { App, TFile } from 'obsidian';
import type { Track, Playlist, MusicPlayerState, RepeatMode } from './types';

export class AudioLayer {
  private app: App;

  /** Audio element for this layer */
  private audio: HTMLAudioElement;

  /** Current state */
  state: MusicPlayerState;

  /** Resolved tracks for the current playlist */
  private currentTracks: Track[] = [];
  /** Shuffle order (indices into currentTracks) */
  private shuffleOrder: number[] = [];
  /** Position within shuffle order */
  private shuffleIndex: number = 0;

  /** Fade interval handle */
  private fadeTimer: number | null = null;
  /** Progress update interval */
  private progressTimer: ReturnType<typeof setInterval> | null = null;
  /** Flag to prevent re-entrant track switches during a fade-out */
  private isFadingOut: boolean = false;

  /** Callback when state changes (for UI updates) */
  onStateChange: ((state: MusicPlayerState) => void) | null = null;
  /** Callback when track changes */
  onTrackChange: ((track: Track | null) => void) | null = null;

  /** Fade duration in ms for play / pause / stop transitions */
  fadeDurationMs: number = 0;

  constructor(app: App, defaultVolume: number, fadeDurationMs: number = 0) {
    this.app = app;
    this.fadeDurationMs = fadeDurationMs;

    this.audio = new Audio();
    this.audio.volume = (defaultVolume ?? 70) / 100;
    this.audio.addEventListener('ended', () => this.handleTrackEnd());
    this.audio.addEventListener('loadedmetadata', () => {
      this.state.duration = this.audio.duration || 0;
      this.emitStateChange();
    });

    this.state = {
      isPlaying: false,
      currentTrackIndex: -1,
      currentPlaylistId: null,
      volume: defaultVolume ?? 70,
      isMuted: false,
      isShuffled: false,
      repeatMode: 'playlist',
      position: 0,
      duration: 0,
    };

    // Progress ticker – update position every 500 ms while playing
    this.progressTimer = setInterval(() => {
      if (this.state.isPlaying && !this.audio.paused) {
        this.state.position = this.audio.currentTime || 0;
        this.emitStateChange();
      }
    }, 500);
  }

  // ─── Lifecycle ───────────────────────────────────────────────

  destroy() {
    this.cancelFade();
    if (this.progressTimer) clearInterval(this.progressTimer);
    this.audio.pause();
    this.audio.src = '';
    this.state.isPlaying = false;
  }

  // ─── Playback Controls ──────────────────────────────────────

  play() {
    if (this.currentTracks.length === 0) return;
    if (this.state.currentTrackIndex < 0) {
      this.playTrackByIndex(0);
      return;
    }
    if (this.state.isPlaying) return;

    if (this.fadeDurationMs > 0) {
      // Resume from pause: audio is paused but src is set
      this.audio.volume = 0;
      const doFadeIn = () => {
        this.state.isPlaying = true;
        this.emitStateChange();
        this.fadeIn();
      };
      this.audio.play().then(doFadeIn).catch(() => {});
    } else {
      this.audio.play().catch(() => {});
      this.state.isPlaying = true;
      this.emitStateChange();
    }
  }

  pause() {
    if (!this.state.isPlaying) return;
    if (this.fadeDurationMs > 0) {
      this.isFadingOut = true;
      this.fadeOut().then(() => {
        this.audio.pause();
        this.restoreVolume();
        this.isFadingOut = false;
        this.state.isPlaying = false;
        this.emitStateChange();
      });
    } else {
      this.audio.pause();
      this.state.isPlaying = false;
      this.emitStateChange();
    }
  }

  togglePlayPause() {
    if (this.state.isPlaying || this.isFadingOut) this.pause();
    else this.play();
  }

  stop() {
    if (this.fadeDurationMs > 0 && (this.state.isPlaying || this.isFadingOut)) {
      this.isFadingOut = true;
      this.fadeOut().then(() => {
        this.audio.pause();
        this.audio.currentTime = 0;
        this.restoreVolume();
        this.isFadingOut = false;
        this.state.isPlaying = false;
        this.state.position = 0;
        this.emitStateChange();
      });
    } else {
      this.cancelFade();
      this.audio.pause();
      this.audio.currentTime = 0;
      this.state.isPlaying = false;
      this.state.position = 0;
      this.emitStateChange();
    }
  }

  next() {
    if (this.currentTracks.length === 0) return;
    const nextIdx = this.getNextTrackIndex();
    if (nextIdx === null) { this.stop(); return; }

    if (this.fadeDurationMs > 0 && this.state.isPlaying) {
      // Fade out current track, then switch
      this.isFadingOut = true;
      this.fadeOut().then(() => {
        this.isFadingOut = false;
        this.playTrackByIndex(nextIdx, true);
      });
    } else {
      this.playTrackByIndex(nextIdx, true);
    }
  }

  previous() {
    if (this.currentTracks.length === 0) return;
    // If more than 3 seconds in, restart current track
    if (this.audio.currentTime > 3) {
      this.audio.currentTime = 0;
      this.state.position = 0;
      this.emitStateChange();
      return;
    }
    const prevIdx = this.getPreviousTrackIndex();
    if (prevIdx === null) return;

    if (this.fadeDurationMs > 0 && this.state.isPlaying) {
      this.isFadingOut = true;
      this.fadeOut().then(() => {
        this.isFadingOut = false;
        this.playTrackByIndex(prevIdx, true);
      });
    } else {
      this.playTrackByIndex(prevIdx, true);
    }
  }

  seek(seconds: number) {
    if (this.audio.duration) {
      this.audio.currentTime = Math.max(0, Math.min(seconds, this.audio.duration));
      this.state.position = this.audio.currentTime;
      this.emitStateChange();
    }
  }

  seekPercent(pct: number) {
    if (this.audio.duration) {
      this.seek((pct / 100) * this.audio.duration);
    }
  }

  // ─── Volume Controls ────────────────────────────────────────

  setVolume(vol: number) {
    this.state.volume = Math.max(0, Math.min(100, vol));
    if (!this.state.isMuted && !this.isFadingOut) {
      this.audio.volume = this.state.volume / 100;
    }
    this.emitStateChange();
  }

  toggleMute() {
    this.state.isMuted = !this.state.isMuted;
    if (!this.isFadingOut) {
      this.audio.volume = this.state.isMuted ? 0 : this.state.volume / 100;
    }
    this.emitStateChange();
  }

  // ─── Fade helpers ───────────────────────────────────────────

  /** Cancel any in-progress fade. */
  private cancelFade() {
    if (this.fadeTimer !== null) {
      cancelAnimationFrame(this.fadeTimer);
      this.fadeTimer = null;
    }
  }

  /** Restore audio.volume to match the logical state (volume + mute). */
  private restoreVolume() {
    this.audio.volume = this.state.isMuted ? 0 : this.state.volume / 100;
  }

  /** Fade from current audio.volume → target (0-100) over durationMs using requestAnimationFrame.
   *  Uses perceptual (exponential) easing so fades sound natural to human ears. */
  fadeVolumeTo(targetVol: number, durationMs: number): Promise<void> {
    return new Promise(resolve => {
      this.cancelFade();
      const startVol = this.audio.volume * 100;
      const diff = targetVol - startVol;
      if (Math.abs(diff) < 0.5 || durationMs <= 0) {
        this.audio.volume = Math.max(0, Math.min(1, targetVol / 100));
        resolve();
        return;
      }
      const startTime = performance.now();
      const isFadeOut = diff < 0;

      const tick = (now: number) => {
        const elapsed = now - startTime;
        const linearProgress = Math.min(1, elapsed / durationMs);

        // Apply perceptual easing curve:
        // Fade out: use sqrt curve (drops quickly at first, tapers off)
        // Fade in:  use squared curve (rises slowly at first, accelerates)
        const easedProgress = isFadeOut
          ? Math.sqrt(linearProgress)
          : linearProgress * linearProgress;

        const currentVol = startVol + diff * easedProgress;
        this.audio.volume = Math.max(0, Math.min(1, currentVol / 100));

        if (linearProgress >= 1) {
          this.audio.volume = Math.max(0, Math.min(1, targetVol / 100));
          this.fadeTimer = null;
          resolve();
        } else {
          this.fadeTimer = requestAnimationFrame(tick);
        }
      };
      this.fadeTimer = requestAnimationFrame(tick);
    });
  }

  /** Fade in from silence to the current volume setting. */
  private fadeIn(): Promise<void> {
    const target = this.state.isMuted ? 0 : this.state.volume;
    return this.fadeVolumeTo(target, this.fadeDurationMs);
  }

  /** Fade out from the current audio volume to silence. */
  private fadeOut(): Promise<void> {
    this.cancelFade(); // cancel any in-progress fade-in first
    return this.fadeVolumeTo(0, this.fadeDurationMs);
  }

  // ─── Playlist Management ────────────────────────────────────

  loadPlaylist(playlist: Playlist) {
    this.state.currentPlaylistId = playlist.id;
    this.currentTracks = playlist.trackPaths.map(p => ({
      filePath: p,
      title: p.split('/').pop()?.replace(/\.[^.]+$/, '') || p,
    }));
    this.regenerateShuffleOrder();
    this.state.currentTrackIndex = -1;
    this.emitStateChange();
  }

  /**
   * Crossfade from the current playlist to a new one.
   * If already playing the target playlist, does nothing.
   */
  crossfadeToPlaylist(playlist: Playlist, crossfadeDurationMs: number) {
    if (this.state.currentPlaylistId === playlist.id && this.state.isPlaying) return;
    if (crossfadeDurationMs > 0 && this.state.isPlaying) {
      this.fadeVolumeTo(0, crossfadeDurationMs).then(() => {
        this.loadPlaylist(playlist);
        this.audio.volume = 0;
        this.playTrackByIndex(0, true);
      });
    } else {
      this.loadPlaylist(playlist);
      this.playTrackByIndex(0, true);
    }
  }

  // ─── Shuffle / Repeat ──────────────────────────────────────

  toggleShuffle() {
    this.state.isShuffled = !this.state.isShuffled;
    if (this.state.isShuffled) {
      this.regenerateShuffleOrder();
    }
    this.emitStateChange();
  }

  cycleRepeatMode() {
    const modes: RepeatMode[] = ['none', 'playlist', 'track'];
    const currentIdx = modes.indexOf(this.state.repeatMode);
    this.state.repeatMode = modes[(currentIdx + 1) % modes.length]!;
    this.emitStateChange();
  }

  // ─── Getters ────────────────────────────────────────────────

  getCurrentTrack(): Track | null {
    if (this.state.currentTrackIndex < 0 || this.state.currentTrackIndex >= this.currentTracks.length) {
      return null;
    }
    return this.currentTracks[this.state.currentTrackIndex] ?? null;
  }

  getTrackList(): Track[] {
    return [...this.currentTracks];
  }

  playTrackByIndex(index: number, skipFadeOut: boolean = false) {
    if (index < 0 || index >= this.currentTracks.length) return;

    const track = this.currentTracks[index];
    if (!track) return;
    const file = this.app.vault.getAbstractFileByPath(track.filePath);
    if (!(file instanceof TFile)) {
      console.warn(`[AudioLayer] Track not found: ${track.filePath}`);
      this.state.currentTrackIndex = index;
      this.next();
      return;
    }

    // If currently playing and fade is enabled, fade out first then switch
    if (!skipFadeOut && this.fadeDurationMs > 0 && this.state.isPlaying && !this.audio.paused) {
      this.isFadingOut = true;
      this.fadeOut().then(() => {
        this.isFadingOut = false;
        this.switchToTrack(index, track, file);
      });
      return;
    }

    // Cancel any in-progress fade
    this.cancelFade();
    this.isFadingOut = false;

    this.switchToTrack(index, track, file);
  }

  /** Internal: actually load and play a track (after any fade-out completes). */
  private switchToTrack(index: number, track: Track, file: TFile) {
    const url = this.app.vault.getResourcePath(file);
    this.audio.src = url;

    // Update state immediately so UI reflects the new track
    this.state.currentTrackIndex = index;
    this.state.isPlaying = true;
    this.state.position = 0;
    this.emitStateChange();
    this.onTrackChange?.(track);

    if (this.fadeDurationMs > 0) {
      // Start silent, play, then fade in once playback begins
      this.audio.volume = 0;
      this.audio.play().then(() => {
        this.fadeIn();
      }).catch(() => {});
    } else {
      this.restoreVolume();
      this.audio.play().catch(() => {});
    }
  }

  // ─── Private helpers ────────────────────────────────────────

  private handleTrackEnd() {
    if (this.state.repeatMode === 'track') {
      this.audio.currentTime = 0;
      this.audio.play();
      return;
    }

    const nextIdx = this.getNextTrackIndex();
    if (nextIdx !== null) {
      this.playTrackByIndex(nextIdx, true);
    } else {
      this.stop();
    }
  }

  private getNextTrackIndex(): number | null {
    if (this.currentTracks.length === 0) return null;

    if (this.state.isShuffled) {
      this.shuffleIndex++;
      if (this.shuffleIndex >= this.shuffleOrder.length) {
        if (this.state.repeatMode === 'playlist') {
          this.regenerateShuffleOrder();
          this.shuffleIndex = 0;
        } else {
          return null;
        }
      }
      return this.shuffleOrder[this.shuffleIndex] ?? null;
    }

    const next = this.state.currentTrackIndex + 1;
    if (next >= this.currentTracks.length) {
      return this.state.repeatMode === 'playlist' ? 0 : null;
    }
    return next;
  }

  private getPreviousTrackIndex(): number | null {
    if (this.currentTracks.length === 0) return null;

    if (this.state.isShuffled) {
      this.shuffleIndex = Math.max(0, this.shuffleIndex - 1);
      return this.shuffleOrder[this.shuffleIndex] ?? null;
    }

    const prev = this.state.currentTrackIndex - 1;
    if (prev < 0) {
      return this.state.repeatMode === 'playlist' ? this.currentTracks.length - 1 : null;
    }
    return prev;
  }

  private regenerateShuffleOrder() {
    this.shuffleOrder = this.currentTracks.map((_, i) => i);
    // Fisher-Yates shuffle
    for (let i = this.shuffleOrder.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = this.shuffleOrder[i]!;
      this.shuffleOrder[i] = this.shuffleOrder[j]!;
      this.shuffleOrder[j] = tmp;
    }
    this.shuffleIndex = 0;
  }

  private emitStateChange() {
    this.onStateChange?.(this.state);
  }
}
