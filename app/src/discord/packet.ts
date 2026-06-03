/** Defines the structure of packets sent to/from Discord IPC */
export const OP = {
  HANDSHAKE: 0,
  FRAME: 1,
  CLOSE: 2,
} as const;

/** The structure of a decoded Discord IPC packet. */
export interface DecodedPacket {
  op: number;
  data: Record<string, unknown> | null;
}

/** Encodes a packet to be sent over Discord IPC. */
export function encodePacket(op: number, data: unknown): Buffer {
  const json = JSON.stringify(data);
  const buf = Buffer.alloc(8 + Buffer.byteLength(json));
  buf.writeUInt32LE(op, 0);
  buf.writeUInt32LE(Buffer.byteLength(json), 4);
  buf.write(json, 8, 'utf8');
  return buf;
}

/** Decodes a packet received from Discord IPC. */
export function decodePacket(buf: Buffer): DecodedPacket {
  const op = buf.readUInt32LE(0);
  const len = buf.readUInt32LE(4);
  const json = buf.subarray(8, 8 + len).toString('utf8');
  try {
    return { op, data: JSON.parse(json) as Record<string, unknown> };
  } catch {
    return { op, data: null };
  }
}
