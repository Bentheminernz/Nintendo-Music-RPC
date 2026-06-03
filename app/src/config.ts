import path from 'node:path';
import { app } from 'electron';
import dotenv from 'dotenv';

// when packaged, the env is in some a different path so load based on dev or 'prod'
const envPath = app.isPackaged
  ? path.join(process.resourcesPath, '.env')
  : path.resolve('.env');

dotenv.config({ path: envPath });

/** The port that the bridge will listen on. */
export const PORT = Number(process.env.BRIDGE_PORT || 17891);

/** The client ID of the Discord application. */
export const CLIENT_ID = process.env.DISCORD_CLIENT_ID;

/** Path to Discord's local IPC socket / named pipe. */
export function getDiscordIpcPath(): string {
  if (process.platform === 'win32') return '\\\\.\\pipe\\discord-ipc-0';
  const base = process.env.XDG_RUNTIME_DIR || process.env.TMPDIR || '/tmp';
  return `${base}/discord-ipc-0`;
}
