/**
 * Music Player UI section rendered inside the Session Run Dashboard.
 * Supports dual-layer playback (Primary + Ambient) with independent
 * transport controls, volume, playlist selection, and track lists.
 */
import { App, Notice, TFile } from 'obsidian';
import { MusicPlayer } from './MusicPlayer';
import { AudioLayer } from './AudioLayer';
import type { MusicSettings, MusicPlayerState, Track, SoundEffect } from './types';

/**
 * Render the full music player section (header + two layers) into the container.
 * Returns a cleanup function to detach listeners.
 */
export function renderMusicPlayer(
  container: HTMLElement,
  app: App,
  musicPlayer: MusicPlayer,
  settings: MusicSettings,
  onOpenSettings: () => void
): () => void {
  const section = container.createEl('div', { cls: 'dashboard-section music-player-section' });

  // ── Header ──────────────────────────────────────────────
  const header = section.createEl('div', { cls: 'music-header' });
  header.createEl('h3', { text: '🎵 Music Player' });
  const settingsBtn = header.createEl('button', { text: '⚙️', cls: 'music-settings-btn', attr: { 'aria-label': 'Music Settings' } });
  settingsBtn.addEventListener('click', onOpenSettings);

  // ── Primary Layer ───────────────────────────────────────
  const primaryCleanup = renderLayerControls(
    section, musicPlayer.primary, settings, '🎵 Primary', musicPlayer
  );

  // ── Ambient Layer ───────────────────────────────────────
  const ambientCleanup = renderLayerControls(
    section, musicPlayer.ambient, settings, '🌊 Ambient', musicPlayer
  );

  // ── Stop All button ─────────────────────────────────────
  const stopAllBtn = section.createEl('button', {
    text: '⏹ Stop All',
    cls: 'music-stop-all-btn',
  });
  stopAllBtn.addEventListener('click', () => musicPlayer.stopAll());

  return () => {
    primaryCleanup();
    ambientCleanup();
  };
}

// ─── Layer Controls ───────────────────────────────────────────

/**
 * Render transport controls, progress, volume, playlist selector
 * and track list for a single AudioLayer.
 */
