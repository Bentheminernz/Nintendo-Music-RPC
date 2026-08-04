import type { Server } from 'node:http';
import { app, ipcMain } from 'electron';
import { createLogger } from './utils/logger';
import { CLIENT_ID, PORT } from './utils/config';
import { DiscordIpc } from './discord/DiscordIpc';
import { buildActivity } from './discord/activity';
import { TrayManager } from './utils/TrayManager';
import { PreferencesStore } from './utils/preferences';
import type { Preferences } from './utils/preferences';
import { PreferencesWindow } from './utils/PreferencesWindow';
import { createBridgeServer } from './BridgerServer';
import type { BridgeState, Track, TrackPayload } from './types';
import { RpcImageSource, LabelPlacement, SPECIAL_PLAYLIST_IDS, SPECIAL_PLAYLISTS } from './types';
import { getToken, openAuthURL, getSession, LastfmAuthStore, updateNowPlaying, scrobbleTrack, shouldScrobble, isInvalidSessionError } from './utils/lastFMAuth';

const { log, warn } = createLogger('app');

// if the extension doesnt talk for 15s then thats our signal to clear
const HEARTBEAT_TIMEOUT_MS = 15_000;
const PAUSE_TIMEOUT_MS = 30_000;

/** Main app for handling RPC and the bridge server. */
export class RichPresenceApp {
  private currentTrack: Track | null = null;
  private lastfmCooldown = 0;
  private rpcEnabled = true;
  private tabConnected = true;
  private pauseTimedOut = false;
  private readonly playlistCache = new Map<string, { imageUrl: string; name: string }>();

  private discord: DiscordIpc | null = null;
  private server: Server | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private pausedTimer: NodeJS.Timeout | null = null;
  private prefs: PreferencesStore | null = null;
  private prefsWindow: PreferencesWindow | null = null;
  private readonly tray: TrayManager;
  private readonly subscribers = new Set<(track: Track | null) => void>();
  private pendingToken: string | null = null;
  private readonly lastfmAuth = new LastfmAuthStore();

  constructor() {
    this.tray = new TrayManager({
      clientIdConfigured: Boolean(CLIENT_ID),
      getCurrentTrack: () => this.currentTrack,
      isRpcReady: () => this.discord?.ready ?? false,
      isRpcEnabled: () => this.rpcEnabled,
      onToggleRpc: () => this.toggleRpc(),
      onOpenPreferences: () => this.prefsWindow?.open(),
      onQuit: () => this.quit(),
    });
  }

  /** Start the bridge server and connect to Discord. */
  start(): void {
    log('Starting bridge.', {
      port: PORT,
      clientIdConfigured: Boolean(CLIENT_ID),
      nodeVersion: process.version,
      platform: process.platform,
    });

    this.prefs = new PreferencesStore();
    this.prefsWindow = new PreferencesWindow();

    ipcMain.handle('prefs:get', () => {
      const all = this.prefs!.getAll();
      log('IPC prefs:get.', all);
      return all;
    });
    ipcMain.on('prefs:set', (_event, key: string, value: unknown) => {
      log('IPC prefs:set received.', { key, value });
      this.prefs!.set(key as keyof Preferences, value as Preferences[keyof Preferences]);
    });
    ipcMain.on('lastfm:startAuth', async (event) => {
      log('IPC lastfm:startAuth received.');
      this.pendingToken = await getToken();
      openAuthURL(this.pendingToken);
      void this.pollAuthComplete();
    });
    ipcMain.handle('lastfm:completeAuth', async () => {
      if (!this.pendingToken) {
        warn('IPC lastfm:completeAuth received but no pending token.');
        return null;
      }
      try {
        const token = this.pendingToken;
        const { username, sessionKey } = await getSession(token);
        this.lastfmAuth.setSession(username, sessionKey);
        this.pendingToken = null;
        this.prefs!.set('scrobblingEnabled', true);
        log('Last.fm authentication completed successfully.', { username });
        return { username, sessionKey };
      } catch (err) {
        warn('IPC lastfm:completeAuth failed.', { err });
        return null;
      }
    });
    ipcMain.handle('lastfm:getAuth', () => {
      return this.lastfmAuth.getAll();
    });
    ipcMain.on('lastfm:disconnect', () => {
      log('IPC lastfm:disconnect received.');
      this.lastfmAuth.clear();
      this.prefs!.set('scrobblingEnabled', false);
    });

    this.lastfmAuth.onChange((auth) => {
      this.prefsWindow?.win?.webContents.send('lastfm:changed', auth);
    });

    this.prefs.onChange((updated) => {
      this.prefsWindow?.sendUpdate(updated);
      this.updateActivity();
    });

    this.tray.create();
    this.server = createBridgeServer(PORT, {
      onTrack: (payload) => this.handleTrackUpdate(payload),
      onConnect: () => this.handleConnect(),
      onDisconnect: () => this.handleDisconnect(),
      getState: () => this.getState(),
      onLastfmCallback: (token) => {
        if (this.pendingToken && token === this.pendingToken) {
          log('Last.fm auth callback completing auth.');
          void getSession(token).then(({ username, sessionKey }) => {
            this.lastfmAuth.setSession(username, sessionKey);
            this.pendingToken = null;
            this.prefs!.set('scrobblingEnabled', true);
            log('Last.fm authentication completed via callback.', { username });
          }).catch((err) => {
            warn('Last.fm auth callback failed.', { err });
          });
        }
      },
    });
    void this.connectDiscord();
  }

