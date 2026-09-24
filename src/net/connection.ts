import { Peer, type DataConnection } from 'peerjs';
import { TransportChannel, type Channel, type JsonValue } from './channel';

// The only module that imports PeerJS; everything else uses `Channel`.
// PeerJS's free public broker (0.peerjs.com) introduces the two browsers and a
// public STUN server finds a route; after that, data flows directly between them.

/** How long `joinConnection` waits before giving up. */
const JOIN_TIMEOUT_MS = 20_000;

/** How long closing waits for queued messages before tearing the connection down. */
const CLOSE_TIMEOUT_MS = 2_000;

const CONNECT_OPTIONS = { reliable: true, serialization: 'json' } as const;

/** A game waiting for a guest. */
export interface HostedConnection {
  /** The ID a guest passes to `joinConnection`. */
  readonly id: string;
  /** Stops waiting for a guest. Does not affect a channel that is already open. */
  cancel(): void;
}

/**
 * Registers with the broker and waits for a guest. Resolves with the ID to
 * share once registered, then calls `onGuest` with the channel once the first
 * guest has connected. Later guests are turned away.
 */
export function hostConnection(onGuest: (channel: Channel) => void): Promise<HostedConnection> {
  return new Promise((resolve, reject) => {
    const peer = new Peer();
    let registered = false;
    let hasGuest = false;

    peer.on('open', (id) => {
      registered = true;
      resolve({
        id,
        cancel: () => {
          if (!hasGuest) peer.destroy();
        },
      });
    });

    peer.on('connection', (connection) => {
      connection.on('open', () => {
        if (hasGuest) {
          connection.close();
          return;
        }
        hasGuest = true;
        onGuest(wrap(peer, connection));
      });
    });

    // Only errors before registration matter here; once a guest is connected,
    // problems surface as the channel closing.
    peer.on('error', (error) => {
      if (registered) return;
      reject(new Error(`Could not start an online game: ${error.message}`));
      peer.destroy();
    });
  });
}

/**
 * Connects to the game hosted under `id`. Resolves with the channel once the
 * connection is open; rejects if the ID does not exist or connecting fails.
 */
export function joinConnection(id: string): Promise<Channel> {
  return new Promise((resolve, reject) => {
    const peer = new Peer();
    let settled = false;

    const fail = (message: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      peer.destroy();
      reject(new Error(message));
    };
    const timer = setTimeout(
      () => fail('Could not connect: the other player did not answer in time'),
      JOIN_TIMEOUT_MS,
    );

    peer.on('open', () => {
      const connection = peer.connect(id, CONNECT_OPTIONS);
      connection.on('open', () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(wrap(peer, connection));
      });
      connection.on('error', (error) => fail(`Could not connect: ${error.message}`));
    });

    peer.on('error', (error) => {
      if (error.type === 'peer-unavailable') fail(`No game found with ID "${id}"`);
      else fail(`Could not connect: ${error.message}`);
    });
  });
}

/** Adapts an open PeerJS connection to a `Channel` that owns `peer`. */
function wrap(peer: Peer, connection: DataConnection): Channel {
  // Once connected, the broker is no longer needed; this also stops new guests.
  peer.disconnect();
  const channel = new TransportChannel({
    send: (message) => void connection.send(message),
    close: () => {
      // Deliver messages still in the buffer first; give up after a while if
      // the other side does not confirm.
      connection.close({ flush: true });
      setTimeout(() => peer.destroy(), CLOSE_TIMEOUT_MS);
    },
  });
  connection.on('data', (data) => channel.receive(data as JsonValue));
  connection.on('close', () => {
    channel.receiveClose();
    peer.destroy();
  });
  connection.on('error', () => channel.close());
  return channel;
}
