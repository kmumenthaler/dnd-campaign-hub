import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SceneMusicConfig } from "../../src/music/types";

vi.mock("../../src/music/AudioLayer", () => ({
  AudioLayer: class {
    state = {
      currentPlaylistId: null as string | null,
      currentTrackIndex: -1,
      isPlaying: false,
      repeatMode: "playlist" as "none" | "playlist" | "track",
      isShuffled: false,
      volume: 70,
      isMuted: false,
      position: 0,
      duration: 0,
    };

    fadeDurationMs = 0;
    stopCalled = false;
    loadPlaylistCalled = false;
    playCalled = false;

    constructor(_app: any, volume: number, fadeDurationMs: number) {
      this.state.volume = volume;
      this.fadeDurationMs = fadeDurationMs;
    }

    stopAsync(): Promise<void> {
      return new Promise<void>(() => {
        // Intentionally unresolved by default to simulate a hung fade.
      });
    }

    stop() {
      this.stopCalled = true;
      this.state.isPlaying = false;
      this.state.position = 0;
    }

    loadPlaylist(playlist: { id: string }) {
      this.loadPlaylistCalled = true;
      this.state.currentPlaylistId = playlist.id;
      this.state.currentTrackIndex = 0;
    }

    play() {
      this.playCalled = true;
      this.state.isPlaying = true;
    }

    setVolume(volume: number) {
      this.state.volume = volume;
    }

    destroy() {}
    pause() {}
    togglePlayPause() {}
    next() {}
    previous() {}
    seek(_seconds: number) {}
    seekPercent(_pct: number) {}
    toggleMute() {}
    fadeVolumeTo(_target: number, _durationMs: number) { return Promise.resolve(); }
    toggleShuffle() {}
    cycleRepeatMode() {}
    getCurrentTrack() { return null; }
    getTrackList() { return []; }
    playTrackByIndex(_index: number) {}
    duckVolume(_amount: number, _fadeMs: number) {}
    unduckVolume(_fadeMs: number) {}
  },
}));

import { MusicPlayer } from "../../src/music/MusicPlayer";

function createSettings() {
  return {
    defaultVolume: 70,
    ambientVolume: 50,
    fadeDurationMs: 0,
    playlists: [
      { id: "p1", name: "Primary", trackPaths: ["music/a.mp3"] },
      { id: "a1", name: "Ambient", trackPaths: ["music/b.mp3"] },
    ],
    soundEffects: [],
    duckingEnabled: true,
    duckingAmount: 50,
    duckingFadeDownMs: 100,
    duckingFadeUpMs: 400,
  } as any;
}

describe("music/MusicPlayer transition hardening", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("stopAll recovers if layer stopAsync hangs", async () => {
    const player = new MusicPlayer({} as any, createSettings());

    const stopPromise = player.stopAll();
    expect(player.isStopping()).toBe(true);

    await vi.advanceTimersByTimeAsync(1600);
    await stopPromise;

    expect(player.isStopping()).toBe(false);
    expect((player.primary as any).stopCalled).toBe(true);
    expect((player.ambient as any).stopCalled).toBe(true);
  });

  it("loadSceneMusic recovers from hung stop and still loads playlists", async () => {
    const player = new MusicPlayer({} as any, createSettings());

    const config: SceneMusicConfig = {
      primaryPlaylistId: "p1",
      primaryTrackPath: null,
      ambientPlaylistId: "a1",
      ambientTrackPath: null,
      autoPlay: true,
    };

    const loadPromise = player.loadSceneMusic(config, true);
    expect(player.isTransitioning()).toBe(true);

    await vi.advanceTimersByTimeAsync(1600);
    await loadPromise;

    expect(player.isTransitioning()).toBe(false);
    expect((player.primary as any).loadPlaylistCalled).toBe(true);
    expect((player.ambient as any).loadPlaylistCalled).toBe(true);
    expect((player.primary as any).playCalled).toBe(true);
    expect((player.ambient as any).playCalled).toBe(true);
  });
});
