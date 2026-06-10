import { app } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { BrowserWindow } from 'electron';
import { createLogger } from './logger';
import type { Preferences } from './preferences';

const { log, warn } = createLogger('prefs-window');

export class PreferencesWindow {
  private win: BrowserWindow | null = null;

  open(): void {
    if (this.win && !this.win.isDestroyed()) {
      this.win.focus();
      return;
    }

    const distBase = app.isPackaged
      ? path.join(process.resourcesPath, 'app.asar.unpacked', 'app', 'dist')
      : path.join(__dirname, '..');
    const preloadPath = path.join(distBase, 'preload-prefs.js');
    const htmlPath = path.join(distBase, 'preferences.html');

    log('Opening preferences window.', {
      preloadPath,
      preloadExists: fs.existsSync(preloadPath),
      htmlPath,
      htmlExists: fs.existsSync(htmlPath),
    });

    if (!fs.existsSync(preloadPath)) {
      warn('Preload script not found at expected path!', preloadPath);
    }

    this.win = new BrowserWindow({
      width: 400,
      height: 280,
      resizable: false,
      minimizable: false,
      maximizable: false,
      title: 'Preferences',
      show: false,
      webPreferences: {
        preload: preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    void this.win.loadURL(`file://${htmlPath}`);
    if (!app.isPackaged) {
      this.win.webContents.openDevTools({ mode: 'detach' });
    }
    this.win.once('ready-to-show', () => {
      this.win?.show();
      this.win?.focus();
    });
    this.win.on('closed', () => {
      this.win = null;
    });

    log('Preferences window opened.');
  }

  sendUpdate(prefs: Preferences): void {
    if (this.win && !this.win.isDestroyed()) {
      log('Sending prefs:changed to renderer.', prefs);
      this.win.webContents.send('prefs:changed', prefs);
    }
  }
}
