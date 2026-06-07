# Nintendo Music RPC

Show what you're listening to on [Nintendo Music](https://music.nintendo.com) in your Discord status via Rich Presence.

## How it works

Two components work together:

- **Browser extension** — reads the currently playing track from Nintendo Music and sends it to the desktop app.
- **Desktop app (Electron)** — receives track data from the extension over a local HTTP server and updates Discord Rich Presence.

## Setup

1. Download and run the **Nintendo Music RPC** desktop app from the [latest release](https://github.com/Bentheminernz/Nintendo-Music-RPC/releases/latest).
2. Install the browser extension
    - [Chrome](https://chromewebstore.google.com/detail/nintendo-music-discord-rp/boiekifeicdcjjjfeinllgcmnmmbgegf)
    - Firefox (coming soon)
3. Open Nintendo Music and start playing — your status will update automatically.

## Development

### Prerequisites

- Node.js
- Discord desktop app

### Build & run

```sh
npm install
npm start        # build + launch Electron app
npm run build    # TypeScript compile only
npm run dist     # package as distributable (DMG/NSIS/AppImage)
```

The extension lives in `extension/` and can be loaded unpacked from your browser's extension settings.