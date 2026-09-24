import type { Channel } from '../net/channel';
import { hostConnection, joinConnection, type HostedConnection } from '../net/connection';
import { parseMessage, PROTOCOL_VERSION } from '../net/protocol';

/** Where an online game's setup stands; the page shows it in the status line. */
export type OnlineStatus =
  | { readonly kind: 'creating' }
  | { readonly kind: 'waiting'; readonly link: string }
  | { readonly kind: 'connecting' }
  | { readonly kind: 'connected' }
  | { readonly kind: 'version-mismatch' }
  | { readonly kind: 'failed'; readonly message: string };

export type HandshakeResult = 'connected' | 'version-mismatch';

/** A running host or guest flow. */
export interface OnlineSession {
  /** Stops the flow and closes the connection, if any. Reports no further status. */
  close(): void;
}

/** The connection functions from `src/net/connection.ts`; tests pass fakes. */
export interface Connector {
  host(onGuest: (channel: Channel) => void): Promise<HostedConnection>;
  join(id: string): Promise<Channel>;
}

const PEER_CONNECTOR: Connector = { host: hostConnection, join: joinConnection };

// The ID lives in the fragment, so GitHub Pages always serves the same page
// and the ID never reaches a server.
const JOIN_FRAGMENT = 'join=';

/** The link that joins game `id`: the current page with `#join=<id>`. */
export function buildJoinLink(pageUrl: string, id: string): string {
  const url = new URL(pageUrl);
  url.hash = JOIN_FRAGMENT + encodeURIComponent(id);
  return url.href;
}

/** The game ID in a `location.hash` like `#join=<id>`, or `undefined` if there is none. */
export function parseJoinId(hash: string): string | undefined {
  const prefix = `#${JOIN_FRAGMENT}`;
  if (!hash.startsWith(prefix)) return undefined;
  try {
    return decodeURIComponent(hash.slice(prefix.length)) || undefined;
  } catch {
    return undefined;
  }
}

/**
 * Sends `hello` and waits for the other side's. Resolves with `'connected'` if
 * both use protocol `version`, otherwise with `'version-mismatch'`. Anything
 * received before the other `hello` is ignored.
 */
export function handshake(channel: Channel, version = PROTOCOL_VERSION): Promise<HandshakeResult> {
  return new Promise((resolve) => {
    channel.onMessage((data) => {
      const message = parseMessage(data);
      if (message?.type !== 'hello') return;
      resolve(message.version === version ? 'connected' : 'version-mismatch');
    });
    channel.send({ type: 'hello', version });
  });
}

/**
 * Creates a game on `pageUrl` and waits for a guest: reports `creating`, then
 * `waiting` with the link to share, then the handshake result.
 */
export function hostOnlineGame(
  pageUrl: string,
  onStatus: (status: OnlineStatus) => void,
  connector: Connector = PEER_CONNECTOR,
): OnlineSession {
  const session = new Session(onStatus);
  session.report({ kind: 'creating' });
  connector
    .host((channel) => session.connect(channel))
    .then(
      (hosted) => {
        session.whenClosed(() => hosted.cancel());
        if (session.isWaiting) {
          session.report({ kind: 'waiting', link: buildJoinLink(pageUrl, hosted.id) });
        }
      },
      (error: unknown) => session.fail(error),
    );
  return session;
}

/** Joins game `id`: reports `connecting`, then the handshake result. */
export function joinOnlineGame(
  id: string,
  onStatus: (status: OnlineStatus) => void,
  connector: Connector = PEER_CONNECTOR,
): OnlineSession {
  const session = new Session(onStatus);
  session.report({ kind: 'connecting' });
  connector.join(id).then(
    (channel) => session.connect(channel),
    (error: unknown) => session.fail(error),
  );
  return session;
}

/** Bookkeeping shared by host and guest: the channel, closing, and status reports. */
class Session implements OnlineSession {
  #closed = false;
  #channel: Channel | undefined;
  #cleanups: (() => void)[] = [];
  readonly #onStatus: (status: OnlineStatus) => void;

  constructor(onStatus: (status: OnlineStatus) => void) {
    this.#onStatus = onStatus;
  }

  /** True while neither connected nor closed. */
  get isWaiting(): boolean {
    return !this.#closed && !this.#channel;
  }

  report(status: OnlineStatus): void {
    if (!this.#closed) this.#onStatus(status);
  }

  fail(error: unknown): void {
    this.report({
      kind: 'failed',
      message: error instanceof Error ? error.message : String(error),
    });
  }

  /** Takes over a newly opened channel and runs the handshake on it. */
  connect(channel: Channel): void {
    if (!this.isWaiting) {
      channel.close();
      return;
    }
    this.#channel = channel;
    void handshake(channel).then((result) => this.report({ kind: result }));
  }

  /** Runs `cleanup` on `close`, or right away if already closed. */
  whenClosed(cleanup: () => void): void {
    if (this.#closed) cleanup();
    else this.#cleanups.push(cleanup);
  }

  close(): void {
    if (this.#closed) return;
    this.#closed = true;
    this.#channel?.close();
    for (const cleanup of this.#cleanups) cleanup();
    this.#cleanups = [];
  }
}
