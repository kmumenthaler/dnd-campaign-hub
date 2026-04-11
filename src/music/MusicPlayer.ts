/**
 * Core music player engine – orchestrates two AudioLayer instances
 * (primary + ambient) for simultaneous dual-layer playback,
 * plus a soundboard for one-shot sound effects.
 */
import { App, TFile } from 'obsidian';
import { AudioLayer } from './AudioLayer';
import type { Track, Playlist, SoundEffect, MusicPlayerState, MusicSettings, SceneMusicConfig } from './types';

export class MusicPlayer {
  app: App;
  settings: MusicSettings;

  /** Primary playback layer (melodic / thematic music) */
  primary: AudioLayer;
  /** Ambient background layer (ambience, nature sounds, etc.) */
  ambient: AudioLayer;

  /** Separate audio elements for sound effects (allows overlap) */
  private sfxAudios: HTMLAudioElement[] = [];
  /** Max concurrent sound effects */
  private readonly MAX_SFX = 8;
  /** Count of currently playing SFX (for ducking unduck logic) */
  private _activeSfxCount: number = 0;

  /** Currently active scene music config (null when no scene is loaded) */
  private _activeSceneConfig: SceneMusicConfig | null = null;

  /** True while stopAll() is fading out — prevents re-entrance */
  private _stopping: boolean = false;

  /** True while loadSceneMusic is transitioning between scenes. */
  private _sceneTransitioning: boolean = false;

  /** Monotonic token used to ignore stale async scene transitions. */
  private _sceneOpToken: number = 0;

  /** Listeners notified when the active scene changes (load / stop) */
  private _sceneChangeListeners: Set<() => void> = new Set();

  // ─── Backward-compatible property proxies (→ primary) ───────

  get state(): MusicPlayerState { return this.primary.state; }

  get onStateChange() { return this.primary.onStateChange; }
  set onStateChange(cb: ((state: MusicPlayerState) => void) | null) { this.primary.onStateChange = cb; }

  get onTrackChange() { return this.primary.onTrackChange; }
  set onTrackChange(cb: ((track: Track | null) => void) | null) { this.primary.onTrackChange = cb; }

  constructor(app: App, settings: MusicSettings) {
    this.app = app;
    this.settings = settings;
    const fade = settings.fadeDurationMs ?? 0;
    this.primary = new AudioLayer(app, settings.defaultVolume ?? 70, fade);
    this.ambient = new AudioLayer(app, settings.ambientVolume ?? 50, fade);
  }

  // ─── Lifecycle ───────────────────────────────────────────────

  destroy() {
    this.primary.destroy();
    this.ambient.destroy();
    this.sfxAudios.forEach(a => { a.pause(); a.src = ''; });
    this.sfxAudios = [];
  }

  /**
   * Called after settings are saved.  Refreshes any playlists that are
   * currently loaded on the primary / ambient layers so track-list
   * additions, removals, and reorders take effect immediately without
   * requiring a full restart.
   */
  reloadSettings(newSettings: MusicSettings) {
    this.settings = newSettings;

    // Sync fade duration to both layers
    const fade = newSettings.fadeDurationMs ?? 0;
    this.primary.fadeDurationMs = fade;
    this.ambient.fadeDurationMs = fade;

    // Refresh each layer's loaded playlist (if it still exists)
    for (const layer of [this.primary, this.ambient]) {
      const id = layer.state.currentPlaylistId;
      if (!id) continue;
      const pl = newSettings.playlists.find(p => p.id === id);
      if (pl) {
        // Preserve current playback state while updating the track list
        const wasPlaying = layer.state.isPlaying;
        const currentIndex = layer.state.currentTrackIndex;
        const currentTrack = layer.getCurrentTrack();

        layer.loadPlaylist(pl);

        // If the same track still exists in the updated list, jump back to it
        if (currentTrack) {
          const newIndex = pl.trackPaths.indexOf(currentTrack.filePath);
          if (newIndex !== -1) {
            layer.state.currentTrackIndex = newIndex;
          }
        }
        // Resume playback if it was playing before
        if (wasPlaying && layer.state.currentTrackIndex >= 0) {
          layer.play();
        }
      } else {
        // Playlist was deleted — stop this layer
        layer.stop();
      }
    }
  }

