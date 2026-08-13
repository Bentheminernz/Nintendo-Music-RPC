import express from 'express';
import http from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { HttpServer } from './HttpServer';
import { createLogger } from '../utils/logger';
import { Track } from '../types';

const log = createLogger('httpServer:server');

export const HTTP_SERVER_PORT = 17893;

/** Type for functions the server needs */
export interface ServerOptions {
    getCurrentTrack: () => Track | null;
    subscribe: (callback: (track: Track | null) => void) => () => void;
}

/** Factory function to create the server instance. */
export function createServer(options: ServerOptions) {
    return new Server(options);
}

/** Simple HttpServer implementation for serving the current track and a WebSocket for updates. */
class Server extends HttpServer {
    app: express.Express;
    private readonly getCurrentTrack: () => Track | null;
    private readonly httpServer: http.Server;
    private wss: WebSocketServer;

    constructor(options: ServerOptions) {
        super();
        this.getCurrentTrack = options.getCurrentTrack;

        const app = this.app = express();

        app.use('/api/health', this.createApiRequestHandler((req, res) =>
            this.healthCheck()));
        app.use('/api/current-track', this.createApiRequestHandler((req, res) =>
            this.getCurrentTrackHandler()));

        this.httpServer = http.createServer(app);
        this.wss = new WebSocketServer({ server: this.httpServer });
        this.wss.on('connection', (ws) => {
            log.log('WebSocket client connected.');
            ws.send(JSON.stringify(this.buildTrackMessage(this.getCurrentTrack())));
            ws.on('close', () => log.log('WebSocket client disconnected.'));
        });

        options.subscribe((track) => this.broadcast(track));
    }

    listen(port: number): void {
        this.httpServer.listen(port, () => {
            log.log('HTTP server listening on port %d', port);
        });
    }

    private buildTrackMessage(track: Track | null) {
        return {
            type: 'track',
            track: track ? {
                ...track,
                trackURL: Track.trackURL(track),
                gameURL: Track.gameURL(track),
            } : null,
        };
    }

    private broadcast(track: Track | null): void {
        const message = JSON.stringify(this.buildTrackMessage(track));
        for (const client of this.wss.clients) {
            if (client.readyState === WebSocket.OPEN) client.send(message);
        }
    }

    async healthCheck() {
        log.log('Health check received.');
        return { status: 'ok' };
    }

    async getCurrentTrackHandler() {
        const track = this.getCurrentTrack();
        if (!track) return { error: 'No track playing' };
        return { track: this.buildTrackMessage(track).track };
    }
}