  /** Stop the server and disconnect from Discord. */
  stop(): void {
    log('Cleaning up resources.');
    this.clearHeartbeat();
    this.clearPauseTimer();
    this.server?.close();
    this.discord?.destroy();
  }

  private async connectDiscord(): Promise<void> {
    if (!CLIENT_ID) {
      warn('DISCORD_CLIENT_ID is not set, Discord RPC will stay offline.');
      this.tray.update();
      return;
    }

    log('Connecting to Discord IPC.');
    this.discord = new DiscordIpc(CLIENT_ID, {
      onReady: () => {
        this.tray.update();
        if (this.currentTrack?.track.name) {
          log('Replaying current track after Discord ready.', this.currentTrack.track.name);
          this.updateActivity();
        }
      },
      onDisconnect: () => this.tray.update(),
    });

    try {
      await this.discord.connect();
    } catch (err) {
      warn('Could not connect to Discord IPC. Is Discord running?', (err as Error).message);
    }
  }

  private handleTrackUpdate(payload: TrackPayload): void {
    if (!payload.track.trackName) {
      log('Ignoring payload with no trackName.');
      return;
    }

    const playlistId = payload.playlist?.playlistId || null;
    const isSameTrack =
      (this.currentTrack?.track.id && payload.track.trackId && this.currentTrack.track.id === payload.track.trackId) ||
      (!payload.track.trackId &&
        this.currentTrack?.track.name === payload.track.trackName &&
        (this.currentTrack?.game.gameId ?? null) === (payload.game.gameId ?? null));

    if (isSameTrack && this.currentTrack) {
      this.currentTrack.currentTime = ct;
      this.currentTrack.duration = typeof payload.duration === 'number' ? payload.duration : null;

      const wasPaused = this.currentTrack.paused;
      this.currentTrack.paused = typeof payload.paused === 'boolean' ? payload.paused : null;
      this.currentTrack.receivedAt = new Date().toISOString();
      this.currentTrack.track.thumbnailURL = payload.track.thumbnailURL || null;
      this.currentTrack.track.rightNotation = payload.track.rightNotation || null;
      this.currentTrack.game.gameName = payload.game.gameName || null;
      this.currentTrack.game.gameId = payload.game.gameId || null;
      this.currentTrack.game.gameImage = payload.game.gameImage || null;
      this.currentTrack.game.formalHardware = payload.game.formalHardware || null;
      this.currentTrack.playlist = {
        playlistId,
        playlistImageURL: playlistId ? (this.playlistCache.get(playlistId)?.imageUrl ?? null) : null,
        playlistName: playlistId ? (this.playlistCache.get(playlistId)?.name ?? null) : null,
      };

      if (!this.currentTrack.scrobbled && shouldScrobble(this.currentTrack)) {
        void this.scrobbleCurrentTrack(this.currentTrack);
      }

      this.tabConnected = true;
      this.resetHeartbeat();

      if (this.currentTrack.paused) {
        if (!wasPaused && !this.pausedTimer) {
          this.pausedTimer = setTimeout(() => this.handlePauseTimeout(), PAUSE_TIMEOUT_MS);
        }
      } else {
        this.pauseTimedOut = false;
        this.clearPauseTimer();
      }

      this.tray.update();
      this.updateActivity();
      return;
    }

    const prevTrack = this.currentTrack;

    const newTrack: Track = {
      track: {
        name: payload.track.trackName,
        id: payload.track.trackId || null,
        thumbnailURL: payload.track.thumbnailURL || null,
        rightNotation: payload.track.rightNotation || null,
      },
      game: {
        gameName: payload.game.gameName || null,
        gameId: payload.game.gameId || null,
        gameImage: payload.game.gameImage || null,
        formalHardware: payload.game.formalHardware || null,
      },
      playlist: {
        playlistId,
        playlistImageURL: playlistId ? (this.playlistCache.get(playlistId)?.imageUrl ?? null) : null,
        playlistName: playlistId ? (this.playlistCache.get(playlistId)?.name ?? null) : null,
      },
      currentTime: typeof payload.currentTime === 'number' ? payload.currentTime : null,
      duration: typeof payload.duration === 'number' ? payload.duration : null,
      paused: typeof payload.paused === 'boolean' ? payload.paused : null,
      receivedAt: new Date().toISOString(),
    };

    this.currentTrack = newTrack;
    this.pauseTimedOut = false;
    this.clearPauseTimer();
    if (this.currentTrack.paused) {
      this.pausedTimer = setTimeout(() => this.handlePauseTimeout(), PAUSE_TIMEOUT_MS);
    }

    void this.tryScrobble(prevTrack, newTrack);

    log('Track changed.', {
      trackName: payload.track.trackName,
      playlistId,
      currentTime: payload.currentTime,
      duration: payload.duration,
      paused: payload.paused,
    });

    this.tabConnected = true;
    this.resetHeartbeat();
    this.tray.update();
    this.updateActivity();
    this.notify(this.currentTrack);

    if (playlistId && !this.playlistCache.has(playlistId)) {
      void this.fetchPlaylistData(playlistId);
    }
  }

