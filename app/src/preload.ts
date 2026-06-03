import { contextBridge, ipcRenderer } from 'electron';
import type { BridgeState } from './types';

console.log('[Nintendo Music][preload] Preload script loaded.');

/** API exposed to the renderer process for interacting with the bridge. */
export interface BridgeApi {
  getState: () => Promise<BridgeState>;
  onState: (callback: (state: BridgeState) => void) => () => void;
}

const api: BridgeApi = {
  getState: () => {
    console.log('[Nintendo Music][preload] Renderer requested initial bridge state.');
    return ipcRenderer.invoke('get-bridge-state');
  },
  onState: (callback) => {
    console.log('[Nintendo Music][preload] Renderer subscribed to bridge state updates.');
    const listener = (_event: Electron.IpcRendererEvent, state: BridgeState) => callback(state);
    ipcRenderer.on('bridge-state', listener);

    return () => {
      console.log('[Nintendo Music][preload] Renderer unsubscribed from bridge state updates.');
      ipcRenderer.removeListener('bridge-state', listener);
    };
  },
};

contextBridge.exposeInMainWorld('bridge', api);
