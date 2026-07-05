import { app } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { createLogger } from './logger';
import { ListeningStatusTag, RpcImageSource, StatusLabelPlacement } from '../types';

const { log, warn } = createLogger('preferences');

export interface Preferences {
  splatoonDetailedRpc: boolean;
  largeRpcImage: RpcImageSource;
  smallRpcImage: RpcImageSource;
  listeningStatusTag: ListeningStatusTag;
  statusLabelPlacement: StatusLabelPlacement;
}

const DEFAULTS: Preferences = {
  splatoonDetailedRpc: true,
  largeRpcImage: RpcImageSource.Track,
  smallRpcImage: RpcImageSource.Game,
  listeningStatusTag: ListeningStatusTag.Track,
  statusLabelPlacement: StatusLabelPlacement.Left,
};

export class PreferencesStore {
  private readonly filePath: string;
  private data: Preferences;
  private readonly listeners = new Set<(prefs: Preferences) => void>();

  constructor() {
    this.filePath = path.join(app.getPath('userData'), 'preferences.json');
    log('Preferences file path.', this.filePath);
    this.data = this.load();
  }

  private load(): Preferences {
    try {
      const raw = fs.readFileSync(this.filePath, 'utf8');
      const loaded = { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Preferences>) };
      log('Loaded preferences from disk.', loaded);
      return loaded;
    } catch (err) {
      const isNotFound = (err as NodeJS.ErrnoException).code === 'ENOENT';
      if (isNotFound) {
        log('No preferences file found, using defaults.', DEFAULTS);
      } else {
        warn('Failed to load preferences, using defaults.', err);
      }
      return { ...DEFAULTS };
    }
  }

  private save(): void {
    try {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
      fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), 'utf8');
      log('Saved preferences to disk.', this.data);
    } catch (err) {
      warn('Failed to save preferences.', err);
    }
  }

  getAll(): Preferences {
    return { ...this.data };
  }

  get<K extends keyof Preferences>(key: K): Preferences[K] {
    return this.data[key];
  }

  set<K extends keyof Preferences>(key: K, value: Preferences[K]): void {
    log(`Setting preference.`, { key, value });
    this.data[key] = value;
    this.save();
    const snapshot = this.getAll();
    for (const cb of this.listeners) cb(snapshot);
  }

  onChange(cb: (prefs: Preferences) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }
}
