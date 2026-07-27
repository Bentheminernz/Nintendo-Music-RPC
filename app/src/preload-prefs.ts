import { contextBridge, ipcRenderer } from 'electron';
import type { Preferences } from './utils/preferences';
import type { LastfmAuth } from './utils/lastFMAuth';

export interface PrefsApi {
  getAll: () => Promise<Preferences>;
  set: <K extends keyof Preferences>(key: K, value: Preferences[K]) => void;
  onChange: (cb: (prefs: Preferences) => void) => () => void;
  lastfm: {
    startAuth: () => void;
    completeAuth: () => Promise<{ username: string; sessionKey: string } | null>;
    getAuth: () => Promise<LastfmAuth>;
    disconnect: () => void;
    onChange: (cb: (auth: LastfmAuth) => void) => () => void;
  };
}

const api: PrefsApi = {
  getAll: () => ipcRenderer.invoke('prefs:get'),
  set: (key, value) => ipcRenderer.send('prefs:set', key, value),
  onChange: (cb) => {
    const listener = (_event: Electron.IpcRendererEvent, prefs: Preferences) => cb(prefs);
    ipcRenderer.on('prefs:changed', listener);
    return () => ipcRenderer.removeListener('prefs:changed', listener);
  },
  lastfm: {
    startAuth: () => ipcRenderer.send('lastfm:startAuth'),
    completeAuth: () => ipcRenderer.invoke('lastfm:completeAuth'),
    getAuth: () => ipcRenderer.invoke('lastfm:getAuth'),
    disconnect: () => ipcRenderer.send('lastfm:disconnect'),
    onChange: (cb) => {
      const listener = (_event: Electron.IpcRendererEvent, auth: LastfmAuth) => cb(auth);
      ipcRenderer.on('lastfm:changed', listener);
      return () => ipcRenderer.removeListener('lastfm:changed', listener);
    },
  },
};

contextBridge.exposeInMainWorld('prefs', api);