  // ─── Primary layer delegates (backward compat) ──────────────

  play() { this.primary.play(); }
  pause() { this.primary.pause(); }
  togglePlayPause() { this.primary.togglePlayPause(); }
  stop() { this.primary.stop(); }
  next() { this.primary.next(); }
  previous() { this.primary.previous(); }
  seek(seconds: number) { this.primary.seek(seconds); }
  seekPercent(pct: number) { this.primary.seekPercent(pct); }
  setVolume(vol: number) { this.primary.setVolume(vol); }
  toggleMute() { this.primary.toggleMute(); }
  fadeVolumeTo(targetVol: number, durationMs: number) { return this.primary.fadeVolumeTo(targetVol, durationMs); }
  loadPlaylist(playlist: Playlist) { this.primary.loadPlaylist(playlist); }
  toggleShuffle() { this.primary.toggleShuffle(); }
  cycleRepeatMode() { this.primary.cycleRepeatMode(); }
  getCurrentTrack() { return this.primary.getCurrentTrack(); }
  getTrackList() { return this.primary.getTrackList(); }
  playTrackByIndex(index: number) { this.primary.playTrackByIndex(index); }

  // ─── Playlist (settings-aware) ──────────────────────────────

  /**
   * Load a playlist by ID on the primary layer and start playing.
   */
  playPlaylist(playlistId: string) {
    const pl = this.settings.playlists.find(p => p.id === playlistId);
    if (!pl) return;
    this.primary.loadPlaylist(pl);
    this.primary.play();
  }

  /**
   * Load a playlist by ID on the ambient layer and start playing.
   */
  playAmbientPlaylist(playlistId: string) {
    const pl = this.settings.playlists.find(p => p.id === playlistId);
    if (!pl) return;
    this.ambient.loadPlaylist(pl);
    this.ambient.play();
  }

  /**
   * Retrieve a playlist from settings by ID.
   */
  getPlaylistById(id: string | null): Playlist | null {
    if (!id) return null;
    return this.settings.playlists.find(p => p.id === id) || null;
  }

  getCurrentPlaylist(): Playlist | null {
    return this.getPlaylistById(this.primary.state.currentPlaylistId);
  }

  /** Wait for both layers to stop, but never block forever.
   *  If fades hang, force-stop both layers and continue. */
  private async _awaitLayerStops(context: string): Promise<void> {
    const timeoutMs = Math.max((this.primary.fadeDurationMs || 0), (this.ambient.fadeDurationMs || 0)) + 1500;
    const stopPromise = Promise.all([
      this.primary.stopAsync(),
      this.ambient.stopAsync(),
    ]);

    const timeoutPromise = new Promise<void>((resolve) => {
      globalThis.setTimeout(() => resolve(), timeoutMs);
    });

    const completed = await Promise.race([
      stopPromise.then(() => true).catch(() => false),
      timeoutPromise.then(() => false),
    ]);

    if (!completed) {
      console.warn(`[MusicPlayer] ${context} timed out while waiting for stopAsync(); forcing stop.`);
      this.primary.stop();
      this.ambient.stop();
    }
  }

  /** Stop both primary and ambient layers.
   *  Waits for the fade-out to complete before clearing the active scene
   *  so the UI stays in "Stop" state during the transition. */
  async stopAll() {
    if (this._stopping) return;   // Already fading out, ignore repeated clicks
    const opToken = ++this._sceneOpToken;
    this._stopping = true;
    this._sceneTransitioning = false;
    this._notifySceneChange();
    try {
      await this._awaitLayerStops('stopAll');
      this.stopSoundEffects();
    } finally {
      if (opToken === this._sceneOpToken) {
        this._activeSceneConfig = null;
      }
      this._stopping = false;
      this._notifySceneChange();
    }
  }

