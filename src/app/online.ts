import type { Player } from '../game/board';
import { canPlay, type GameState } from '../game/game';
import type { Channel, JsonValue } from '../net/channel';
import { hostConnection, joinConnection } from '../net/connection';
import { parseMessage, PROTOCOL_VERSION, type MoveMessage } from '../net/protocol';
import type { GameController, Seats } from './controller';

/**
 * Who has asked for a rematch after a game: nobody yet, this page (waiting
 * for the opponent to accept), or the opponent (waiting for this page).
 */
export type RematchState = 'none' | 'requested' | 'offered';

/**
 * Where an online game stands; the page shows it in the status line, and
 * after a finished game offers a rematch.
 */
export type OnlineStatus =
  | { readonly kind: 'creating' }
  | { readonly kind: 'waiting'; readonly link: string }
  | { readonly kind: 'connecting' }
  | { readonly kind: 'connected' }
  | { readonly kind: 'game-over'; readonly rematch: RematchState }
  | { readonly kind: 'version-mismatch' }
  | { readonly kind: 'out-of-sync' }
  | { readonly kind: 'connection-lost' }
  | { readonly kind: 'join-failed' }
  | { readonly kind: 'failed'; readonly message: string };

export type HandshakeResult = 'connected' | 'version-mismatch';

/** A running host or guest flow. */
export interface OnlineSession {
  /**
   * Sends a move made on this page to the opponent. Does nothing unless the
   * game is running.
   */
  sendMove(index: number, column: number): void;
  /**
   * After a finished game, asks the opponent for a rematch, or accepts theirs.
   * Once both agree, a new game starts on both pages, and the player who
   * moved second in the last game moves first.
   */
  rematch(): void;
  /** Stops the flow and closes the connection, if any. Reports no further status. */
  close(): void;
}

/** The part of the game controller that an online game drives. */
export type OnlineGame = Pick<GameController, 'state' | 'newGame' | 'playRemoteMove'>;

/** The connection functions from `src/net/connection.ts`; tests pass fakes. */
export interface Connector {
  host(
    onGuest: (channel: Channel) => void,
    onLost: (error: Error) => void,
    signal: AbortSignal,
  ): Promise<string>;
  join(id: string, signal: AbortSignal): Promise<Channel>;
}

const PEER_CONNECTOR: Connector = { host: hostConnection, join: joinConnection };

export interface OnlineOptions {
  /** Defaults to PeerJS; tests pass a fake. */
  readonly connector?: Connector;
  /** How often each side sends a `ping` once the game has started. */
  readonly pingIntervalMs?: number;
  /**
   * How long a connected side waits for any message before it reports the
   * connection as lost. PeerJS does not reliably report a closed tab; the
   * pings keep a live connection from timing out.
   */
  readonly lostTimeoutMs?: number;
  /**
   * How long a guest waits for the first game to start before giving up on
   * the link. It covers the whole join; the connector has no timeout of its own.
   */
  readonly joinTimeoutMs?: number;
}

type Timings = Required<Omit<OnlineOptions, 'connector'>>;

const DEFAULT_TIMINGS: Timings = {
  pingIntervalMs: 3_000,
  lostTimeoutMs: 10_000,
  joinTimeoutMs: 15_000,
};

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
  options: OnlineOptions = {},
): OnlineSession {
  const { connector = PEER_CONNECTOR, ...timings } = options;
  const session = new Session(game, HOST_SEATS, onStatus, {
    timings: { ...DEFAULT_TIMINGS, ...timings },
    unreachable: { kind: 'connection-lost' },
  });
  session.report({ kind: 'creating' });
  connector
    .host(
      (channel) => session.connect(channel),
      (error) => session.fail(error),
      session.signal,
    )
    .then(
      (id) => {
        if (session.isWaiting) {
          session.report({ kind: 'waiting', link: buildJoinLink(pageUrl, id) });
        }
      },
      (error: unknown) => session.fail(error),
    );
  return session;
}

/**
 * Joins game `id`: reports `connecting`, then the handshake result. Once
 * connected, starts a new `game` in which this page plays yellow. Reports
 * `join-failed` if the game cannot be reached or has not started in time.
 */
