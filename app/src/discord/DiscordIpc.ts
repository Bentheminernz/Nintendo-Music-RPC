import net from 'node:net';
import crypto from 'node:crypto';
import { OP, encodePacket, decodePacket } from './packet';
import { getDiscordIpcPath } from '../utils/config';
import { createLogger } from '../utils/logger';
import type { DiscordActivity } from '../types';

const { log, warn } = createLogger('discord');

const RECONNECT_DELAY_MS = 10_000;

/** Events emitted by the DiscordIpc class. */
export interface DiscordIpcEvents {
  /** Fired when Discord acknowledges the handshake and presence can be set. */
  onReady?: () => void;
  /** Fired when the connection drops (before a reconnect is scheduled). */
  onDisconnect?: () => void;
}

/** Manages the IPC connection to Discord for Rich Presence. */
// not going to lie, quite a bit of this is vibe coded tbh.
// I understand the Discord RPC JS SDK thing, but manually doing IPC
// is confusing and is needed for 'listening' presence so yay
export class DiscordIpc {
  ready = false;

  private readonly clientId: string;
  private readonly events: DiscordIpcEvents;
  private socket: net.Socket | null = null;
  private buffer = Buffer.alloc(0);
  private destroyed = false;

  constructor(clientId: string, events: DiscordIpcEvents = {}) {
    this.clientId = clientId;
    this.events = events;
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.destroyed) {
        resolve();
        return;
      }

      const ipcPath = getDiscordIpcPath();
      if (!ipcPath) {
        warn('No Discord IPC path found.');
        this.events.onDisconnect?.();
        setTimeout(() => this.connect().catch(() => {}), RECONNECT_DELAY_MS);
        resolve();
        return;
      }
      const socket = net.createConnection(ipcPath);
      this.socket = socket;
      this.buffer = Buffer.alloc(0);

      socket.once('connect', () => {
        log('Discord IPC socket connected, sending handshake.');
        socket.write(encodePacket(OP.HANDSHAKE, { v: 1, client_id: this.clientId }));
      });

      socket.on('data', (chunk: Buffer) => {
        this.buffer = Buffer.concat([this.buffer, chunk]);

        while (this.buffer.length >= 8) {
          const len = this.buffer.readUInt32LE(4);
          if (this.buffer.length < 8 + len) break;

          const packet = decodePacket(this.buffer);
          this.buffer = this.buffer.subarray(8 + len);

          log('Discord IPC packet received.', {
            op: packet.op,
            cmd: packet.data?.cmd,
            evt: packet.data?.evt,
          });

          if (packet.op === OP.FRAME && packet.data?.evt === 'READY') {
            this.ready = true;
            log('Discord IPC ready.');
            this.events.onReady?.();
            resolve();
          } else if (packet.op === OP.FRAME && packet.data?.cmd === 'SET_ACTIVITY') {
            // SET_ACTIVITY ACK — expected, nothing to do
          } else if (packet.op === OP.CLOSE) {
            log('Discord IPC close packet received.', packet.data);
          } else {
            warn('Unhandled Discord IPC packet.', packet);
          }
        }
      });

      socket.on('close', () => {
        if (this.destroyed) return;
        log(`Discord IPC socket closed. Retrying in ${RECONNECT_DELAY_MS / 1000}s.`);
        this.ready = false;
        this.events.onDisconnect?.();
        setTimeout(() => this.connect().catch(() => {}), RECONNECT_DELAY_MS);
      });

      socket.on('error', (err: Error) => {
        warn('Discord IPC socket error.', err.message);
        this.ready = false;
        this.events.onDisconnect?.();
        reject(err);
      });
    });
  }

  setActivity(activity: DiscordActivity): void {
    if (!this.socket || !this.ready) {
      warn('Cannot set activity — IPC not ready.');
      return;
    }

    log('Sending SET_ACTIVITY over IPC.', activity);
    this.socket.write(
      encodePacket(OP.FRAME, {
        cmd: 'SET_ACTIVITY',
        args: { pid: process.pid, activity },
        nonce: crypto.randomUUID(),
      }),
    );
  }

  clearActivity(): void {
    if (!this.socket || !this.ready) return;

    log('Clearing Discord activity.');
    this.socket.write(
      encodePacket(OP.FRAME, {
        cmd: 'SET_ACTIVITY',
        args: { pid: process.pid, activity: null },
        nonce: crypto.randomUUID(),
      }),
    );
  }

  destroy(): void {
    this.destroyed = true;
    this.ready = false;
    this.socket?.destroy();
    this.socket = null;
  }
}
