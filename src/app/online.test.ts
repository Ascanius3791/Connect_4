import { describe, expect, it, vi } from 'vitest';
import { createChannelPair, type Channel, type JsonValue } from '../net/channel';
import { PROTOCOL_VERSION } from '../net/protocol';
import {
  buildJoinLink,
  handshake,
  hostOnlineGame,
  joinOnlineGame,
  parseJoinId,
  type Connector,
  type OnlineStatus,
} from './online';

const PAGES_URL = 'https://ascanius3791.github.io/Connect_4/';

/** Waits until all queued deliveries have happened. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('buildJoinLink', () => {
  it('appends the ID as a fragment to the Pages base path', () => {
    expect(buildJoinLink(PAGES_URL, 'abc-123')).toBe(
      'https://ascanius3791.github.io/Connect_4/#join=abc-123',
    );
  });

  it('replaces an existing fragment', () => {
    expect(buildJoinLink(`${PAGES_URL}#join=old`, 'new')).toBe(`${PAGES_URL}#join=new`);
    expect(buildJoinLink(`${PAGES_URL}#other`, 'new')).toBe(`${PAGES_URL}#join=new`);
  });

  it('works on the development server', () => {
    expect(buildJoinLink('http://localhost:5173/Connect_4/', 'abc')).toBe(
      'http://localhost:5173/Connect_4/#join=abc',
    );
  });

  it('encodes characters that would break the fragment', () => {
    const link = buildJoinLink(PAGES_URL, 'a b#c');
    expect(parseJoinId(new URL(link).hash)).toBe('a b#c');
  });
});

describe('parseJoinId', () => {
  it('reads the ID from a join link', () => {
    expect(parseJoinId(new URL(`${PAGES_URL}#join=abc-123`).hash)).toBe('abc-123');
    expect(parseJoinId(new URL(buildJoinLink(PAGES_URL, 'xyz')).hash)).toBe('xyz');
  });

  it('returns undefined without a join fragment', () => {
    expect(parseJoinId(new URL(PAGES_URL).hash)).toBeUndefined();
    expect(parseJoinId('')).toBeUndefined();
    expect(parseJoinId('#')).toBeUndefined();
    expect(parseJoinId('#other=abc')).toBeUndefined();
    expect(parseJoinId('#join=')).toBeUndefined();
  });

  it('returns undefined for a malformed encoding', () => {
    expect(parseJoinId('#join=%E0%A4%A')).toBeUndefined();
  });
});

describe('handshake', () => {
  it('connects when both sides use the same version', async () => {
    const [a, b] = createChannelPair();
    await expect(Promise.all([handshake(a), handshake(b)])).resolves.toEqual([
      'connected',
      'connected',
    ]);
  });

  it('reports a version mismatch on both sides', async () => {
    const [a, b] = createChannelPair();
    await expect(Promise.all([handshake(a), handshake(b, PROTOCOL_VERSION + 1)])).resolves.toEqual([
      'version-mismatch',
      'version-mismatch',
    ]);
  });

  it('sends its hello first and ignores other messages until the hello', async () => {
    const [a, b] = createChannelPair();
    const received: JsonValue[] = [];
    b.onMessage((message) => received.push(message));
    const result = vi.fn();
    void handshake(a).then(result);
    b.send({ type: 'ping' });
    b.send('garbage');
    await settle();
    expect(received).toEqual([{ type: 'hello', version: PROTOCOL_VERSION }]);
    expect(result).not.toHaveBeenCalled();
    b.send({ type: 'hello', version: PROTOCOL_VERSION });
    await settle();
    expect(result).toHaveBeenCalledWith('connected');
  });
});

/** A connector over in-memory channels, where the test decides when things happen. */
function fakeConnector() {
  let onGuest: ((channel: Channel) => void) | undefined;
  let register: ((id: string) => void) | undefined;
  let failHost: ((error: Error) => void) | undefined;
  const cancel = vi.fn();
  const joined: string[] = [];
  let finishJoin: ((channel: Channel) => void) | undefined;
  let failJoin: ((error: Error) => void) | undefined;

  const connector: Connector = {
    host(handler) {
      onGuest = handler;
      return new Promise((resolve, reject) => {
        register = (id) => resolve({ id, cancel });
        failHost = reject;
      });
    },
    join(id) {
      joined.push(id);
      return new Promise((resolve, reject) => {
        finishJoin = resolve;
        failJoin = reject;
      });
    },
  };

  return {
    connector,
    cancel,
    joined,
    register: (id: string) => register?.(id),
    failHost: (error: Error) => failHost?.(error),
    /** Opens a channel pair and hands one end to the host and the other to the guest. */
    connect(): [Channel, Channel] {
      const [hostEnd, guestEnd] = createChannelPair();
      onGuest?.(hostEnd);
      finishJoin?.(guestEnd);
      return [hostEnd, guestEnd];
    },
    failJoin: (error: Error) => failJoin?.(error),
  };
}

