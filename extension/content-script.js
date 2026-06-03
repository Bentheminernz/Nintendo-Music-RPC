(() => {
  const STORAGE_KEY = 'znba_track_logs';
  const POLL_INTERVAL_MS = 3000;

  let lastSentTrackName = null;
  let audio = null;

  const log = (message, ...details) => console.log(`[Nintendo Music][content] ${message}`, ...details);
  const warn = (message, ...details) => console.warn(`[Nintendo Music][content] ${message}`, ...details);

  log('Content script loaded for', window.location.href);

  // ── Audio element ────────────────────────────────────────────────────────────

  function hookAudio(el) {
    if (!el || el === audio) return;
    audio = el;
    log('Hooked audio element.');
  }

  const observer = new MutationObserver(() => {
    const el = document.querySelector('audio');
    if (el && el !== audio) hookAudio(el);
  });

  observer.observe(document.body, { childList: true, subtree: true });
  hookAudio(document.querySelector('audio'));

  // ── localStorage ─────────────────────────────────────────────────────────────

  function readCurrentTrack() {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      log(`No ${STORAGE_KEY} entry in localStorage yet.`);
      return null;
    }

    let trackLogs;
    try {
      trackLogs = JSON.parse(raw);
    } catch {
      warn(`Failed to parse ${STORAGE_KEY}.`);
      return null;
    }

    const first = Array.isArray(trackLogs) ? trackLogs[0] : null;
    if (!first || typeof first.name !== 'string') {
      warn('No readable track name in storage.', first);
      return null;
    }

    const thumbnailURL =
      [first.thumbnailURL, first.game?.thumbnailURL, first.media?.thumbnailURL]
        .find(t => typeof t === 'string' && t.length > 0) ?? null;

    const gameName = typeof first.game?.name === 'string'
      ? first.game.name
      : first.playlist?.name ?? null;

    const gameId = first.game?.id ?? null;

    return {
      name: first.name,
      id: typeof first.id === 'string' ? first.id : null,
      thumbnailURL,
      gameName,
      gameId,
    };
  }

  // ── Messaging ────────────────────────────────────────────────────────────────

  async function sendToBackground(payload) {
    const runtime = typeof browser !== 'undefined' ? browser.runtime : chrome.runtime;
    if (!runtime?.sendMessage) {
      warn('Extension runtime messaging is not available.');
      return;
    }
    try {
      await runtime.sendMessage(payload);
      log('Sent payload to background.', payload?.track?.name);
    } catch (error) {
      warn('Failed to send to background.', error);
    }
  }

  // ── Poll ─────────────────────────────────────────────────────────────────────

  async function poll() {
    const track = readCurrentTrack();
    if (!track) return;

    const isNewTrack = track.name !== lastSentTrackName;
    if (isNewTrack) {
      lastSentTrackName = track.name;
      log('New track detected.', track.name);
    }

    await sendToBackground({
      type: 'track-update',
      track: {
        ...track,
        currentTime: audio?.currentTime ?? null,
        duration: audio?.duration ?? null,
        paused: audio?.paused ?? null,
      },
    });
  }

  log(`Starting polling every ${POLL_INTERVAL_MS}ms.`);
  poll();
  setInterval(poll, POLL_INTERVAL_MS);
})();