  private readonly SCRMBLR_COOLDOWN_MS = 2_000;

  private canScrobble(): boolean {
    const now = Date.now();
    if (now < this.lastfmCooldown) return false;
    this.lastfmCooldown = now + this.SCRMBLR_COOLDOWN_MS;
    return true;
  }

  private async pollAuthComplete(): Promise<void> {
    for (let i = 0; i < 5; i++) {
      await new Promise((r) => setTimeout(r, 3000));
      if (!this.pendingToken) return;
      try {
        const token = this.pendingToken;
        const { username, sessionKey } = await getSession(token);
        this.lastfmAuth.setSession(username, sessionKey);
        this.pendingToken = null;
        this.prefs!.set('scrobblingEnabled', true);
        log('Last.fm authentication completed via auto-poll.', { username });
        return;
      } catch {
        // not yet authorized, will retry
      }
    }
  }

  private clearLastfmSession(): void {
    this.lastfmAuth.clear();
    this.prefs?.set('scrobblingEnabled', false);
    log('Cleared Last.fm session due to invalid session key.');
  }

  private async tryScrobble(prevTrack: Track | null, newTrack: Track): Promise<void> {
    const session = this.lastfmAuth.getAll();
    const prefs = this.prefs?.getAll();
    if (!session.sessionKey || !prefs?.scrobblingEnabled) return;

    if (prevTrack && !prevTrack.scrobbled && shouldScrobble(prevTrack)) {
      if (!this.canScrobble()) {
        log('Skipping scrobble (cooldown).', { track: prevTrack.track.name });
      } else {
        prevTrack.scrobbled = true;
        const timestamp = Math.floor(Date.now() / 1000) - Math.round(prevTrack.currentTime ?? 0);
        try {
          await scrobbleTrack(prevTrack, session.sessionKey, timestamp);
          log('Scrobbled previous track.', { track: prevTrack.track.name });
        } catch (err) {
          if (isInvalidSessionError(err)) { this.clearLastfmSession(); return; }
          warn('Failed to scrobble previous track.', { err });
        }
      }
    }

    try {
      await updateNowPlaying(newTrack, session.sessionKey);
      log('Updated Now Playing on Last.fm.', { track: newTrack.track.name });
    } catch (err) {
      if (isInvalidSessionError(err)) { this.clearLastfmSession(); return; }
      warn('Failed to update Now Playing on Last.fm.', { err });
    }
  }