  private stopSoundEffects() {
    for (const audio of this.sfxAudios) {
      audio.pause();
      audio.currentTime = 0;
      audio.src = '';
    }
    this._activeSfxCount = 0;
  }

  /** True while a stopAll fade-out is in progress. */
  isStopping(): boolean {
    return this._stopping;
  }

  /** True while any stop/load transition is in progress. */
  isTransitioning(): boolean {
    return this._stopping || this._sceneTransitioning;
  }

  // ─── Scene tracking helpers ─────────────────────────────────

  /**
   * Generate a deterministic key for a SceneMusicConfig so we can
   * compare two configs to decide if a scene is already loaded.
   */
  private static _sceneKey(config: SceneMusicConfig): string {
    return `${config.primaryPlaylistId || ''}|${config.primaryTrackPath || ''}|${config.ambientPlaylistId || ''}|${config.ambientTrackPath || ''}`;
  }

  /**
   * Returns true if the given scene music config is currently the
   * active scene (i.e. it was the last config loaded via loadSceneMusic
   * and hasn't been stopped).  Also returns true while the scene is
   * fading out via stopAll() so the button stays as "Stop".
   */
  isScenePlaying(config: SceneMusicConfig): boolean {
    if (this._stopping) return true;  // Still fading out
    if (!this._activeSceneConfig) return false;
    return MusicPlayer._sceneKey(config) === MusicPlayer._sceneKey(this._activeSceneConfig);
  }

  /** Register a callback invoked whenever the active scene changes. */
  onSceneChange(cb: () => void): () => void {
    this._sceneChangeListeners.add(cb);
    return () => { this._sceneChangeListeners.delete(cb); };
  }

  private _notifySceneChange() {
    for (const cb of this._sceneChangeListeners) {
      try { cb(); } catch (e) { console.error('[MusicPlayer] scene-change listener error', e); }
    }
  }

  // ─── Soundboard ─────────────────────────────────────────────

  /**
   * Play a sound effect overlaid on current music.
   * If ducking is enabled, temporarily reduces music/ambient volume.
   */
  playSoundEffect(effect: SoundEffect) {
    const file = this.app.vault.getAbstractFileByPath(effect.filePath);
    if (!(file instanceof TFile)) return;

    const url = this.app.vault.getResourcePath(file);

    // Reuse a finished audio element or create new (up to MAX_SFX)
    let sfxAudio = this.sfxAudios.find(a => a.paused || a.ended);
    if (!sfxAudio) {
      if (this.sfxAudios.length >= this.MAX_SFX) {
        sfxAudio = this.sfxAudios.shift()!;
        sfxAudio.pause();
      }
      sfxAudio = new Audio();
      this.sfxAudios.push(sfxAudio);
    }

    sfxAudio.src = url;
    sfxAudio.volume = ((effect.volume ?? this.state.volume) / 100) * (this.state.isMuted ? 0 : 1);

    // ── Ducking: reduce music volume while SFX plays ──────
    const duck = this.settings.duckingEnabled ?? true;
    if (duck) {
      const amount = this.settings.duckingAmount ?? 50;
      const fadeDown = this.settings.duckingFadeDownMs ?? 100;
      const fadeUp = this.settings.duckingFadeUpMs ?? 400;
      this._activeSfxCount++;

      // Duck both layers
      this.primary.duckVolume(amount, fadeDown);
      this.ambient.duckVolume(amount, fadeDown);

      // Restore when this SFX ends (only if no other SFX are still playing)
      const onEnd = () => {
        sfxAudio!.removeEventListener('ended', onEnd);
        sfxAudio!.removeEventListener('pause', onEnd);
        this._activeSfxCount = Math.max(0, this._activeSfxCount - 1);
        if (this._activeSfxCount === 0) {
          this.primary.unduckVolume(fadeUp);
          this.ambient.unduckVolume(fadeUp);
        }
      };
      sfxAudio.addEventListener('ended', onEnd);
      sfxAudio.addEventListener('pause', onEnd);
    }

    sfxAudio.play().catch(() => { /* ignore autoplay block */ });
  }