export function joinOnlineGame(
  id: string,
  game: OnlineGame,
  onStatus: (status: OnlineStatus) => void,
  options: OnlineOptions = {},
): OnlineSession {
  const { connector = PEER_CONNECTOR, ...timings } = options;
  const session = new Session(game, GUEST_SEATS, onStatus, {
    timings: { ...DEFAULT_TIMINGS, ...timings },
    unreachable: { kind: 'join-failed' },
  });
  session.report({ kind: 'connecting' });
  session.loseUnlessStartedWithin(session.timings.joinTimeoutMs);
  connector.join(id, session.signal).then(
    (channel) => session.connect(channel),
    () => session.lose(),
  );
  return session;
}

/**
 * `waiting` for a channel, running the `handshake`, `playing` (also between
 * a finished game and the rematch), or `ended` for good.
 */
type Phase = 'waiting' | 'handshake' | 'playing' | 'ended';

interface SessionSetup {
  readonly timings: Timings;
  /** What to report if the connection fails before the first game has started. */
  readonly unreachable: OnlineStatus;
}

/**
 * Bookkeeping shared by host and guest: the channel, keep-alive and timeouts,
 * status reports, passing moves between the game and the channel, and
 * rematches.
 */
class Session implements OnlineSession {
  #phase: Phase = 'waiting';
  /** Aborted when the session ends; stops hosting or joining that is still under way. */
  readonly #ended = new AbortController();
  #channel: Channel | undefined;
  /** The current game's seats; they swap with every rematch. */
  #seats: Seats;
  #rematch: RematchState = 'none';
  #pingTimer: ReturnType<typeof setInterval> | undefined;
  #silenceTimer: ReturnType<typeof setTimeout> | undefined;
  #startTimer: ReturnType<typeof setTimeout> | undefined;
  readonly #game: OnlineGame;
  readonly #onStatus: (status: OnlineStatus) => void;
  readonly #unreachable: OnlineStatus;
  readonly timings: Timings;

  constructor(
    game: OnlineGame,
    seats: Seats,
    onStatus: (status: OnlineStatus) => void,
    setup: SessionSetup,
  ) {
    this.#game = game;
    this.#seats = seats;
    this.#onStatus = onStatus;
    this.timings = setup.timings;
    this.#unreachable = setup.unreachable;
  }

  /** Aborted once the session has ended. */
  get signal(): AbortSignal {
    return this.#ended.signal;
  }

  /** True while neither connected nor ended. */
  get isWaiting(): boolean {
    return this.#phase === 'waiting';
  }

