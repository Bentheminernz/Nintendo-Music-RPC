(() => {
  const BRIDGE_BASE = 'http://127.0.0.1:17891';
  const TRACK_URL = `${BRIDGE_BASE}/track`;
  const CONNECT_URL = `${BRIDGE_BASE}/connect`;
  const DISCONNECT_URL = `${BRIDGE_BASE}/disconnect`;
  const MUSIC_URL_PREFIX = 'https://music.nintendo.com/';

  let lastForwardedTrackName = null;

  // In-memory set of currently open Nintendo Music tab IDs. Used to decide when
  // the *first* tab opens (enable RPC) and the *last* tab closes (disconnect).
  const openMusicTabs = new Set();

  const log = (message, ...details) => console.log(`[Nintendo Music][background] ${message}`, ...details);
  const warn = (message, ...details) => console.warn(`[Nintendo Music][background] ${message}`, ...details);

  log('Background script started. Bridge target:', BRIDGE_BASE);

  const runtime = typeof browser !== 'undefined' ? browser.runtime : chrome.runtime;
  const tabs = typeof browser !== 'undefined' ? browser.tabs : chrome.tabs;

  // ── Bridge requests ────────────────────────────────────────────────────────

  async function postBridge(url, body) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body ?? {}),
      });
      log('Bridge response.', { url, status: response.status, ok: response.ok });
    } catch (error) {
      warn(`Could not reach bridge at ${url}.`, error);
    }
  }

  async function forwardTrack(track) {
    if (!track || typeof track.name !== 'string') {
      log('Ignoring invalid track payload.', track);
      return;
    }

    const isNewTrack = track.name !== lastForwardedTrackName;
    const hasPlaybackData = track.currentTime !== null && track.duration !== null;

    // Always forward if playback data changed, even if track name is the same.
    if (!isNewTrack && !hasPlaybackData) {
      log('Ignoring duplicate track with no playback data.', track.name);
      return;
    }

    lastForwardedTrackName = track.name;

    const payload = {
      playlist: {
        playlistId: typeof track.playlistId === 'string' ? track.playlistId : null,
      },
      game: {
        gameName: typeof track.gameName === 'string' ? track.gameName : null,
        gameId: typeof track.gameId === 'string' ? track.gameId : null,
        gameImage: typeof track.gameImage === 'string' ? track.gameImage : null,
        formalHardware: typeof track.formalHardware === 'string' ? track.formalHardware : null,
      },
      track: {
        trackName: track.name,
        trackId: typeof track.id === 'string' ? track.id : null,
        thumbnailURL: typeof track.thumbnailURL === 'string' ? track.thumbnailURL : null,
        rightNotation: typeof track.rightNotation === 'string' ? track.rightNotation : null,
      },
      currentTime: typeof track.currentTime === 'number' ? track.currentTime : null,
      duration: typeof track.duration === 'number' ? track.duration : null,
      paused: typeof track.paused === 'boolean' ? track.paused : null,
    };

    log('Forwarding track to bridge.', payload);
    await postBridge(TRACK_URL, payload);
  }

  // ── Tab presence tracking ────────────────────────────────────────────────────

  const isMusicUrl = (url) => typeof url === 'string' && url.startsWith(MUSIC_URL_PREFIX);

  // Records whether a given tab is (still) a Nintendo Music tab, and fires the
  // connect/disconnect signals on the first-open / last-close transitions.
  function setTabPresence(tabId, present) {
    const hadTabs = openMusicTabs.size > 0;

    if (present) openMusicTabs.add(tabId);
    else openMusicTabs.delete(tabId);

    const hasTabs = openMusicTabs.size > 0;

    if (!hadTabs && hasTabs) {
      log('First Nintendo Music tab opened — enabling Discord RPC.');
      postBridge(CONNECT_URL);
    } else if (hadTabs && !hasTabs) {
      log('Last Nintendo Music tab closed — disconnecting Discord RPC.');
      postBridge(DISCONNECT_URL);
    }
  }

  tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    // changeInfo.url is set on navigation; fall back to the tab's current url.
    const url = changeInfo.url ?? tab?.url;
    if (url === undefined) return;
    setTabPresence(tabId, isMusicUrl(url));
  });

  tabs.onRemoved.addListener((tabId) => setTabPresence(tabId, false));

  async function initTabTracking() {
    try {
      const found = await tabs.query({ url: `${MUSIC_URL_PREFIX}*` });
      for (const tab of found) {
        if (typeof tab.id === 'number') openMusicTabs.add(tab.id);
      }
      log('Initialised open Nintendo Music tabs.', openMusicTabs.size);
      if (openMusicTabs.size > 0) postBridge(CONNECT_URL);
    } catch (error) {
      warn('Failed to query existing tabs.', error);
    }
  }

  initTabTracking();

  // ── Message listener ─────────────────────────────────────────────────────────

  runtime.onMessage.addListener((message) => {
    log('Message received.', message);
    if (message?.type === 'track-update') {
      forwardTrack(message.track);
    }
  });
})();
