/** A track as tracked internally by the bridge. */
export interface Track {
  name: string;
  id: string | null;
  thumbnailURL: string | null;
  gameName: string | null;
  gameId: string | null;
  currentTime: number | null;
  duration: number | null;
  paused: boolean | null;
  receivedAt: string;
}

/** The raw payload posted to the bridge by the browser extension. */
export interface TrackPayload {
  trackName?: string;
  trackId?: string | null;
  thumbnailURL?: string | null;
  gameName?: string | null;
  gameId?: string | null;
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
}

/** Timestamps for a Discord Rich Presence activity. */
export interface DiscordActivityTimestamps {
  start: number;
  end: number;
}

/** A Discord Rich Presence activity object. */
export interface DiscordActivity {
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
