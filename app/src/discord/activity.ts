import { Track, DiscordActivity, DiscordActivityButton, RpcImageSource, SPLATOON_GAME_ID, SPLATOON_2_GAME_ID, SPLATOON_3_GAME_ID } from '../types';
import { createLogger } from '../utils/logger';

const { log } = createLogger('activity');

const truncate = (text: string, max = 15): string =>
  text.length > max ? `${text.slice(0, max)}...` : text;

export interface ActivityOptions {
  splatoonDetailedRpc: boolean;
  largeRpcImage: RpcImageSource;
  smallRpcImage: RpcImageSource;
}

function resolveImageUrl(source: RpcImageSource, track: Track): string | null {
  switch (source) {
    case RpcImageSource.Game: return track.game.gameImage;
    case RpcImageSource.Track: return track.track.thumbnailURL;
    case RpcImageSource.Playlist: return track.playlist?.playlistImageURL ?? track.track.thumbnailURL;
  }
}

export function buildActivity(track: Track, opts: ActivityOptions): DiscordActivity {
  const gameName = track.game.gameName || 'Nintendo Music';
  const notation = track.track.rightNotation ? track.track.rightNotation.replace('©', '').trim() : null;
  const isSplatoon = [SPLATOON_GAME_ID, SPLATOON_2_GAME_ID, SPLATOON_3_GAME_ID].includes(track.game.gameId || '');

  let details: string;
  let state: string;

  if (isSplatoon && opts.splatoonDetailedRpc) {
    const title = track.track.name.split('/')[0].trim();
    const artist = track.track.name.split('/')[1]?.trim() ?? '';
    details = title;
    state = `${artist} · ${gameName}`;
    log('Using Splatoon detailed format.', { details, state });
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

  const largeImageUrl = resolveImageUrl(opts.largeRpcImage, track);
  const smallImageUrl = resolveImageUrl(opts.smallRpcImage, track);

  const largeText =
    opts.largeRpcImage === RpcImageSource.Playlist ? (track.playlist?.playlistName ?? track.track.name)
    : opts.largeRpcImage === RpcImageSource.Track ? track.track.name
    : track.paused ? `${gameName} · ⏸ Paused` : gameName;

  const smallText =
    opts.smallRpcImage === RpcImageSource.Playlist ? (track.playlist?.playlistName ?? track.track.name)
    : opts.smallRpcImage === RpcImageSource.Track ? track.track.name
    : track.paused ? `${gameName} · ⏸ Paused` : gameName;

  if (largeImageUrl) {
    activity.assets = {
      large_image: largeImageUrl,
      large_text: largeText,
    };
    if (smallImageUrl && smallImageUrl !== largeImageUrl) {
      activity.assets.small_image = smallImageUrl;
      activity.assets.small_text = smallText;
    }
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
      label: `${truncate(track.game.gameName, 11)} on Nintendo Music`,
      url: Track.gameURL(track) || 'https://music.nintendo.com',
    });
  }

  if (buttons.length > 0) {
    activity.buttons = buttons;
  }

  return activity;
}
