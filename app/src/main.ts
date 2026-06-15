import { app, protocol, net } from 'electron';
import { autoUpdater } from 'electron-updater';
import { createLogger } from './utils/logger';
import { RichPresenceApp } from './app';
import { createServer } from './httpServer/server';
import { setupAutoLaunch } from './utils/autoLaunch';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const { log, warn } = createLogger('electron');

process.on('uncaughtException', (error) => warn('Uncaught exception.', error));
process.on('unhandledRejection', (reason) => warn('Unhandled rejection.', reason));

const presence = new RichPresenceApp();
const server = createServer({
  getCurrentTrack: () => presence.getState().currentTrack,
  subscribe: (cb) => presence.subscribe(cb),
});

app.on('window-all-closed', () => {});

app.whenReady().then(() => {
  log('Electron app ready.');

  if (process.platform === 'darwin') app.dock?.hide();

  setupAutoLaunch();
  presence.start();

  if (process.platform !== 'darwin') {
    autoUpdater.checkForUpdatesAndNotify().catch((err) => warn('Auto-update check failed.', err));
  }
});

app.on('before-quit', () => presence.stop());