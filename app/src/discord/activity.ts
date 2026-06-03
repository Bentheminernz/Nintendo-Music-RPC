import type { Track, DiscordActivity, DiscordActivityButton } from '../types';

const truncate = (text: string, max = 15): string =>
  text.length > max ? `${text.slice(0, max)}...` : text;

/** Builds a Discord Rich Presence activity object from a Track.
 * @param track The track to build the activity from.
 * @returns A DiscordActivity object representing the track.
 */
export function buildActivity(track: Track): DiscordActivity {
  const gameName = track.gameName || 'Nintendo Music';

  const activity: DiscordActivity = {
    details: track.name,
    state: track.paused ? `From ${gameName} · ⏸ Paused` : `From ${gameName}`,
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

  if (track.thumbnailURL) {
    activity.assets = {
      large_image: track.thumbnailURL,
      large_text: track.name,
    };
  }

  const buttons: DiscordActivityButton[] = [];

  if (track.id) {
    buttons.push({
      label: 'Play on Nintendo Music',
      url: `https://music.nintendo.com/shared/en-US/NZ/tracks/${track.id}/`,
    });
  }

  if (track.gameId && track.gameName) {
    buttons.push({
      label: `View ${truncate(track.gameName)} on Nintendo Music`,
      url: `https://music.nintendo.com/en-US/game/${track.gameId}/`,
    });
  }

  if (buttons.length > 0) {
    activity.buttons = buttons;
  }

  return activity;
}
