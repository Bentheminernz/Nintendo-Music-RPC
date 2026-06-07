(() => {
  const BRIDGE_URL = 'http://127.0.0.1:17891/health';
  const REFRESH_MS = 3000;

  const $ = (id) => document.getElementById(id);

  function formatTime(seconds) {
    if (typeof seconds !== 'number' || isNaN(seconds)) return '--:--';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  function renderOffline() {
    $('header-sub').textContent = 'App not running';
    $('discord-dot').className = 'discord-dot';
    $('discord-label').textContent = 'Discord';

    $('main-content').innerHTML = `
      <div class="offline-card">
        <div class="offline-icon">🎵</div>
        <div class="offline-title">App not running</div>
        <div class="offline-sub">Start the Nintendo Music RPC desktop app to enable Discord Rich Presence.</div>
        <button class="download-btn" id="download-btn">⬇ Download App</button>
      </div>
    `;

    $('download-btn').addEventListener('click', () => {
      const tabs = (typeof browser !== 'undefined' ? browser : chrome).tabs;
      tabs.create({ url: 'https://github.com/bentheminernz/nintendo-Music-RPC/releases/latest' });
    });
  }

  function renderState(state) {
    const { rpcReady, rpcEnabled, currentTrack } = state;

    // Compute status values as plain strings — no DOM reads before the innerHTML write
    let dotClass, statusTextStr, statusSubStr;
    if (rpcReady) {
      dotClass = 'connected';
      statusTextStr = 'Connected to Discord';
      statusSubStr = rpcEnabled ? 'Rich Presence is active' : 'RPC is disabled';
    } else if (rpcEnabled) {
      dotClass = 'partial';
      statusTextStr = 'Waiting for Discord';
      statusSubStr = 'Open Discord to enable Rich Presence';
    } else {
      dotClass = 'disconnected';
      statusTextStr = 'RPC disabled';
      statusSubStr = 'Re-enable via the tray icon';
    }

    $('header-sub').textContent = rpcReady ? 'Active' : rpcEnabled ? 'Waiting for Discord' : 'RPC disabled';
    $('discord-dot').className = rpcReady ? 'discord-dot ready' : 'discord-dot';
    $('discord-label').textContent = rpcReady ? 'Discord connected' : 'Discord offline';

    let trackHTML = `
      <div class="status-card">
        <div class="status-dot ${dotClass}" id="status-dot"></div>
        <div>
          <div class="status-text" id="status-text">${statusTextStr}</div>
          <div class="status-sub" id="status-sub">${statusSubStr}</div>
        </div>
      </div>
    `;

    if (currentTrack) {
      const name = currentTrack.track?.name ?? 'Unknown track';
      const gameName = currentTrack.game?.gameName ?? '';
      const thumb = currentTrack.track?.thumbnailURL;
      const paused = currentTrack.paused;
      const currentTime = currentTrack.currentTime;
      const duration = currentTrack.duration;

      const thumbEl = thumb
        ? `<img class="track-thumb" src="${escapeHtml(thumb)}" alt="">`
        : `<div class="track-thumb-placeholder">♪</div>`;

      const pausedBadge = paused
        ? `<span class="paused-badge">⏸ Paused</span>`
        : '';

      const timeEl = (typeof currentTime === 'number' && typeof duration === 'number')
        ? `<div class="track-time">${formatTime(currentTime)} / ${formatTime(duration)}</div>`
        : '';

      trackHTML += `
        <div class="track-card">
          ${thumbEl}
          <div class="track-info">
            <div class="track-name">${escapeHtml(name)}${pausedBadge}</div>
            ${gameName ? `<div class="track-game">${escapeHtml(gameName)}</div>` : ''}
            ${timeEl}
          </div>
        </div>
      `;
    }

    $('main-content').innerHTML = trackHTML;
  }

  function escapeHtml(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  async function refresh() {
    try {
      const res = await fetch(BRIDGE_URL, { signal: AbortSignal.timeout(2000) });
      const state = await res.json();
      renderState(state);
    } catch {
      renderOffline();
    }
  }

  refresh();
  setInterval(refresh, REFRESH_MS);
})();
