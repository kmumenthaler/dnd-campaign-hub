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
  /** Scene type → mood mapping for auto-play */
  sceneTypeMoodMap: Record<string, string>;
  /** Default volume 0-100 */
  defaultVolume: number;
  /** Crossfade duration in ms */
  crossfadeDurationMs: number;
  /** Fade in/out duration in ms for play/pause/stop (0 = instant) */
  fadeDurationMs: number;
  /** Auto-play music when scene changes */
  autoPlayOnSceneChange: boolean;
  /** Default volume for ambient layer 0-100 */
  ambientVolume: number;
}

/** Default music settings */
export const DEFAULT_MUSIC_SETTINGS: MusicSettings = {
  audioFolderPath: '',
  playlists: [],
  soundEffects: [],
  sceneTypeMoodMap: {
    combat: 'combat',
    social: 'ambient',
    exploration: 'exploration',
    puzzle: 'mysterious',
    montage: 'epic'
  },
  defaultVolume: 70,
  crossfadeDurationMs: 2000,
  fadeDurationMs: 1500,
  autoPlayOnSceneChange: true,
  ambientVolume: 50
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
