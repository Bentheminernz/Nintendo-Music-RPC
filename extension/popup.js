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
    $('status-dot').className = 'status-dot disconnected';
    $('discord-dot').className = 'discord-dot';
    $('discord-label').textContent = 'Discord';

    $('main-content').innerHTML = `
      <div class="offline-card">
        <div class="offline-icon">🎵</div>
        <div class="offline-title">App not running</div>
        <div class="offline-sub">Start the Nintendo Music RPC desktop app to enable Discord Rich Presence.</div>
      </div>
    `;
  }

  function renderState(state) {
    const { ok, rpcReady, rpcEnabled, currentTrack } = state;

    // Header sub
    $('header-sub').textContent = rpcReady
      ? 'Active'
      : rpcEnabled ? 'Waiting for Discord' : 'RPC disabled';

    // Status dot + text
    const dot = $('status-dot');
    const statusText = $('status-text');
    const statusSub = $('status-sub');

    if (rpcReady) {
      dot.className = 'status-dot connected';
      statusText.textContent = 'Connected to Discord';
      statusSub.textContent = rpcEnabled ? 'Rich Presence is active' : 'RPC is disabled';
    } else if (rpcEnabled) {
      dot.className = 'status-dot partial';
      statusText.textContent = 'Waiting for Discord';
      statusSub.textContent = 'Open Discord to enable Rich Presence';
    } else {
      dot.className = 'status-dot disconnected';
      statusText.textContent = 'RPC disabled';
      statusSub.textContent = 'Re-enable via the tray icon';
    }

    // Discord footer indicator
    $('discord-dot').className = rpcReady ? 'discord-dot ready' : 'discord-dot';
    $('discord-label').textContent = rpcReady ? 'Discord connected' : 'Discord offline';

    // Track section
    const main = $('main-content');
    let trackHTML = `
      <div class="status-card">
        <div class="status-dot ${rpcReady ? 'connected' : rpcEnabled ? 'partial' : 'disconnected'}" id="status-dot"></div>
        <div>
          <div class="status-text" id="status-text">${statusText.textContent}</div>
          <div class="status-sub" id="status-sub">${statusSub.textContent}</div>
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
        ? `<img class="track-thumb" src="${thumb}" alt="">`
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

    main.innerHTML = trackHTML;
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