  // ─── Scene Integration ──────────────────────────────────────

  /**
   * Load (and optionally auto-play) music from a SceneMusicConfig.
   * Called by the dnd-music code-block renderer or the dashboard detector.
   *
   * Fades out any previously playing scene music first, then loads the
   * new playlists on each layer and starts playback.
   */
  async loadSceneMusic(config: SceneMusicConfig, autoPlay = false): Promise<void> {
    // If a stopAll() is still fading out, ignore the load request
    if (this._stopping || this._sceneTransitioning) return;
    const opToken = ++this._sceneOpToken;
    this._sceneTransitioning = true;

    // Mark the new scene immediately so button state updates right away
    this._activeSceneConfig = { ...config };
    this._notifySceneChange();

    try {
      // Fade out both layers first, then load & play the new scene.
      await this._awaitLayerStops('loadSceneMusic');

      // If a newer operation took over, ignore this stale transition.
      if (opToken !== this._sceneOpToken) return;

      this._loadAndPlayScene(config, autoPlay);
    } catch (e) {
      console.error('[MusicPlayer] loadSceneMusic failed', e);
      if (opToken === this._sceneOpToken) {
        this._activeSceneConfig = null;
      }
    } finally {
      if (opToken === this._sceneOpToken) {
        this._sceneTransitioning = false;
      }
      this._notifySceneChange();
    }
  }

  /**
   * Internal: load playlists and start playback after fade-out is complete.
   */
  private _loadAndPlayScene(config: SceneMusicConfig, autoPlay: boolean) {
    // ── Primary layer ──
    if (config.primaryPlaylistId) {
      const pl = this.settings.playlists.find(p => p.id === config.primaryPlaylistId);
      if (pl) {
        // Apply per-scene volume if specified, otherwise keep current layer volume
        if (config.primaryVolume != null) {
          this.primary.setVolume(config.primaryVolume);
        }
        // Apply per-scene repeat/shuffle if specified
        if (config.primaryRepeatMode != null) {
          this.primary.state.repeatMode = config.primaryRepeatMode;
        }
        if (config.primaryShuffle != null) {
          this.primary.state.isShuffled = config.primaryShuffle;
        }
        this.primary.loadPlaylist(pl);
        if (config.primaryTrackPath) {
          const idx = pl.trackPaths.indexOf(config.primaryTrackPath);
          if (idx !== -1) {
            this.primary.state.currentTrackIndex = idx;
          }
        }
        if (autoPlay) this.primary.play();
      }
    }

    // ── Ambient layer ──
    if (config.ambientPlaylistId) {
      const pl = this.settings.playlists.find(p => p.id === config.ambientPlaylistId);
      if (pl) {
        // Apply per-scene volume if specified, otherwise keep current layer volume
        if (config.ambientVolume != null) {
          this.ambient.setVolume(config.ambientVolume);
        }
        // Apply per-scene repeat/shuffle if specified
        if (config.ambientRepeatMode != null) {
          this.ambient.state.repeatMode = config.ambientRepeatMode;
        }
        if (config.ambientShuffle != null) {
          this.ambient.state.isShuffled = config.ambientShuffle;
        }
        this.ambient.loadPlaylist(pl);
        if (config.ambientTrackPath) {
          const idx = pl.trackPaths.indexOf(config.ambientTrackPath);
          if (idx !== -1) {
            this.ambient.state.currentTrackIndex = idx;
          }
        }
        if (autoPlay) this.ambient.play();
      }
    }
  }
}
