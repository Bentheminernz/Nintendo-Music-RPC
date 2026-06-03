// render for window, idk if i wanna keep it around

import type { BridgeApi } from './preload';

interface BridgeRendererState {
  rpcReady?: boolean;
  clientIdConfigured?: boolean;
  currentTrack?: {
    name?: string;
    gameName?: string | null;
    currentTime?: number | null;
    duration?: number | null;
    paused?: boolean | null;
  } | null;
}

declare global {
  interface Window {
    bridge: BridgeApi;
  }
}

const trackNameEl = document.getElementById('track-name');
const rpcStatusEl = document.getElementById('rpc-status');
const rpcDotEl = document.getElementById('rpc-dot');
const gameNameEl = document.getElementById('game-name');
const playbackEl = document.getElementById('playback-time');

const log = (message: string, ...details: unknown[]) =>
  console.log(`[Nintendo Music][renderer] ${message}`, ...details);

log('Renderer script started.');

const formatTime = (seconds: number | null | undefined): string => {
  if (typeof seconds !== 'number' || Number.isNaN(seconds)) return '--:--';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
};

const renderState = (state: BridgeRendererState | null | undefined): void => {
  if (!state) return;
  log('Rendering bridge state.', state);

  if (rpcStatusEl && rpcDotEl) {
    if (state.rpcReady) {
      rpcStatusEl.textContent = 'Connected to Discord';
      rpcDotEl.classList.add('connected');
    } else {
      rpcStatusEl.textContent = state.clientIdConfigured
        ? 'Waiting for Discord'
        : 'Discord not configured';
      rpcDotEl.classList.remove('connected');
    }
  }

  const track = state.currentTrack;

  if (trackNameEl && track?.name) {
    trackNameEl.textContent = track.name;
    trackNameEl.classList.remove('empty');
  }

  if (gameNameEl) {
    gameNameEl.textContent = track?.gameName || '';
  }

  if (playbackEl) {
    const current = formatTime(track?.currentTime);
    const total = formatTime(track?.duration);
    const paused = track?.paused ? ' ⏸' : '';
    playbackEl.textContent = track ? `${current} / ${total}${paused}` : '';
  }
};

window.bridge
  .getState()
  .then(renderState)
  .catch((err) => log('Failed to get initial state.', err));

window.bridge.onState((state) => {
  log('Received bridge state update.');
  renderState(state);
});
