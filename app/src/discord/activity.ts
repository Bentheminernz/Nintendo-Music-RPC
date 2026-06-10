import { Track, DiscordActivity, DiscordActivityButton, SPLATOON_GAME_ID, SPLATOON_2_GAME_ID, SPLATOON_3_GAME_ID } from '../types';
import { createLogger } from '../utils/logger';

const { log } = createLogger('activity');

const truncate = (text: string, max = 15): string =>
  text.length > max ? `${text.slice(0, max)}...` : text;

export interface ActivityOptions {
  splatoonDetailedRpc: boolean;
}

export function buildActivity(track: Track, opts: ActivityOptions): DiscordActivity {
  const gameName = track.game.gameName || 'Nintendo Music';
  const notation = track.track.rightNotation ? track.track.rightNotation.replace('©', '').trim() : null;
  const isSplatoon = [SPLATOON_GAME_ID, SPLATOON_2_GAME_ID, SPLATOON_3_GAME_ID].includes(track.game.gameId || '');

  let details: string;
  let state: string;

  if (isSplatoon && opts.splatoonDetailedRpc) {
    const parts = track.track.name.split('/');
    if (parts.length >= 2) {
      const title = parts[0].trim();
      const artist = parts[1].trim();
      details = title;
      state = `${artist} · ${gameName}`;
      log('Using Splatoon detailed format.', { details, state });
    } else {
      details = track.track.name;
      state = notation ? `${notation} · ${gameName}` : `From ${gameName}`;
      log('Using Splatoon detailed format (no artist separator found, using standard).', { details, state });
    }
  } else {
    details = track.track.name;
    state = notation ? `${notation} · ${gameName}` : `From ${gameName}`;
    log('Using standard format.', { details, state, isSplatoon });
  }

  const activity: DiscordActivity = {
    name: `Nintendo Music - ${truncate(details)}`,
    details: details,
    state: state,
    type: 2,
    instance: false,
  };

  if (
    !track.paused &&
    typeof track.currentTime === 'number' &&
    typeof track.duration === 'number' &&
    !Number.isNaN(track.duration)
  ) {
    const now = Date.now();
    activity.timestamps = {
      start: Math.floor(now - track.currentTime * 1000),
      end: Math.floor(now + (track.duration - track.currentTime) * 1000),
    };
  }

  if (track.track.thumbnailURL) {
    activity.assets = {
      large_image: track.track.thumbnailURL,
      large_text: track.paused ? `${gameName} · ⏸ Paused` : `${gameName}`,
    };
  }

  if (track.game.gameImage) {
    activity.assets = {
      large_image: activity.assets?.large_image || '',
      large_text: activity.assets?.large_text || '',
      small_image: track.game.gameImage,
      small_text: gameName,
    };
  }

  const buttons: DiscordActivityButton[] = [];

  if (track.track.id) {
    buttons.push({
      label: 'Listen on Nintendo Music',
      url: Track.trackURL(track) || 'https://music.nintendo.com',
    });
  }

  if (track.game.gameId && track.game.gameName) {
    buttons.push({
      label: 'Open Game Page',
      url: Track.gameURL(track) || 'https://music.nintendo.com',
    });
  }

  if (buttons.length > 0) {
    activity.buttons = buttons;
  }

  return activity;
}
