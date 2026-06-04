import { app } from 'electron';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';

export function setupAutoLaunch(): void {
  if (!app.isPackaged) return;

  if (process.platform === 'linux') {
    setupLinuxAutostart();
  } else {
    app.setLoginItemSettings({ openAtLogin: true });
  }
}

function setupLinuxAutostart(): void {
  const autostartDir = join(homedir(), '.config', 'autostart');
  mkdirSync(autostartDir, { recursive: true });
  writeFileSync(
    join(autostartDir, 'nintendo-music-rpc.desktop'),
    [
      '[Desktop Entry]',
      'Type=Application',
      'Name=Nintendo Music RPC',
      `Exec=${process.execPath}`,
      'X-GNOME-Autostart-enabled=true',
    ].join('\n'),
    'utf8',
  );
}
