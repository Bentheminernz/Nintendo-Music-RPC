import path from 'node:path';
import fs from 'node:fs';
import { Tray, Menu, shell, nativeImage } from 'electron';
import { createLogger } from './logger';
import type { Track } from '../types';

const { log } = createLogger('tray');

/** Options for configuring the tray menu and behavior. */
export interface TrayOptions {
  clientIdConfigured: boolean;
  getCurrentTrack: () => Track | null;
  isRpcReady: () => boolean;
  isRpcEnabled: () => boolean;
  onToggleRpc: () => void;
  onOpenPreferences: () => void;
  onQuit: () => void;
}

/** Manages the system tray icon and menu. */
export class TrayManager {
  private tray: Tray | null = null;

  constructor(private readonly options: TrayOptions) {}

  create(): void {
    const iconPath = path.join(__dirname, '..', 'assets', 'tray-icon-template.png');
    const icon = fs.existsSync(iconPath)
      ? nativeImage.createFromPath(iconPath)
      : nativeImage.createEmpty();

    icon.setTemplateImage(true);

    this.tray = new Tray(icon);
    this.tray.setToolTip('Nintendo Music');
    this.tray.on('click', () => this.tray?.popUpContextMenu());

    this.update();
    log('Tray created.');
  }

  update(): void {
    if (!this.tray) return;

    this.tray.setContextMenu(this.buildMenu());

    const track = this.options.getCurrentTrack();
    this.tray.setToolTip(track?.track.name ? `Nintendo Music · ${track.track.name}` : 'Nintendo Music');
  }

  private buildMenu(): Menu {
    const track = this.options.getCurrentTrack();

    const trackLabel = track?.track.name
      ? `${track.paused ? '⏸' : '▶'} ${track.track.name}`
      : 'Not playing';

    const gameLabel = track?.game.gameName ? `   ${track.game.gameName}` : null;

    const discordStatus = !this.options.clientIdConfigured
      ? 'Discord: not configured'
      : this.options.isRpcReady()
        ? 'Discord: connected'
        : 'Discord: waiting for Discord';

    return Menu.buildFromTemplate([
      { label: 'Nintendo Music RPC', enabled: false },
      { type: 'separator' },
      { label: trackLabel, enabled: false },
      ...(gameLabel ? [{ label: gameLabel, enabled: false }] : []),
      { type: 'separator' },
      { label: discordStatus, enabled: false },
      {
        label: 'Discord RPC',
        type: 'checkbox',
        checked: this.options.isRpcEnabled(),
        click: () => this.options.onToggleRpc(),
      },
      { type: 'separator' },
      {
        label: 'Preferences...',
        click: () => this.options.onOpenPreferences(),
      },
      { type: 'separator' },
      {
        label: 'Open Nintendo Music',
        click: () => shell.openExternal('https://music.nintendo.com'),
      },
      {
        label: 'Open GitHub Repository',
        click: () => shell.openExternal('https://github.com/bentheminernz/nintendo-music-rpc'),
      },
      {
        label: 'Download Firefox Extension',
        click: () =>
          shell.openExternal(
            'https://addons.mozilla.org/en-US/firefox/addon/nintendo-music-discord-rpc/',
          ),
      },
      {
        label: 'Download Chrome Extension',
        click: () =>
          shell.openExternal('https://chromewebstore.google.com/detail/nintendo-music-discord-rp/boiekifeicdcjjjfeinllgcmnmmbgegf'),
      },
      { type: 'separator' },
      {
        label: 'Quit',
        click: () => this.options.onQuit(),
      },
    ]);
  }
}
