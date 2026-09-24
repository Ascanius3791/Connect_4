import type { Player } from '../game/board';
import { canPlay, type GameState } from '../game/game';
import type { Channel, JsonValue } from '../net/channel';
import { hostConnection, joinConnection, type HostedConnection } from '../net/connection';
import { parseMessage, PROTOCOL_VERSION, type MoveMessage } from '../net/protocol';
import type { GameController, Seats } from './controller';

/** Where an online game stands; the page shows it in the status line. */
export type OnlineStatus =
  | { readonly kind: 'creating' }
  | { readonly kind: 'waiting'; readonly link: string }
  | { readonly kind: 'connecting' }
  | { readonly kind: 'connected' }
  | { readonly kind: 'version-mismatch' }
  | { readonly kind: 'out-of-sync' }
  | { readonly kind: 'failed'; readonly message: string };

export type HandshakeResult = 'connected' | 'version-mismatch';

/** A running host or guest flow. */
export interface OnlineSession {
  /**
   * Sends a move made on this page to the opponent. Does nothing unless the
   * game is running.
   */
  sendMove(index: number, column: number): void;
  /** Stops the flow and closes the connection, if any. Reports no further status. */
  close(): void;
}

/** The part of the game controller that an online game drives. */
export type OnlineGame = Pick<GameController, 'state' | 'newGame' | 'playRemoteMove'>;

/** The connection functions from `src/net/connection.ts`; tests pass fakes. */
export interface Connector {
  host(onGuest: (channel: Channel) => void): Promise<HostedConnection>;
  join(id: string): Promise<Channel>;
}

const PEER_CONNECTOR: Connector = { host: hostConnection, join: joinConnection };

/** The host plays red and moves first; the guest plays yellow. */
const HOST_SEATS: Seats = { 1: 'human', 2: 'remote' };
const GUEST_SEATS: Seats = { 1: 'remote', 2: 'human' };

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
 * Sends `hello` and waits for the other side's. Calls `onResult` once, with
 * `'connected'` if both use protocol `version`, otherwise with
 * `'version-mismatch'`. The call happens while the `hello` is being handled,
 * so `onResult` can set the channel's next message handler before any later
 * message is delivered. Anything received before the other `hello` is ignored.
 */
export function handshake(
  channel: Channel,
  onResult: (result: HandshakeResult) => void,
  version = PROTOCOL_VERSION,
): void {
  let done = false;
  channel.onMessage((data) => {
    const message = parseMessage(data);
    if (done || message?.type !== 'hello') return;
    done = true;
    onResult(message.version === version ? 'connected' : 'version-mismatch');
  });
  channel.send({ type: 'hello', version });
}

/** What to do with a move received from the opponent. */
export type RemoteMoveVerdict = 'apply' | 'ignore' | 'out-of-sync';

/**
 * Judges `move`, received from the opponent who plays `remotePlayer`. It is
 * applied if it is the opponent's turn, its index is the next one in the
 * history, and its column is legal. An exact repeat of the opponent's last
 * move is ignored. Anything else means the two games differ.
 */
export function judgeRemoteMove(
  state: GameState,
  remotePlayer: Player,
  move: Pick<MoveMessage, 'index' | 'column'>,
): RemoteMoveVerdict {
  const { history } = state;
  if (
    move.index === history.length &&
    state.currentPlayer === remotePlayer &&
    canPlay(state, move.column)
  ) {
    return 'apply';
  }
  // The turn passes after every move, even the last one, so the last move
  // was the opponent's exactly when it is not their turn now.
  const lastIndex = history.length - 1;
  if (
    move.index === lastIndex &&
    move.column === history[lastIndex] &&
    state.currentPlayer !== remotePlayer
  ) {
    return 'ignore';
  }
  return 'out-of-sync';
}

/**
 * Creates a game on `pageUrl` and waits for a guest: reports `creating`, then
 * `waiting` with the link to share, then the handshake result. Once
 * connected, starts a new `game` in which this page plays red and moves first.
 */