  /** Reports `status` unless the session has ended. */
  report(status: OnlineStatus): void {
    if (this.#phase !== 'ended') this.#onStatus(status);
  }

  fail(error: unknown): void {
    this.#end({
      kind: 'failed',
      message: error instanceof Error ? error.message : String(error),
    });
  }

  /**
   * Ends the session because the connection is gone or never came about:
   * reports `connection-lost` once a game has started, before that the
   * unreachable status.
   */
  lose(): void {
    this.#end(this.#phase === 'playing' ? { kind: 'connection-lost' } : this.#unreachable);
  }

  /** Calls `lose` unless the first game has started within `ms`. */
  loseUnlessStartedWithin(ms: number): void {
    this.#startTimer = setTimeout(() => this.lose(), ms);
  }

  /** Takes over a newly opened channel, runs the handshake on it, then starts the game. */
  connect(channel: Channel): void {
    if (!this.isWaiting) {
      channel.close();
      return;
    }
    // It may have closed between opening and being handed over.
    if (!channel.isOpen) {
      this.lose();
      return;
    }
    this.#phase = 'handshake';
    this.#channel = channel;
    channel.onClose(() => this.lose());
    this.#heard();
    handshake(channel, (result) => {
      if (result === 'connected') {
        this.#start(channel);
        this.report({ kind: 'connected' });
      } else {
        this.#end({ kind: result });
      }
    });
  }

  sendMove(index: number, column: number): void {
    if (this.#phase !== 'playing') return;
    this.#send({ type: 'move', index, column });
    this.#reportIfOver();
  }

  rematch(): void {
    if (this.#phase !== 'playing' || !this.#isOver()) return;
    if (this.#rematch === 'none') {
      this.#rematch = 'requested';
      this.#send({ type: 'rematch-request' });
      this.#reportIfOver();
    } else if (this.#rematch === 'offered') {
      this.#send({ type: 'rematch-accept' });
      this.#nextGame();
    }
  }

  #start(channel: Channel): void {
    this.#phase = 'playing';
    clearTimeout(this.#startTimer);
    this.#game.newGame(this.#seats);
    channel.onMessage((data) => this.#receive(data));
    this.#heard(); // The opponent's hello just arrived.
    this.#pingTimer = setInterval(() => this.#send({ type: 'ping' }), this.timings.pingIntervalMs);
  }

  /** Restarts the timer that reports the connection as lost after a silence. */
  #heard(): void {
    clearTimeout(this.#silenceTimer);
    this.#silenceTimer = setTimeout(() => this.lose(), this.timings.lostTimeoutMs);
  }

  #send(message: JsonValue): void {
    if (this.#channel?.isOpen) this.#channel.send(message);
  }

  #receive(data: JsonValue): void {
    if (this.#phase !== 'playing') return;
    this.#heard();
    const message = parseMessage(data);
    // No default branch: TypeScript reports a missing case if a new message type is added.
    switch (message?.type) {
      case undefined:
        this.#outOfSync(true);
        return;
      case 'move': {
        const remotePlayer = this.#seats[1] === 'remote' ? 1 : 2;
        const verdict = judgeRemoteMove(this.#game.state, remotePlayer, message);
        if (verdict === 'apply') {
          this.#game.playRemoteMove(message.column);
          this.#reportIfOver();
        } else if (verdict === 'out-of-sync') {
          this.#outOfSync(true);
        }
        return;
      }
      case 'rematch-request':
        // The opponent only asks once their game has ended, and moves arrive
        // in order, so this game has ended too unless the two games differ.
        if (!this.#isOver()) {
          this.#outOfSync(true);
        } else if (this.#rematch === 'requested') {
          // Both asked at the same time: each side takes the other's request
          // as the answer, so both start without an accept.
          this.#nextGame();
        } else if (this.#rematch === 'none') {
          this.#rematch = 'offered';
          this.#reportIfOver();
        }
        return;
      case 'rematch-accept':
        if (this.#rematch === 'requested') this.#nextGame();
        else this.#outOfSync(true);
        return;
      case 'out-of-sync':
        this.#outOfSync(false);
        return;
      // A late hello needs no answer; a ping only needs to arrive.
      case 'hello':
      case 'ping':
        return;
    }
  }

  #isOver(): boolean {
    return this.#game.state.status.kind !== 'playing';
  }

  /** Reports `game-over` with the rematch state if the game has ended. */
  #reportIfOver(): void {
    if (this.#isOver()) this.report({ kind: 'game-over', rematch: this.#rematch });
  }

  /**
   * Starts the next game once both players agreed to a rematch. Player 1
   * always moves first, so swapping the seats lets the other player start.
   */
  #nextGame(): void {
    this.#seats = { 1: this.#seats[2], 2: this.#seats[1] };
    this.#rematch = 'none';
    this.#game.newGame(this.#seats);
    this.report({ kind: 'connected' });
  }

  /**
   * Ends the session as out of sync. With `tellOpponent`, first tells the
   * other side, which cannot notice it on its own.
   */
  #outOfSync(tellOpponent: boolean): void {
    if (tellOpponent) this.#send({ type: 'out-of-sync' });
    this.#end({ kind: 'out-of-sync' });
  }

  /**
   * Ends the session for good: stops the timers and any hosting or joining
   * still under way, reports `status` if given, and closes the connection. Does nothing once ended, so the channel
   * closing afterwards cannot replace the reported status.
   */
  #end(status: OnlineStatus | undefined): void {
    if (this.#phase === 'ended') return;
    this.#phase = 'ended';
    clearInterval(this.#pingTimer);
    clearTimeout(this.#silenceTimer);
    clearTimeout(this.#startTimer);
    this.#ended.abort();
    if (status) this.#onStatus(status);
    this.#channel?.close();
  }

  close(): void {
    this.#end(undefined);
  }
}