function renderLayerControls(
  container: HTMLElement,
  layer: AudioLayer,
  settings: MusicSettings,
  label: string,
  musicPlayer: MusicPlayer
): () => void {
  const layerSection = container.createEl('div', { cls: 'music-layer-section' });

  // Layer header
  const layerHeader = layerSection.createEl('div', { cls: 'music-layer-header' });
  layerHeader.createEl('span', { text: label, cls: 'music-layer-label' });

  // ── Now Playing ─────────────────────────────────────────
  const nowPlaying = layerSection.createEl('div', { cls: 'music-now-playing' });
  const trackTitle = nowPlaying.createEl('div', { cls: 'music-track-title', text: '—' });
  const playlistNameEl = nowPlaying.createEl('div', { cls: 'music-playlist-name', text: '' });

  // ── Progress Bar ────────────────────────────────────────
  const progressRow = layerSection.createEl('div', { cls: 'music-progress-row' });
  const timeElapsed = progressRow.createEl('span', { cls: 'music-time', text: '0:00' });
  const progressBarOuter = progressRow.createEl('div', { cls: 'music-progress-bar' });
  const progressBarInner = progressBarOuter.createEl('div', { cls: 'music-progress-fill' });
  const timeTotal = progressRow.createEl('span', { cls: 'music-time', text: '0:00' });

  progressBarOuter.addEventListener('click', (e) => {
    const rect = progressBarOuter.getBoundingClientRect();
    const pct = ((e.clientX - rect.left) / rect.width) * 100;
    layer.seekPercent(Math.max(0, Math.min(100, pct)));
  });

  // ── Transport Controls ──────────────────────────────────
  const controls = layerSection.createEl('div', { cls: 'music-controls' });

  const shuffleBtn = controls.createEl('button', { cls: 'music-ctrl-btn music-shuffle-btn', text: '🔀', attr: { 'aria-label': 'Shuffle' } });
  shuffleBtn.addEventListener('click', () => layer.toggleShuffle());

  const prevBtn = controls.createEl('button', { cls: 'music-ctrl-btn', text: '⏮', attr: { 'aria-label': 'Previous' } });
  prevBtn.addEventListener('click', () => layer.previous());

  const playBtn = controls.createEl('button', { cls: 'music-ctrl-btn music-play-btn', text: '▶️', attr: { 'aria-label': 'Play' } });
  playBtn.addEventListener('click', () => layer.togglePlayPause());

  const stopBtn = controls.createEl('button', { cls: 'music-ctrl-btn', text: '⏹', attr: { 'aria-label': 'Stop' } });
  stopBtn.addEventListener('click', () => layer.stop());

  const nextBtn = controls.createEl('button', { cls: 'music-ctrl-btn', text: '⏭', attr: { 'aria-label': 'Next' } });
  nextBtn.addEventListener('click', () => layer.next());

  const repeatBtn = controls.createEl('button', { cls: 'music-ctrl-btn music-repeat-btn', text: '🔁', attr: { 'aria-label': 'Repeat' } });
  repeatBtn.addEventListener('click', () => layer.cycleRepeatMode());

  // ── Volume ──────────────────────────────────────────────
  const volumeRow = layerSection.createEl('div', { cls: 'music-volume-row' });
  const muteBtn = volumeRow.createEl('button', { cls: 'music-ctrl-btn music-mute-btn', text: '🔊', attr: { 'aria-label': 'Mute' } });
  muteBtn.addEventListener('click', () => layer.toggleMute());

  const volumeSlider = volumeRow.createEl('input', { type: 'range', cls: 'music-volume-slider' });
  volumeSlider.min = '0';
  volumeSlider.max = '100';
  volumeSlider.value = String(layer.state.volume);
  const volumeDisplay = volumeRow.createEl('span', { cls: 'music-volume-display', text: `${layer.state.volume}%` });
  volumeSlider.addEventListener('input', () => {
    const vol = parseInt(volumeSlider.value);
    layer.setVolume(vol);
    volumeDisplay.textContent = `${vol}%`;
  });

  // ── Playlist Selector ──────────────────────────────────
  if (settings.playlists.length > 0) {
    const playlistRow = layerSection.createEl('div', { cls: 'music-playlist-row' });
    playlistRow.createEl('span', { text: 'Playlist:', cls: 'music-playlist-label' });
    const playlistSelect = playlistRow.createEl('select', { cls: 'music-playlist-select' });
    playlistSelect.createEl('option', { text: '— Select —', value: '' });
    for (const pl of settings.playlists) {
      const opt = playlistSelect.createEl('option', { text: `${pl.name} (${pl.mood})`, value: pl.id });
      if (pl.id === layer.state.currentPlaylistId) opt.selected = true;
    }
    playlistSelect.addEventListener('change', () => {
      const id = playlistSelect.value;
      if (id) {
        const pl = settings.playlists.find(p => p.id === id);
        if (pl) {
          layer.loadPlaylist(pl);
          layer.play();
        }
      }
    });
  }

  // ── Track List (collapsible) ────────────────────────────
  const trackListSection = layerSection.createEl('div', { cls: 'music-tracklist-section' });
  const trackListHeader = trackListSection.createEl('div', { cls: 'music-tracklist-header' });
  trackListHeader.createEl('span', { text: '📋 Track List' });
  let trackListVisible = false;
  const trackListToggle = trackListHeader.createEl('button', { text: '▼', cls: 'music-tracklist-toggle' });
  const trackListBody = trackListSection.createEl('div', { cls: 'music-tracklist-body' });
  trackListBody.style.display = 'none';

  trackListHeader.addEventListener('click', () => {
    trackListVisible = !trackListVisible;
    trackListBody.style.display = trackListVisible ? 'block' : 'none';
    trackListToggle.textContent = trackListVisible ? '▲' : '▼';
    if (trackListVisible) {
      renderTrackList(trackListBody, layer);
    }
  });

  // ── State update handler ────────────────────────────────
  const updateUI = (state: MusicPlayerState) => {
    // Play button
    playBtn.textContent = state.isPlaying ? '⏸' : '▶️';
    playBtn.setAttribute('aria-label', state.isPlaying ? 'Pause' : 'Play');

    // Shuffle
    shuffleBtn.classList.toggle('active', state.isShuffled);

    // Repeat
    const repeatIcons: Record<string, string> = { none: '➡️', playlist: '🔁', track: '🔂' };
    repeatBtn.textContent = repeatIcons[state.repeatMode] || '🔁';
    repeatBtn.classList.toggle('active', state.repeatMode !== 'none');

    // Mute
    muteBtn.textContent = state.isMuted ? '🔇' : (state.volume > 50 ? '🔊' : state.volume > 0 ? '🔉' : '🔈');

    // Volume slider
    volumeSlider.value = String(state.volume);
    volumeDisplay.textContent = `${state.volume}%`;

    // Progress
    const pct = state.duration > 0 ? (state.position / state.duration) * 100 : 0;
    progressBarInner.style.width = `${pct}%`;
    timeElapsed.textContent = formatTime(state.position);
    timeTotal.textContent = formatTime(state.duration);
  };

  const updateTrack = (track: Track | null) => {
    if (track) {
      trackTitle.textContent = track.title;
      const pl = musicPlayer.getPlaylistById(layer.state.currentPlaylistId);
      playlistNameEl.textContent = pl ? pl.name : '';
    } else {
      trackTitle.textContent = '—';
      playlistNameEl.textContent = '';
    }

    // Refresh track list if visible
    if (trackListVisible) {
      renderTrackList(trackListBody, layer);
    }
  };

  // Hook callbacks
  layer.onStateChange = updateUI;
  layer.onTrackChange = updateTrack;

  // Initial UI state
  updateUI(layer.state);
  updateTrack(layer.getCurrentTrack());

  // Return cleanup
  return () => {
    layer.onStateChange = null;
    layer.onTrackChange = null;
  };
}

