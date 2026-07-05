export enum RpcImageSource {
  Game = 'game',
  Track = 'track',
  Playlist = 'playlist',
}

export { RpcImageSource as ListeningStatusTag };

export enum LabelPlacement {
  Own = 'own',
  Left = 'left',
  Right = 'right',
  Hidden = 'hidden',
}

export { LabelPlacement as StatusLabelPlacement }

/** A track as tracked internally by the bridge. */
export interface Track {
  playlist?: {
    playlistId: string | null;
    playlistImageURL?: string | null;
    playlistName?: string | null;
  },
  track: {
    name: string;
    id: string | null;
    thumbnailURL: string | null;
    rightNotation: string | null;
  },
  game: {
    gameName: string | null;
    gameId: string | null;
    gameImage: string | null;
    formalHardware: string | null;
  },
  currentTime: number | null;
  duration: number | null;
  paused: boolean | null;
  receivedAt: string;
}

export namespace Track {
  export function trackURL(track: Track): string | null {
    return track.track.id ? `https://music.nintendo.com/shared/en-US/NZ/tracks/${track.track.id}/` : null;
  }

  export function gameURL(track: Track): string | null {
    return track.game.gameId ? `https://music.nintendo.com/en-US/game/${track.game.gameId}/` : null;
  }
}

/** The raw payload posted to the bridge by the browser extension. */
export interface TrackPayload {
  playlist?: {
    playlistId?: string;
  },
  track: {
    trackName?: string;
    trackId?: string | null;
    thumbnailURL?: string | null;
    rightNotation?: string | null;
  },
  game: {
    gameName?: string | null;
    gameId?: string | null;
    gameImage?: string | null;
    formalHardware?: string | null;
  },
  currentTime?: number | null;
  duration?: number | null;
  paused?: boolean | null;
}

/** Type for the rich presence buttons on Discord. */
export interface DiscordActivityButton {
  label: string;
  url: string;
}

/** Assets for a Discord Rich Presence activity. */
export interface DiscordActivityAssets {
  large_image: string;
  large_text: string;
  small_image?: string;
  small_text?: string;
}

/** Timestamps for a Discord Rich Presence activity. */
export interface DiscordActivityTimestamps {
  start: number;
  end: number;
}

/** A Discord Rich Presence activity object. */
export interface DiscordActivity {
  name?: string;
  details?: string;
  state?: string;
  type?: number;
  instance?: boolean;
  timestamps?: DiscordActivityTimestamps;
  assets?: DiscordActivityAssets;
  buttons?: DiscordActivityButton[];
}

/** State reported over the HTTP bridge (e.g. GET /health). */
export interface BridgeState {
  ok: boolean;
  rpcReady: boolean;
  rpcEnabled: boolean;
  clientIdConfigured: boolean;
  currentTrack: Track | null;
}

export const SPLATOON_GAME_ID = '6338c15d-3f36-47f0-aa47-e46d69ff50f5';
export const SPLATOON_2_GAME_ID = 'f3a39d36-519f-4839-87d3-ec70c0298b6a';
export const SPLATOON_3_GAME_ID = '5bd86aee-7a21-4aac-a894-bb3f98d0cc91';

export enum SPECIAL_PLAYLIST_IDS {
  Favorite = 'favorite',
  SearchHistory = 'search_history',
}

export const SPECIAL_PLAYLISTS: Record<SPECIAL_PLAYLIST_IDS, { imageUrl: string; name: string }> = {
  [SPECIAL_PLAYLIST_IDS.Favorite]: { imageUrl: 'star', name: 'Favorites' },
  [SPECIAL_PLAYLIST_IDS.SearchHistory]: { imageUrl: 'search', name: 'Search Results' },
};
