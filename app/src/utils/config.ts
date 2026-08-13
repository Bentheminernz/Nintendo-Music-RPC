import fs from 'node:fs';
import net from 'node:net';

/** The port that the bridge will listen on. */
export const PORT = 17891;

/** The client ID of the Discord application. */
export const CLIENT_ID = '1487315634667782184';

/** LAST_FM Stuff */
export const LAST_FM_API = '28b0e6d014f471ffcf01f976933c1bff';
export const LASTFM_BRIDGE_URL = 'https://bremen-lastfm-bridge.personal-6a9.workers.dev';

const DISCORD_IPC_SCAN_COUNT = 10;
const PIPE_PROBE_TIMEOUT_MS = 500;

/** Path to Discord's local IPC socket / named pipe. */
export async function getDiscordIpcPath(): Promise<string | null> {
  if (process.platform === 'win32') {
    for (let i = 0; i < DISCORD_IPC_SCAN_COUNT; i++) {
      const pipe = `\\\\.\\pipe\\discord-ipc-${i}`;
      if (await pipeExists(pipe)) return pipe;
    }
    return null;
  }

  const base = process.env.XDG_RUNTIME_DIR || process.env.TMPDIR || '/tmp';
  for (let i = 0; i < DISCORD_IPC_SCAN_COUNT; i++) {
    const path = `${base}/discord-ipc-${i}`;
    if (fs.existsSync(path)) return path;
  }
  return null;
}

/** Checks whether a Windows named pipe is accepting connections. */
function pipeExists(path: string): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.createConnection(path);
    socket.setTimeout(PIPE_PROBE_TIMEOUT_MS);
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.once('error', () => {
      socket.destroy();
      resolve(false);
    });
  });
}