  private async scrobbleOnStop(track: Track): Promise<void> {
    const session = this.lastfmAuth.getAll();
    const prefs = this.prefs?.getAll();
    if (!session.sessionKey || !prefs?.scrobblingEnabled) return;
    if (track.scrobbled || !shouldScrobble(track)) return;
    if (!this.canScrobble()) {
      log('Skipping scrobble on stop (cooldown).', { track: track.track.name });
      return;
    }

    track.scrobbled = true;
    const timestamp = Math.floor(Date.now() / 1000) - Math.round(track.currentTime ?? 0);
    try {
      await scrobbleTrack(track, session.sessionKey, timestamp);
      log('Scrobbled track on stop.', { track: track.track.name });
    } catch (err) {
      if (isInvalidSessionError(err)) { this.clearLastfmSession(); return; }
      warn('Failed to scrobble track on stop.', { err });
    }
  }

  private async fetchPlaylistData(playlistId: string): Promise<void> {
    const special = Object.values(SPECIAL_PLAYLIST_IDS).includes(playlistId as SPECIAL_PLAYLIST_IDS)
      ? SPECIAL_PLAYLISTS[playlistId as SPECIAL_PLAYLIST_IDS]
      : undefined;
    if (special) {
      log(`Skipping fetch for ${special.name} playlist.`);
      this.playlistCache.set(playlistId, special);
      if (this.currentTrack?.playlist?.playlistId === playlistId) {
        this.currentTrack.playlist.playlistImageURL = special.imageUrl;
        this.currentTrack.playlist.playlistName = special.name;
        this.updateActivity();
      }
      return;
    }

    try {
      const url = `https://api.m.nintendo.com/catalog/officialPlaylists/${playlistId}?country=NZ&lang=en-US`;
      const res = await fetch(url);

      if (!res.ok) {
        warn('Failed to fetch playlist data.', { playlistId, status: res.status, statusText: res.statusText });
        return;
      }

      const data = await res.json() as { thumbnailURL?: string; name?: string };
	
      const imageUrl = typeof data?.thumbnailURL === 'string' ? data.thumbnailURL : null;
      const name = typeof data?.name === 'string' ? data.name : null;
      if (!imageUrl || !name) {
        warn('Playlist data missing thumbnailURL or name.', { playlistId, data });
        return;
      }

      this.playlistCache.set(playlistId, { imageUrl, name });
      if (this.currentTrack?.playlist?.playlistId === playlistId) {
        this.currentTrack.playlist.playlistImageURL = imageUrl;
        this.currentTrack.playlist.playlistName = name;
        this.updateActivity();
      }
    } catch (err) {
      warn('Failed to fetch playlist data.', { playlistId, err });
    }
  }

  private handleConnect(): void {
    log('Tab connected — enabling Discord RPC.');
    this.tabConnected = true;
    this.resetHeartbeat();
    if (this.currentTrack) this.updateActivity();
    this.tray.update();
  }

