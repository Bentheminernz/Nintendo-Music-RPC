(() => {
  const TRACK_LOG_KEY = 'znba_track_logs';
  const PLAY_QUEUE_KEY = 'znba_play_queue';
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
    const rawTrackLog = window.localStorage.getItem(TRACK_LOG_KEY);
    const rawPlayQueue = window.localStorage.getItem(PLAY_QUEUE_KEY);
    if (!rawTrackLog) {
      log(`No ${TRACK_LOG_KEY} entry in localStorage yet.`);
      return null;
    }

    let trackLogs;
    let playQueue = {};
    try {
      trackLogs = JSON.parse(rawTrackLog);
      if (rawPlayQueue) {
        playQueue = JSON.parse(rawPlayQueue);
      }
    } catch {
      warn('Failed to parse track log or play queue from localStorage.', { rawTrackLog, rawPlayQueue });
      return null;
    }

    const firstTrack = Array.isArray(trackLogs) ? trackLogs[0] : null;
    if (!firstTrack || typeof firstTrack.name !== 'string') {
      warn('No readable track name in storage.', firstTrack);
      return null;
    }

    const thumbnailURL =
      [firstTrack.thumbnailURL, firstTrack.game?.thumbnailURL, firstTrack.media?.thumbnailURL]
        .find(t => typeof t === 'string' && t.length > 0) ?? null;

    const gameName = typeof firstTrack.game?.name === 'string'
      ? firstTrack.game.name
      : firstTrack.playlist?.name ?? null;

    const gameId = firstTrack.game?.id ?? null;
    const gameImage = firstTrack.game?.thumbnailURL ?? null;

    const rightNotation = typeof firstTrack.rightNotation === 'string' ? firstTrack.rightNotation : null;
    const formalHardware = firstTrack.game?.formalHardware ?? null;

    const playlistId = playQueue.playlistId ?? null;

    return {
      name: firstTrack.name,
      id: typeof firstTrack.id === 'string' ? firstTrack.id : null,
      thumbnailURL,
      gameName,
      gameId,
      rightNotation,
      gameImage,
      formalHardware,
      playlistId,
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