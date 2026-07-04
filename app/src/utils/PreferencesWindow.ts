import { app } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { BrowserWindow } from 'electron';
import { createLogger } from './logger';
import type { Preferences } from './preferences';
import { preferencesHtml } from '../preferencesHtml';

const { log, warn } = createLogger('prefs-window');

export class PreferencesWindow {
  win: BrowserWindow | null = null;

  open(): void {
    if (this.win && !this.win.isDestroyed()) {
      this.win.focus();
      return;
    }

    const preloadPath = app.isPackaged
      ? path.join(process.resourcesPath, 'app', 'dist', 'preload-prefs.js')
      : path.join(__dirname, '..', 'preload-prefs.js');

    log('Opening preferences window.', {
      preloadPath,
      preloadExists: fs.existsSync(preloadPath),
      __dirname,
    });

    if (!fs.existsSync(preloadPath)) {
      warn('Preload script not found!', preloadPath);
      return;
    }

    this.win = new BrowserWindow({
      width: 400,
      height: 350,
      minWidth: 400,
      minHeight: 350,
      resizable: true,
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

    void this.win.loadURL(
      `data:text/html;charset=utf-8,${encodeURIComponent(preferencesHtml)}`
    );

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