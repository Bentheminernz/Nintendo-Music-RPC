// The local HTTP bridge the browser extension talks to. It exposes track
// updates plus connect/disconnect signals driven by tab presence.

import http from 'node:http';
import { createLogger } from './utils/logger';
import type { BridgeState, TrackPayload } from './types';

const { log, warn } = createLogger('bridge');

export interface BridgeHandlers {
  onTrack: (payload: TrackPayload) => void;
  onConnect: () => void;
  onDisconnect: () => void;
  getState: () => BridgeState;
}

function readJsonBody(req: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

export function createBridgeServer(port: number, handlers: BridgeHandlers): http.Server {
  log('Creating bridge HTTP server.');

  const server = http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    if (req.method === 'GET' && req.url === '/health') {
      sendJson(res, 200, handlers.getState());
      return;
    }

    if (req.method === 'POST' && req.url === '/connect') {
      log('Received /connect signal.');
      handlers.onConnect();
      sendJson(res, 200, { ok: true });
      return;
    }

    if (req.method === 'POST' && req.url === '/disconnect') {
      log('Received /disconnect signal.');
      handlers.onDisconnect();
      sendJson(res, 200, { ok: true });
      return;
    }

    if (req.method === 'POST' && req.url === '/track') {
      try {
        const body = (await readJsonBody(req)) as TrackPayload;
        log('Track payload received via HTTP bridge.', body);
        handlers.onTrack(body);
        sendJson(res, 200, { ok: true });
      } catch (error) {
        warn('Invalid track payload.', error);
        sendJson(res, 400, { ok: false, error: 'Invalid payload' });
      }
      return;
    }

    sendJson(res, 404, { error: 'Not found' });
  });

  server.listen(port, '127.0.0.1', () => {
    log(`Bridge listening on http://127.0.0.1:${port}`);
  });

  return server;
}
