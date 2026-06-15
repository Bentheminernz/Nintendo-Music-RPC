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

const { log, warn } = createLogger('app');

// if the extension doesnt talk for 15s then thats our signal to clear
const HEARTBEAT_TIMEOUT_MS = 15_000;

/** Main app for handling RPC and the bridge server. */
export class RichPresenceApp {
  private currentTrack: Track | null = null;
  private rpcEnabled = true;
  private tabConnected = true;

  private discord: DiscordIpc | null = null;
  private server: Server | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private prefs: PreferencesStore | null = null;
  private prefsWindow: PreferencesWindow | null = null;
  private readonly tray: TrayManager;
  private readonly subscribers = new Set<(track: Track | null) => void>();

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
    });
    void this.connectDiscord();
  }

  /** Stop the server and disconnect from Discord. */
  stop(): void {
    log('Cleaning up resources.');
    this.clearHeartbeat();
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

    this.currentTrack = {
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
      currentTime: typeof payload.currentTime === 'number' ? payload.currentTime : null,
      duration: typeof payload.duration === 'number' ? payload.duration : null,
      paused: typeof payload.paused === 'boolean' ? payload.paused : null,
      receivedAt: new Date().toISOString(),
    };

    log('Track updated.', {
      trackName: payload.track.trackName,
      currentTime: payload.currentTime,
      duration: payload.duration,
      paused: payload.paused,
    });

    this.tabConnected = true;
    this.resetHeartbeat();
    this.tray.update();
    this.updateActivity();
    this.notify(this.currentTrack);
  }

  private handleConnect(): void {
    log('Tab connected — enabling Discord RPC.');
    this.tabConnected = true;
    this.resetHeartbeat();
    if (this.currentTrack) this.updateActivity();
    this.tray.update();
  }

  private handleDisconnect(): void {
    log('Tab disconnected — clearing Discord activity.');
    this.clearHeartbeat();
    this.tabConnected = false;
    this.currentTrack = null;
    this.discord?.clearActivity();
    this.tray.update();
    this.notify(null);
  }

  private resetHeartbeat(): void {
    this.clearHeartbeat();
    this.heartbeatTimer = setTimeout(() => this.handleHeartbeatTimeout(), HEARTBEAT_TIMEOUT_MS);
  }

  private clearHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearTimeout(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private handleHeartbeatTimeout(): void {
    this.heartbeatTimer = null;
    log(`No ping from extension for ${HEARTBEAT_TIMEOUT_MS / 1000}s — clearing Discord activity.`);
    this.tabConnected = false;
    this.currentTrack = null;
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

    if (!this.discord?.ready || !track?.track.name || !this.rpcEnabled || !this.tabConnected) {
      log('Skipping Discord activity update.', {
        rpcReady: this.discord?.ready ?? false,
        rpcEnabled: this.rpcEnabled,
        tabConnected: this.tabConnected,
        trackName: track?.track.name,
      });
      return;
    }

    const opts = this.prefs?.getAll() ?? { splatoonDetailedRpc: true };
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