export function hostOnlineGame(
  pageUrl: string,
  game: OnlineGame,
  onStatus: (status: OnlineStatus) => void,
  connector: Connector = PEER_CONNECTOR,
): OnlineSession {
  const session = new Session(game, HOST_SEATS, onStatus);
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

/**
 * Joins game `id`: reports `connecting`, then the handshake result. Once
 * connected, starts a new `game` in which this page plays yellow.
 */
export function joinOnlineGame(
  id: string,
  game: OnlineGame,
  onStatus: (status: OnlineStatus) => void,
  connector: Connector = PEER_CONNECTOR,
): OnlineSession {
  const session = new Session(game, GUEST_SEATS, onStatus);
  session.report({ kind: 'connecting' });
  connector.join(id).then(
    (channel) => session.connect(channel),
    (error: unknown) => session.fail(error),
  );
  return session;
}

/**
 * Bookkeeping shared by host and guest: the channel, closing, status reports,
 * and passing moves between the game and the channel.
 */
class Session implements OnlineSession {
  #closed = false;
  #channel: Channel | undefined;
  /** True from a successful handshake until the games are found out of sync. */
  #playing = false;
  #cleanups: (() => void)[] = [];
  readonly #game: OnlineGame;
  readonly #seats: Seats;
  readonly #onStatus: (status: OnlineStatus) => void;

  constructor(game: OnlineGame, seats: Seats, onStatus: (status: OnlineStatus) => void) {
    this.#game = game;
    this.#seats = seats;
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

  /** Takes over a newly opened channel, runs the handshake on it, then starts the game. */
  connect(channel: Channel): void {
    if (!this.isWaiting) {
      channel.close();
      return;
    }
    this.#channel = channel;
    handshake(channel, (result) => {
      if (result === 'connected') this.#start(channel);
      this.report({ kind: result });
    });
  }

  sendMove(index: number, column: number): void {
    if (this.#playing && this.#channel?.isOpen) this.#channel.send({ type: 'move', index, column });
  }

  #start(channel: Channel): void {
    this.#playing = true;
    this.#game.newGame(this.#seats);
    channel.onMessage((data) => this.#receive(data));
  }

  #receive(data: JsonValue): void {
    if (!this.#playing) return;
    const message = parseMessage(data);
    // No default branch: TypeScript reports a missing case if a new message type is added.
    switch (message?.type) {
      case undefined:
        this.#outOfSync(true);
        return;
      case 'move': {
        const remotePlayer = this.#seats[1] === 'remote' ? 1 : 2;
        const verdict = judgeRemoteMove(this.#game.state, remotePlayer, message);
        if (verdict === 'apply') this.#game.playRemoteMove(message.column);
        else if (verdict === 'out-of-sync') this.#outOfSync(true);
        return;
      }
      case 'out-of-sync':
        this.#outOfSync(false);
        return;
      // A late hello needs no answer; rematches and keep-alives come with #21.
      case 'hello':
      case 'rematch-request':
      case 'rematch-accept':
      case 'ping':
        return;
    }
  }

  /**
   * Stops the game, reports it as out of sync, and closes the connection.
   * With `tellOpponent`, first tells the other side, which cannot notice it
   * on its own.
   */
  #outOfSync(tellOpponent: boolean): void {
    this.#playing = false;
    this.report({ kind: 'out-of-sync' });
    const channel = this.#channel;
    if (!channel?.isOpen) return;
    if (tellOpponent) channel.send({ type: 'out-of-sync' });
    channel.close();
  }

  /** Runs `cleanup` on `close`, or right away if already closed. */
  whenClosed(cleanup: () => void): void {
    if (this.#closed) cleanup();
    else this.#cleanups.push(cleanup);
  }

  close(): void {
    if (this.#closed) return;
    this.#closed = true;
    this.#playing = false;
    this.#channel?.close();
    for (const cleanup of this.#cleanups) cleanup();
    this.#cleanups = [];
  }
}
