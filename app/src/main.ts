import { app, shell } from 'electron';
import { createLogger } from './logger';
import { RichPresenceApp } from './app';

const { log, warn } = createLogger('electron');

process.on('uncaughtException', (error) => warn('Uncaught exception.', error));
process.on('unhandledRejection', (reason) => warn('Unhandled rejection.', reason));

const presence = new RichPresenceApp();

// this stops the app from quitting when all windows are closed
app.on('window-all-closed', () => {});

app.whenReady().then(() => {
  log('Electron app ready.');

  if (process.platform === 'darwin') app.dock?.hide();

  presence.start();

  // todo: determine if i wanna keep this, its lowkey annoying
  shell.openExternal('https://music.nintendo.com');
});

app.on('before-quit', () => presence.stop());
