import type { Server } from 'node:http';
import { app } from 'electron';
import { createLogger } from './logger';
import { CLIENT_ID, PORT } from './config';
import { DiscordIpc } from './discord/DiscordIpc';
import { buildActivity } from './discord/activity';
import { TrayManager } from './TrayManager';
import { createBridgeServer } from './bridgeServer';
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
  private readonly tray: TrayManager;

  constructor() {
    this.tray = new TrayManager({
      clientIdConfigured: Boolean(CLIENT_ID),
      getCurrentTrack: () => this.currentTrack,
      isRpcReady: () => this.discord?.ready ?? false,
      isRpcEnabled: () => this.rpcEnabled,
      onToggleRpc: () => this.toggleRpc(),
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
        if (this.currentTrack?.name) {
          log('Replaying current track after Discord ready.', this.currentTrack.name);
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
    if (!payload.trackName) {
      log('Ignoring payload with no trackName.');
      return;
    }

    this.currentTrack = {
      name: payload.trackName,
      id: payload.trackId || null,
      thumbnailURL: payload.thumbnailURL || null,
      gameName: payload.gameName || null,
      gameId: payload.gameId || null,
      currentTime: typeof payload.currentTime === 'number' ? payload.currentTime : null,
      duration: typeof payload.duration === 'number' ? payload.duration : null,
      paused: typeof payload.paused === 'boolean' ? payload.paused : null,
      receivedAt: new Date().toISOString(),
    };

    log('Track updated.', {
      trackName: payload.trackName,
      currentTime: payload.currentTime,
      duration: payload.duration,
      paused: payload.paused,
    });

    this.tabConnected = true;
    this.resetHeartbeat();
    this.tray.update();
    this.updateActivity();
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
    this.discord?.clearActivity();
    this.tray.update();
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
    this.discord?.clearActivity();
    this.tray.update();
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

    if (!this.discord?.ready || !track?.name || !this.rpcEnabled || !this.tabConnected) {
      log('Skipping Discord activity update.', {
        rpcReady: this.discord?.ready ?? false,
        rpcEnabled: this.rpcEnabled,
        tabConnected: this.tabConnected,
        trackName: track?.name,
      });
      return;
    }

    this.discord.setActivity(buildActivity(track));
  }

  private getState(): BridgeState {
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
