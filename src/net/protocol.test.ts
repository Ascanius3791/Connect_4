import { describe, expect, it } from 'vitest';
import type { JsonValue } from './channel';
import { helloMessage, parseMessage, PROTOCOL_VERSION, type Message } from './protocol';

// Typed as JsonValue so the compiler checks that every message can be sent.
const validMessages: (Message & JsonValue)[] = [
  { type: 'hello', version: PROTOCOL_VERSION },
  { type: 'move', index: 0, column: 0 },
  { type: 'move', index: 41, column: 6 },
  { type: 'rematch-request' },
  { type: 'rematch-accept' },
  { type: 'ping' },
  { type: 'out-of-sync' },
];

describe('parseMessage', () => {
  it.each(validMessages)('accepts %j', (message) => {
    expect(parseMessage(message)).toEqual(message);
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['a string', 'ping'],
    ['a number', 3],
    ['an array', [{ type: 'ping' }]],
    ['an object without type', { column: 3 }],
    ['an unknown type', { type: 'resign' }],
    ['a non-string type', { type: 1 }],
    ['hello without version', { type: 'hello' }],
    ['hello with version 0', { type: 'hello', version: 0 }],
    ['hello with a string version', { type: 'hello', version: '1' }],
    ['move with column 7', { type: 'move', index: 0, column: 7 }],
    ['move with column -1', { type: 'move', index: 0, column: -1 }],
    ['move with column 2.5', { type: 'move', index: 0, column: 2.5 }],
    ['move with a string column', { type: 'move', index: 0, column: '3' }],
    ['move with index -1', { type: 'move', index: -1, column: 3 }],
    ['move with index 1.5', { type: 'move', index: 1.5, column: 3 }],
    ['move with index NaN', { type: 'move', index: NaN, column: 3 }],
    ['move without column', { type: 'move', index: 0 }],
    ['move without index', { type: 'move', column: 3 }],
  ])('rejects %s', (_label, data) => {
    expect(parseMessage(data)).toBeNull();
  });

  it('drops unknown extra fields', () => {
    expect(parseMessage({ type: 'move', index: 2, column: 4, extra: true })).toEqual({
      type: 'move',
      index: 2,
      column: 4,
    });
    expect(parseMessage({ type: 'ping', payload: 'x' })).toEqual({ type: 'ping' });
  });
});

describe('JSON round-trip', () => {
  it.each(validMessages)('keeps %j unchanged', (message) => {
    const received: unknown = JSON.parse(JSON.stringify(message));
    expect(received).toEqual(message);
    expect(parseMessage(received)).toEqual(message);
  });
});

describe('helloMessage', () => {
  it('carries the protocol version', () => {
    expect(helloMessage()).toEqual({ type: 'hello', version: PROTOCOL_VERSION });
    expect(parseMessage(helloMessage())).toEqual(helloMessage());
  });
});