/**
 * Render the soundboard section into the given container.
 */
export function renderSoundboard(
  container: HTMLElement,
  app: App,
  musicPlayer: MusicPlayer,
  settings: MusicSettings
): void {
  if (settings.soundEffects.length === 0) return;

  const section = container.createEl('div', { cls: 'dashboard-section soundboard-section' });
  section.createEl('h3', { text: '🔊 Soundboard' });

  const grid = section.createEl('div', { cls: 'soundboard-grid' });

  for (const sfx of settings.soundEffects) {
    if (!sfx.filePath) continue; // skip unconfigured slots

    const btn = grid.createEl('button', { cls: 'soundboard-btn', attr: { 'aria-label': sfx.name } });
    btn.createEl('span', { cls: 'soundboard-icon', text: sfx.icon });
    btn.createEl('span', { cls: 'soundboard-label', text: sfx.name });

    btn.addEventListener('click', () => {
      musicPlayer.playSoundEffect(sfx);
      btn.classList.add('playing');
      setTimeout(() => btn.classList.remove('playing'), 300);
    });
  }
}

// ─── Helpers ────────────────────────────────────────────────

function formatTime(seconds: number): string {
  if (!seconds || !isFinite(seconds)) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function renderTrackList(container: HTMLElement, layer: AudioLayer) {
  container.empty();
  const tracks = layer.getTrackList();
  if (tracks.length === 0) {
    container.createEl('p', { text: 'No tracks loaded', cls: 'empty-message' });
    return;
  }
  for (let i = 0; i < tracks.length; i++) {
    const row = container.createEl('div', {
      cls: `music-tracklist-item ${i === layer.state.currentTrackIndex ? 'current' : ''}`,
    });
    row.createEl('span', { text: `${i + 1}.`, cls: 'music-tracklist-num' });
    row.createEl('span', { text: tracks[i]?.title ?? '', cls: 'music-tracklist-name' });
    row.addEventListener('click', () => {
      layer.playTrackByIndex(i);
    });
  }
}
