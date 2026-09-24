import { COLUMNS } from '../game/board';

/**
 * Version of the message format below. Bump it whenever a change would confuse
 * an opponent running the previous deployment, so both sides can tell the
 * players to reload instead of failing in odd ways.
 */
export const PROTOCOL_VERSION = 3;

/** First message each side sends after connecting. */
export type HelloMessage = { readonly type: 'hello'; readonly version: number };

/**
 * A move by the sender. `index` is the move's position in the game's history
 * (0 for the first move), so the receiver can spot duplicates and gaps.
 */
export type MoveMessage = {
  readonly type: 'move';
  readonly index: number;
  readonly column: number;
};

export type RematchRequestMessage = { readonly type: 'rematch-request' };
export type RematchAcceptMessage = { readonly type: 'rematch-accept' };

/**
 * Keep-alive, so a silent connection can be told apart from a lost one. Each
 * side sends it every few seconds from protocol version 3 on.
 */
export type PingMessage = { readonly type: 'ping' };

/**
 * Sent before closing the connection when the sender received something that
 * does not fit its game, so both players learn that the games differ.
 */
export type OutOfSyncMessage = { readonly type: 'out-of-sync' };

/** Everything the two players' browsers send each other. */
export type Message =
  | HelloMessage
  | MoveMessage
  | RematchRequestMessage
  | RematchAcceptMessage
  | PingMessage
  | OutOfSyncMessage;

export function helloMessage(): HelloMessage {
  return { type: 'hello', version: PROTOCOL_VERSION };
}

/**
 * Checks received, untrusted data field by field. Returns a new message holding
 * only the known fields, or `null` if the data is not a valid message.
 */
export function parseMessage(data: unknown): Message | null {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return null;
  const fields = data as Record<string, unknown>;
  switch (fields.type) {
    case 'hello':
      return isIntegerAtLeast(fields.version, 1)
        ? { type: 'hello', version: fields.version }
        : null;
    case 'move':
      return isIntegerAtLeast(fields.index, 0) &&
        isIntegerAtLeast(fields.column, 0) &&
        fields.column < COLUMNS
        ? { type: 'move', index: fields.index, column: fields.column }
        : null;
    case 'rematch-request':
    case 'rematch-accept':
    case 'ping':
    case 'out-of-sync':
      return { type: fields.type };
    default:
      return null;
  }
}

function isIntegerAtLeast(value: unknown, min: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min;
}
