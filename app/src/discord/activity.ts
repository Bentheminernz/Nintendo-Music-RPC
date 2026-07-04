import { Track, DiscordActivity, DiscordActivityButton, RpcImageSource, SPLATOON_GAME_ID, SPLATOON_2_GAME_ID, SPLATOON_3_GAME_ID, ListeningStatusTag } from '../types';
import { createLogger } from '../utils/logger';

const { log } = createLogger('activity');

const truncate = (text: string, max = 15): string =>
  text.length > max ? `${text.slice(0, max)}...` : text;

export interface ActivityOptions {
  splatoonDetailedRpc: boolean;
  largeRpcImage: RpcImageSource;
  smallRpcImage: RpcImageSource;
  listeningStatusTag: ListeningStatusTag;
}

function resolveImageUrl(source: RpcImageSource, track: Track): string | null {
  switch (source) {
    case RpcImageSource.Game: return track.game.gameImage;
    case RpcImageSource.Track: return track.track.thumbnailURL;
    case RpcImageSource.Playlist: return track.playlist?.playlistImageURL ?? track.track.thumbnailURL;
    default: return null;
  }
}

function resolveListeningStatusTag(source: ListeningStatusTag, track: Track): string | null {
  switch (source) {
    case ListeningStatusTag.Game: return track.game.gameName;
    case ListeningStatusTag.Track: return track.track.name;
    case ListeningStatusTag.Playlist: return track.playlist?.playlistName ?? track.track.name;
    default: return null;
  }
}

export function buildActivity(track: Track, opts: ActivityOptions): DiscordActivity {
  const gameName = track.game.gameName || 'Nintendo Music';
  const notation = track.track.rightNotation ? track.track.rightNotation.replace('©', '').trim() : null;
  const isSplatoon = [SPLATOON_GAME_ID, SPLATOON_2_GAME_ID, SPLATOON_3_GAME_ID].includes(track.game.gameId || '');

  let details: string;
  let state: string;
  let statusTagLabel: string;

  if (isSplatoon && opts.splatoonDetailedRpc) {
    const parts = track.track.name.split('/');
    if (parts.length >= 2) {
      const title = parts[0].trim();
      const artist = parts[1].trim();
      details = title;
      state = `${artist} · ${gameName}`;
      statusTagLabel = opts.listeningStatusTag === ListeningStatusTag.Track
        ? title
        : resolveListeningStatusTag(opts.listeningStatusTag, track) ?? title;
      log('Using Splatoon detailed format.', { details, state });
    } else {
      details = track.track.name;
      state = notation ? `${notation} · ${gameName}` : `From ${gameName}`;
      statusTagLabel = resolveListeningStatusTag(opts.listeningStatusTag, track) ?? details;
      log('Using Splatoon detailed format (no artist separator found, using standard).', { details, state });
    }
  } else {
    details = track.track.name;
    state = notation ? `${notation} · ${gameName}` : `From ${gameName}`;
    statusTagLabel = resolveListeningStatusTag(opts.listeningStatusTag, track) ?? details;
    log('Using standard format.', { details, state, isSplatoon });
  }

  const activity: DiscordActivity = {
    name: `Nintendo Music - ${truncate(statusTagLabel)}`,
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
      label: 'Open Game Page',
      url: Track.gameURL(track) || 'https://music.nintendo.com',
    });
  }

  if (buttons.length > 0) {
    activity.buttons = buttons;
  }

  return activity;
}
