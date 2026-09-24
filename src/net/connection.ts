import { Peer, type DataConnection } from 'peerjs';
import { TransportChannel, type Channel, type JsonValue } from './channel';

// The only module that imports PeerJS; everything else uses `Channel`.
// PeerJS's free public broker (0.peerjs.com) introduces the two browsers and a
// public STUN server finds a route; after that, data flows directly between them.

/**
 * How long a host that lost the broker waits before each attempt to get its
 * ID back; after the last attempt fails, it gives up.
 */
export const RECONNECT_DELAYS_MS: readonly number[] = [1_000, 2_000, 4_000, 8_000, 16_000];

/** How long closing waits for queued messages before tearing the connection down. */
const CLOSE_TIMEOUT_MS = 2_000;

const CONNECT_OPTIONS = { reliable: true, serialization: 'json' } as const;

/**
 * Registers with the broker and waits for a guest. Resolves with the ID a
 * guest passes to `joinConnection` once registered, then calls `onGuest` with
 * the channel once the first guest has connected. Later guests are turned away.
 *
 * If the connection to the broker drops before a guest arrives, reconnects
 * under the same ID; calls `onLost` if that keeps failing. Aborting `signal`
 * stops waiting for a guest, but does not affect a channel that is already open.
 */
export function hostConnection(
  onGuest: (channel: Channel) => void,
  onLost: (error: Error) => void,
  signal: AbortSignal,
): Promise<string> {
  return new Promise((resolve, reject) => {
    signal.throwIfAborted();
    const peer = new Peer();
    let registered = false;
    let hasGuest = false;
    let reconnects = 0;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;

    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(reconnectTimer);
        if (!hasGuest) peer.destroy();
        reject(new Error('Stopped hosting'));
      },
      { once: true },
    );

    peer.on('open', (id) => {
      registered = true;
      reconnects = 0;
      resolve(id);
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

    // Only errors before registration end the game here. Later, PeerJS follows
    // a broker error with `disconnected`; once a guest is connected, problems
    // surface as the channel closing.
    peer.on('error', (error) => {
      if (registered) return;
      reject(new Error(`Could not start an online game: ${error.message}`));
      peer.destroy();
    });

    // Without the broker, guests cannot find this game, so the link stops working.
    peer.on('disconnected', () => {
      if (!registered || hasGuest || signal.aborted) return;
      const delay = RECONNECT_DELAYS_MS[reconnects++];
      if (delay === undefined) {
        peer.destroy();
        onLost(
          new Error(
            'Lost the connection to the game server. Choose another mode, then Play online again for a new link.',
          ),
        );
        return;
      }
      reconnectTimer = setTimeout(() => {
        if (peer.disconnected && !peer.destroyed) peer.reconnect();
      }, delay);
    });
  });
}

/**
 * Connects to the game hosted under `id`. Resolves with the channel once the
 * connection is open; rejects if the ID does not exist, connecting fails, or
 * `signal` is aborted first.
 */
export function joinConnection(id: string, signal: AbortSignal): Promise<Channel> {
  return new Promise((resolve, reject) => {
    signal.throwIfAborted();
    const peer = new Peer();
    let settled = false;

    const fail = (message: string) => {
      if (settled) return;
      settled = true;
      peer.destroy();
      reject(new Error(message));
    };
    signal.addEventListener('abort', () => fail('Stopped connecting'), { once: true });

    peer.on('open', () => {
      const connection = peer.connect(id, CONNECT_OPTIONS);
      connection.on('open', () => {
        if (settled) return;
        settled = true;
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