function recorder() {
  const statuses: OnlineStatus[] = [];
  return { statuses, onStatus: (status: OnlineStatus) => void statuses.push(status) };
}

describe('hostOnlineGame and joinOnlineGame', () => {
  it('shows the link, then connects both sides', async () => {
    const fake = fakeConnector();
    const host = recorder();
    const guest = recorder();

    hostOnlineGame(PAGES_URL, host.onStatus, fake.connector);
    expect(host.statuses).toEqual([{ kind: 'creating' }]);
    fake.register('abc');
    await settle();
    expect(host.statuses.at(-1)).toEqual({ kind: 'waiting', link: `${PAGES_URL}#join=abc` });

    joinOnlineGame('abc', guest.onStatus, fake.connector);
    expect(fake.joined).toEqual(['abc']);
    expect(guest.statuses).toEqual([{ kind: 'connecting' }]);

    fake.connect();
    await settle();
    expect(host.statuses.at(-1)).toEqual({ kind: 'connected' });
    expect(guest.statuses).toEqual([{ kind: 'connecting' }, { kind: 'connected' }]);
  });

  it('reports a version mismatch on both sides', async () => {
    const fake = fakeConnector();
    const host = recorder();
    hostOnlineGame(PAGES_URL, host.onStatus, fake.connector);
    fake.register('abc');
    await settle();

    // The guest runs a newer deployment.
    const [, guestEnd] = fake.connect();
    const guestResult = handshake(guestEnd, PROTOCOL_VERSION + 1);
    await settle();
    expect(host.statuses.at(-1)).toEqual({ kind: 'version-mismatch' });
    await expect(guestResult).resolves.toBe('version-mismatch');
  });

  it('reports when hosting or joining fails', async () => {
    const fake = fakeConnector();
    const host = recorder();
    const guest = recorder();
    hostOnlineGame(PAGES_URL, host.onStatus, fake.connector);
    joinOnlineGame('abc', guest.onStatus, fake.connector);
    fake.failHost(new Error('No broker'));
    fake.failJoin(new Error('No game found'));
    await settle();
    expect(host.statuses.at(-1)).toEqual({ kind: 'failed', message: 'No broker' });
    expect(guest.statuses.at(-1)).toEqual({ kind: 'failed', message: 'No game found' });
  });

  it('stops waiting for a guest when closed', async () => {
    const fake = fakeConnector();
    const host = recorder();
    const session = hostOnlineGame(PAGES_URL, host.onStatus, fake.connector);
    fake.register('abc');
    await settle();
    session.close();
    expect(fake.cancel).toHaveBeenCalledOnce();

    const [hostEnd] = fake.connect();
    await settle();
    expect(hostEnd.isOpen).toBe(false);
    expect(host.statuses.map((s) => s.kind)).toEqual(['creating', 'waiting']);
  });

  it('cancels hosting that finishes after closing', async () => {
    const fake = fakeConnector();
    const host = recorder();
    hostOnlineGame(PAGES_URL, host.onStatus, fake.connector).close();
    fake.register('abc');
    await settle();
    expect(fake.cancel).toHaveBeenCalledOnce();
    expect(host.statuses).toEqual([{ kind: 'creating' }]);
  });

  it('closes the connection on both sides when either closes', async () => {
    const fake = fakeConnector();
    const host = recorder();
    const guest = recorder();
    const hostSession = hostOnlineGame(PAGES_URL, host.onStatus, fake.connector);
    fake.register('abc');
    await settle();
    joinOnlineGame('abc', guest.onStatus, fake.connector);
    const [hostEnd, guestEnd] = fake.connect();
    await settle();

    hostSession.close();
    await settle();
    expect(hostEnd.isOpen).toBe(false);
    expect(guestEnd.isOpen).toBe(false);
  });

  it('closes a channel that opens after the guest closed', async () => {
    const fake = fakeConnector();
    const guest = recorder();
    joinOnlineGame('abc', guest.onStatus, fake.connector).close();
    const [, guestEnd] = fake.connect();
    await settle();
    expect(guestEnd.isOpen).toBe(false);
    expect(guest.statuses).toEqual([{ kind: 'connecting' }]);
  });
});