  private handleDisconnect(): void {
    log('Tab disconnected — clearing activity.');
    this.clearHeartbeat();
    this.clearPauseTimer();
    this.pauseTimedOut = false;
    this.tabConnected = false;

    const lastTrack = this.currentTrack;
    this.currentTrack = null;

    if (lastTrack) {
      void this.scrobbleOnStop(lastTrack);
    }

    this.discord?.clearActivity();
    this.tray.update();
    this.notify(null);
  }

  private async scrobbleCurrentTrack(track: Track): Promise<void> {
    const session = this.lastfmAuth.getAll();
    const prefs = this.prefs?.getAll();
    if (!session.sessionKey || !prefs?.scrobblingEnabled) return;
    if (!this.canScrobble()) {
      log('Skipping scrobble (cooldown).', { track: track.track.name });
      return;
    }

    track.scrobbled = true;
    const timestamp = Math.floor(Date.now() / 1000) - Math.round(track.currentTime ?? 0);
    try {
      await scrobbleTrack(track, session.sessionKey, timestamp);
      log('Scrobbled current track (threshold reached).', { track: track.track.name });
    } catch (err) {
      if (isInvalidSessionError(err)) { this.clearLastfmSession(); return; }
      warn('Failed to scrobble current track.', { err });
    }
  }

  private resetHeartbeat(): void {
    this.clearHeartbeat();
    this.heartbeatTimer = setTimeout(() => this.handleHeartbeatTimeout(), HEARTBEAT_TIMEOUT_MS);
  }

  private clearPauseTimer(): void {
    if (this.pausedTimer) {
      clearTimeout(this.pausedTimer);
      this.pausedTimer = null;
    }
  }

  private handlePauseTimeout(): void {
    this.pausedTimer = null;
    this.pauseTimedOut = true;
    log(`Track paused for ${PAUSE_TIMEOUT_MS / 1000}s — clearing Discord activity.`);
    this.discord?.clearActivity();
    this.tray.update();
  }

  private clearHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearTimeout(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private handleHeartbeatTimeout(): void {
    this.heartbeatTimer = null;
    this.clearPauseTimer();
    this.pauseTimedOut = false;
    log(`No ping from extension for ${HEARTBEAT_TIMEOUT_MS / 1000}s — clearing activity.`);
    this.tabConnected = false;

    const lastTrack = this.currentTrack;
    this.currentTrack = null;

    if (lastTrack) {
      void this.scrobbleOnStop(lastTrack);
    }

    this.discord?.clearActivity();
    this.tray.update();
    this.notify(null);
  }

  private toggleRpc(): void {
    this.rpcEnabled = !this.rpcEnabled;
    log('Discord RPC toggled.', { rpcEnabled: this.rpcEnabled });

    if (!this.rpcEnabled) {
      this.discord?.clearActivity();
    } else {
      this.updateActivity();
    }

    this.tray.update();
  }

  private updateActivity(): void {
    const track = this.currentTrack;

    if (!this.discord?.ready || !track?.track.name || !this.rpcEnabled || !this.tabConnected || this.pauseTimedOut) {
      log('Skipping Discord activity update.', {
        rpcReady: this.discord?.ready ?? false,
        rpcEnabled: this.rpcEnabled,
        tabConnected: this.tabConnected,
        trackName: track?.track.name,
      });
      return;
    }

    const opts = this.prefs?.getAll() ?? { splatoonDetailedRpc: true, largeRpcImage: RpcImageSource.Track, smallRpcImage: RpcImageSource.Game, listeningStatusTag: RpcImageSource.Track, statusLabelPlacement: LabelPlacement.Left };
    log('Updating Discord activity.', { track: track.track.name, opts });
    this.discord.setActivity(buildActivity(track, opts));
  }

  subscribe(callback: (track: Track | null) => void): () => void {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }

  private notify(track: Track | null): void {
    for (const cb of this.subscribers) cb(track);
  }

  getState(): BridgeState {
    return {
      ok: true,
      rpcReady: this.discord?.ready ?? false,
      rpcEnabled: this.rpcEnabled,
      clientIdConfigured: Boolean(CLIENT_ID),
      currentTrack: this.currentTrack,
    };
  }

  private quit(): void {
    app.quit();
  }
}
