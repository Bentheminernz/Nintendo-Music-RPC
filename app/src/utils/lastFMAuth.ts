import { app, shell } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { createLogger } from './logger';
import { LAST_FM_API, LAST_FM_SECRET } from './config';
import type { Track } from '../types';
import { SPLATOON_GAME_ID, SPLATOON_2_GAME_ID, SPLATOON_3_GAME_ID, SPLATOON_RAIDERS_SPECIAL_RELEASE_ID } from '../types';

const { log, warn } = createLogger('lastfm-auth');

const BASE_URL = 'https://ws.audioscrobbler.com/2.0/';

function apiKey(): string {
  return LAST_FM_API;
}

function apiSecret(): string {
  return LAST_FM_SECRET;
}

export interface LastfmAuth {
  username: string | null;
  sessionKey: string | null;
}

const DEFAULTS: LastfmAuth = {
  username: null,
  sessionKey: null,
};

export class LastfmAuthStore {
  readonly filePath: string;
  data: LastfmAuth;
  readonly listeners = new Set<(auth: LastfmAuth) => void>();

  constructor() {
    this.filePath = path.join(app.getPath('userData'), 'lastfm-auth.json');
    log('Last.fm auth file path.', this.filePath);
    this.data = this.load();
  }

  load(): LastfmAuth {
    try {
      const raw = fs.readFileSync(this.filePath, 'utf8');
      const parsed = JSON.parse(raw) as { username: string | null; sessionKey: string | null };
      log('Loaded Last.fm auth from disk.', { username: parsed.username });
      return { username: parsed.username, sessionKey: parsed.sessionKey };
    } catch (err) {
      const isNotFound = (err as NodeJS.ErrnoException).code === 'ENOENT';
      if (isNotFound) {
        log('No Last.fm auth file found, using defaults.');
      } else {
        warn('Failed to load Last.fm auth, using defaults.', err);
      }
      return { ...DEFAULTS };
    }
  }

  save(): void {
    try {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
      fs.writeFileSync(
        this.filePath,
        JSON.stringify({ username: this.data.username, sessionKey: this.data.sessionKey }, null, 2),
        'utf8',
      );
      log('Saved Last.fm auth to disk.', { username: this.data.username });
    } catch (err) {
      warn('Failed to save Last.fm auth.', err);
    }
  }

  getAll(): LastfmAuth {
    return { ...this.data };
  }

  isConnected(): boolean {
    return this.data.sessionKey !== null;
  }

  setSession(username: string, sessionKey: string): void {
    log('Setting Last.fm session.', { username });
    this.data = { username, sessionKey };
    this.save();
    const snapshot = this.getAll();
    for (const cb of this.listeners) cb(snapshot);
  }

  clear(): void {
    log('Clearing Last.fm session.');
    this.data = { ...DEFAULTS };
    this.save();
    const snapshot = this.getAll();
    for (const cb of this.listeners) cb(snapshot);
  }

  onChange(cb: (auth: LastfmAuth) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }
}

function sign(params: Record<string, string>): string {
  const sorted = Object.keys(params)
    .sort()
    .map((key) => key + params[key])
    .join('');

  return crypto.createHash('md5').update(sorted + apiSecret()).digest('hex'); // nosemgrep: Last.fm API requires MD5 signing per spec
}

async function apiCall(params: Record<string, string>): Promise<any> {
  const api_sig = sign(params);
  const body = new URLSearchParams({ ...params, api_sig, format: 'json' });
  const res = await fetch(BASE_URL, { method: 'POST', body });
  const data = await res.json();
  if (data.error) {
    throw new Error(`Last.fm API error: ${data.message}`);
  }
  return data;
}

export async function getToken(): Promise<string> {
  const data = await apiCall({ method: 'auth.getToken', api_key: apiKey() });
  return data.token;
}

export function openAuthURL(token: string): void {
  const url = `https://www.last.fm/api/auth/?api_key=${apiKey()}&token=${token}`;
  shell.openExternal(url);
}

export async function getSession(token: string): Promise<{ username: string; sessionKey: string }> {
  const data = await apiCall({ method: 'auth.getSession', api_key: apiKey(), token });
  return { username: data.session.name, sessionKey: data.session.key };
}

function isSplatoon(track: Track): boolean {
  if (track.game.gameId) {
    return [SPLATOON_GAME_ID, SPLATOON_2_GAME_ID, SPLATOON_3_GAME_ID].includes(track.game.gameId);
  }
  if (track.game.gameName) {
    return track.game.gameName.toLowerCase().includes('splatoon');
  }
  if (track.playlist?.playlistId) {
    return track.playlist.playlistId.includes(SPLATOON_RAIDERS_SPECIAL_RELEASE_ID);
  }
  return false;
}

function scrobbleTitle(track: Track): string {
  if (isSplatoon(track)) {
    const parts = track.track.name.split('/');
    if (parts.length >= 2) return parts[0].trim();
  }
  return track.track.name;
}

function scrobbleArtist(track: Track): string {
  if (isSplatoon(track)) {
    const parts = track.track.name.split('/');
    if (parts.length >= 2) return parts[1].trim();
  }
  return 'Nintendo Co., Ltd';
}

function scrobbleAlbum(track: Track): string {
  if (track.game.gameName?.toLowerCase().includes('splatoon raiders')) {
    return 'Splatoon Raiders';
  }

  return track.game.gameName ?? 'Nintendo Music';
}

async function scrobbleApiCall(
  method: string,
  track: Track,
  sessionKey: string,
  timestamp?: number,
): Promise<void> {
  const params: Record<string, string> = {
    method,
    api_key: apiKey(),
    sk: sessionKey,
    track: scrobbleTitle(track),
    artist: scrobbleArtist(track),
    album: scrobbleAlbum(track),
  };
  if (track.duration) params.duration = String(Math.round(track.duration));
  if (timestamp) params.timestamp = String(timestamp);
  await apiCall(params);
}

export async function updateNowPlaying(track: Track, sessionKey: string): Promise<void> {
  log('Updating Now Playing on Last.fm.', { track: track.track.name });
  if (track.paused) {
    log('Skipping Now Playing update because track is paused.', { track: track.track.name });
    return;
  }
  await scrobbleApiCall('track.updateNowPlaying', track, sessionKey);
}

export async function scrobbleTrack(track: Track, sessionKey: string, timestamp: number): Promise<void> {
  log('Scrobbling track to Last.fm.', { track: track.track.name, timestamp });
  await scrobbleApiCall('track.scrobble', track, sessionKey, timestamp);
}

export function shouldScrobble(track: Track): boolean {
  if (typeof track.currentTime !== 'number' || typeof track.duration !== 'number') return false;
  if (track.duration <= 0 || track.currentTime <= 0) return false;
  const ratio = track.currentTime / track.duration;
  return ratio >= 0.5 || track.currentTime >= 240;
}

export function isInvalidSessionError(err: unknown): boolean {
  return (err as Error)?.message?.includes('Invalid session key');
}