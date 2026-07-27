/** The port that the bridge will listen on. */
export const PORT = 17891;

/** The client ID of the Discord application. */
export const CLIENT_ID = '1487315634667782184';

/** Last.fm API credentials. */
export const LAST_FM_API = '42cddcdec00b1f3cfdf2eecb172483a9';
export const LAST_FM_SECRET = 'f4b2addf207455c6adcfba4743f82adb';

/** Path to Discord's local IPC socket / named pipe. */
export function getDiscordIpcPath(): string | null {
  if (process.platform === 'win32') {
    return '\\\\.\\pipe\\discord-ipc-0';
  }
  const base = process.env.XDG_RUNTIME_DIR || process.env.TMPDIR || '/tmp';
  for (let i = 0; i < 10; i++) {
    const path = `${base}/discord-ipc-${i}`;
    if (require('fs').existsSync(path)) return path;
  }
  return null;
}