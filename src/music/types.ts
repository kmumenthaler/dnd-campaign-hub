/**
 * Music Player type definitions
 */

/** Supported audio file extensions */
export const AUDIO_EXTENSIONS = ['mp3', 'wav', 'ogg', 'm4a', 'flac', 'webm', 'aac'];

/** Check if a file extension is an audio format */
export function isAudioExtension(ext: string): boolean {
  return AUDIO_EXTENSIONS.includes(ext.toLowerCase());
}

/** A single audio track */
export interface Track {
  /** Vault path to the audio file */
  filePath: string;
  /** Display title (defaults to filename) */
  title: string;
  /** Duration in seconds (populated after loading) */
  duration?: number;
}

/** A playlist of tracks */
export interface Playlist {
  id: string;
  name: string;
  /** Mood tag for scene integration (combat, exploration, ambient, etc.) */
  mood: string;
  /** Vault paths of audio files in order */
  trackPaths: string[];
  /** If true, this playlist is eligible for the ambient / background layer */
  isBackgroundSound?: boolean;
}

/** A soundboard sound effect */
export interface SoundEffect {
  id: string;
  name: string;
  /** Vault path to the audio file */
  filePath: string;
  /** Emoji icon for the button */
  icon: string;
  /** Volume override 0-100 (defaults to master volume) */
  volume?: number;
}

/** Repeat modes */
export type RepeatMode = 'none' | 'track' | 'playlist';

/** Music player state */
export interface MusicPlayerState {
  isPlaying: boolean;
  currentTrackIndex: number;
  currentPlaylistId: string | null;
  volume: number; // 0-100
  isMuted: boolean;
  isShuffled: boolean;
  repeatMode: RepeatMode;
  position: number; // current playback position in seconds
  duration: number; // current track duration in seconds
}

/** Persistent music settings stored in plugin data.json */
export interface MusicSettings {
  /** Folder path in vault to scan for audio files */
  audioFolderPath: string;
  /** Configured playlists */
  playlists: Playlist[];
  /** Soundboard buttons */
  soundEffects: SoundEffect[];
  /** Default volume 0-100 */
  defaultVolume: number;
  /** Crossfade duration in ms */
  crossfadeDurationMs: number;
  /** Fade in/out duration in ms for play/pause/stop (0 = instant) */
  fadeDurationMs: number;
  /** Default volume for ambient layer 0-100 */
  ambientVolume: number;
  /** Whether to duck music/ambient volume during sound effects */
  duckingEnabled: boolean;
  /** How much to reduce volume when ducking (percentage, e.g. 50 = reduce by 50%) */
  duckingAmount: number;
  /** Ramp-down time in ms when ducking starts */
  duckingFadeDownMs: number;
  /** Ramp-up time in ms when ducking ends */
  duckingFadeUpMs: number;
  /** Freesound.org API key for sound search & preview */
  freesoundApiKey?: string;
}

/** Default music settings */
export const DEFAULT_MUSIC_SETTINGS: MusicSettings = {
  audioFolderPath: '',
  playlists: [],
  soundEffects: [],
  defaultVolume: 70,
  crossfadeDurationMs: 2000,
  fadeDurationMs: 1500,
  ambientVolume: 50,
  duckingEnabled: true,
  duckingAmount: 50,
  duckingFadeDownMs: 100,
  duckingFadeUpMs: 400
};

/**
 * Scene music configuration – stored as JSON inside a
 * ```dnd-music``` code block within a scene note.
 */
export interface SceneMusicConfig {
  /** Playlist ID for the primary layer (null = no primary music) */
  primaryPlaylistId: string | null;
  /** Specific track path to start on within the primary playlist (null = first / shuffle) */
  primaryTrackPath: string | null;
  /** Playlist ID for the ambient layer (null = no ambient music) */
  ambientPlaylistId: string | null;
  /** Specific track path to start on within the ambient playlist (null = first / shuffle) */
  ambientTrackPath: string | null;
  /** Volume for the primary layer 0-100 (null = use global default) */
  primaryVolume?: number | null;
  /** Volume for the ambient layer 0-100 (null = use global default) */
  ambientVolume?: number | null;
  /** Whether to auto-play when the codeblock's play button is clicked */
  autoPlay: boolean;
}

/** Default (empty) scene music configuration */
export const DEFAULT_SCENE_MUSIC_CONFIG: SceneMusicConfig = {
  primaryPlaylistId: null,
  primaryTrackPath: null,
  ambientPlaylistId: null,
  ambientTrackPath: null,
  autoPlay: true,
};

/** Persisted playback state – saved to data.json so volumes/playlists survive reload */
export interface MusicPlaybackState {
  /** Primary layer volume 0-100 */
  primaryVolume: number;
  /** Ambient layer volume 0-100 */
  ambientVolume: number;
  /** Primary layer muted */
  primaryMuted: boolean;
  /** Ambient layer muted */
  ambientMuted: boolean;
  /** Primary layer loaded playlist ID */
  primaryPlaylistId: string | null;
  /** Ambient layer loaded playlist ID */
  ambientPlaylistId: string | null;
  /** Primary shuffle */
  primaryShuffled: boolean;
  /** Ambient shuffle */
  ambientShuffled: boolean;
  /** Primary repeat mode */
  primaryRepeatMode: RepeatMode;
  /** Ambient repeat mode */
  ambientRepeatMode: RepeatMode;
}

/** Default (empty) playback state */
export const DEFAULT_PLAYBACK_STATE: MusicPlaybackState = {
  primaryVolume: 70,
  ambientVolume: 50,
  primaryMuted: false,
  ambientMuted: false,
  primaryPlaylistId: null,
  ambientPlaylistId: null,
  primaryShuffled: false,
  ambientShuffled: false,
  primaryRepeatMode: 'playlist',
  ambientRepeatMode: 'playlist',
};

/** Default sound effect presets for new installs */
export const DEFAULT_SOUNDBOARD_ICONS: Record<string, string> = {
  'Sword Clash': '⚔️',
  'Fire': '🔥',
  'Fanfare': '🎺',
  'Horror': '😱',
  'Death': '💀',
  'Door': '🚪',
  'Thunder': '⚡',
  'Magic': '✨',
  'Explosion': '💥',
  'Arrow': '🏹',
  'Healing': '💚',
  'Coins': '🪙'
};
