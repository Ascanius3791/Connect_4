import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { hostConnection, joinConnection, RECONNECT_DELAYS_MS } from './connection';

// `vi.mock` runs before the imports, so the fake is defined in `vi.hoisted`.
const { FakePeer } = vi.hoisted(() => {
  type Listener = (...args: unknown[]) => void;

  /** Stands in for PeerJS's `Peer`: tests emit its events and watch its calls. */
  class FakePeer {
    static created: FakePeer[] = [];
    disconnected = false;
    destroyed = false;
    readonly reconnect = vi.fn(() => {
      this.disconnected = false;
    });
    readonly #listeners = new Map<string, Listener[]>();

    constructor() {
      FakePeer.created.push(this);
    }

    on(event: string, listener: Listener): void {
      this.#listeners.set(event, [...(this.#listeners.get(event) ?? []), listener]);
    }

    emit(event: string, ...args: unknown[]): void {
      for (const listener of this.#listeners.get(event) ?? []) listener(...args);
    }

    disconnect(): void {
      if (this.disconnected) return;
      this.disconnected = true;
      this.emit('disconnected');
    }

    destroy(): void {
      if (this.destroyed) return;
      this.disconnect();
      this.destroyed = true;
    }

    /** What PeerJS does when it loses the broker after registering. */
    loseBroker(): void {
      this.emit('error', { type: 'network', message: 'Lost connection to server.' });
      this.disconnect();
    }
  }

  return { FakePeer };
});

vi.mock('peerjs', () => ({ Peer: FakePeer }));

beforeEach(() => {
  vi.useFakeTimers();
  FakePeer.created = [];
});

afterEach(() => {
  vi.useRealTimers();
});

function lastPeer(): InstanceType<typeof FakePeer> {
  const peer = FakePeer.created.at(-1);
  if (!peer) throw new Error('No peer created');
  return peer;
}

/** Hosts a game and registers it under `id`. */
async function host(id = 'abc') {
  const onLost = vi.fn();
  const controller = new AbortController();
  const hosted = hostConnection(() => undefined, onLost, controller.signal);
  const peer = lastPeer();
  peer.emit('open', id);
  await expect(hosted).resolves.toBe(id);
  return { peer, onLost, controller };
}

describe('hostConnection', () => {
  it('rejects if registering fails', async () => {
    const hosted = hostConnection(() => undefined, vi.fn(), new AbortController().signal);
    const peer = lastPeer();
    peer.emit('error', { type: 'server-error', message: 'No broker' });
    await expect(hosted).rejects.toThrow('Could not start an online game: No broker');
    expect(peer.destroyed).toBe(true);
  });

  it('reconnects under the same ID after losing the broker', async () => {
    const { peer, onLost } = await host();
    peer.loseBroker();
    vi.advanceTimersByTime(RECONNECT_DELAYS_MS[0]! - 1);
    expect(peer.reconnect).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(peer.reconnect).toHaveBeenCalledOnce();
    expect(onLost).not.toHaveBeenCalled();
    expect(peer.destroyed).toBe(false);
  });

  it('gives up after the last reconnect attempt fails', async () => {
    const { peer, onLost } = await host();
    peer.loseBroker();
    for (const delay of RECONNECT_DELAYS_MS) {
      vi.advanceTimersByTime(delay);
      peer.loseBroker();
    }
    expect(peer.reconnect).toHaveBeenCalledTimes(RECONNECT_DELAYS_MS.length);
    expect(onLost).toHaveBeenCalledOnce();
    expect(onLost.mock.calls[0]?.[0]).toBeInstanceOf(Error);
    expect(peer.destroyed).toBe(true);
  });

  it('starts counting attempts again after a successful reconnect', async () => {
    const { peer, onLost } = await host();
    for (let round = 0; round < 3; round++) {
      for (const delay of RECONNECT_DELAYS_MS.slice(0, -1)) {
        peer.loseBroker();
        vi.advanceTimersByTime(delay);
      }
      peer.emit('open', 'abc');
    }
    expect(onLost).not.toHaveBeenCalled();
  });

  it('stops waiting when aborted, without trying to reconnect', async () => {
    const { peer, onLost, controller } = await host();
    peer.loseBroker();
    controller.abort();
    expect(peer.destroyed).toBe(true);
    vi.runAllTimers();
    expect(peer.reconnect).not.toHaveBeenCalled();
    expect(onLost).not.toHaveBeenCalled();
  });

  it('rejects when aborted before registering', async () => {
    const controller = new AbortController();
    const hosted = hostConnection(() => undefined, vi.fn(), controller.signal);
    controller.abort();
    await expect(hosted).rejects.toThrow();
    expect(lastPeer().destroyed).toBe(true);
  });
});

describe('joinConnection', () => {
  it('rejects and destroys its peer when aborted', async () => {
    const controller = new AbortController();
    const joined = joinConnection('abc', controller.signal);
    controller.abort();
    await expect(joined).rejects.toThrow('Stopped connecting');
    expect(lastPeer().destroyed).toBe(true);
  });

  it('does not start when already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(joinConnection('abc', controller.signal)).rejects.toThrow();
    expect(FakePeer.created).toEqual([]);
  });

  it('reports a game that does not exist', async () => {
    const joined = joinConnection('abc', new AbortController().signal);
    lastPeer().emit('error', {
      type: 'peer-unavailable',
      message: 'Could not connect to peer abc',
    });
    await expect(joined).rejects.toThrow('No game found with ID "abc"');
  });
});
