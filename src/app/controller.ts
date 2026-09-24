import type { Engine } from '../bot/engine';
import { chooseLevelMove, DEFAULT_LEVEL, LEVEL_PLAY, type Level } from '../bot/levels';
import type { RandomSource } from '../bot/random-bot';
import { searchMove } from '../bot/search';
import type { Player } from '../game/board';
import { canPlay, newGame, playMove, type GameState } from '../game/game';
import { createBoardView } from '../ui/board-view';
import { createStatusView } from '../ui/status-view';

/**
 * Who makes the moves for a player: someone clicking on this page, the
 * computer, or the opponent on another PC. Adding a kind makes the compiler
 * report every switch over seats that does not handle it yet.
 */
export type Seat = 'human' | 'bot' | 'remote';

export type Seats = Readonly<Record<Player, Seat>>;

/** Pause before a bot move, so the human can follow the game. */
export const DEFAULT_BOT_DELAY_MS = 500;

/**
 * Deepest in-process search that picks the bot's move when the engine
 * fails (shallower if the level searches less deeply). A fixed depth keeps
 * it to a few milliseconds on the page.
 */
export const FALLBACK_DEPTH = 8;

export interface ControllerOptions {
  readonly seats: Seats;
  /** How strong the bot plays; Medium by default. */
  readonly level?: Level;
  /**
   * Searches the bot's moves for the levels that search. The page passes a worker engine; tests pass a
   * fake. Only used when a seat is `'bot'`.
   */
  readonly engine: Engine;
  /**
   * Least time between the bot's turn starting and its move; the move waits
   * for this pause and the engine's answer, which run at the same time.
   */
  readonly botDelayMs?: number;
  /**
   * Random source for the levels that do not search and for the fallback
   * search when the engine fails; tests pass a fixed one.
   */
  readonly random?: RandomSource;
  /**
   * Called after each move made by clicking, once it is on the board, with
   * its index in the game's history. Online play sends it to the opponent.
   */
  readonly onHumanMove?: (index: number, column: number) => void;
}

export interface GameController {
  /** The game currently shown. */
  readonly state: GameState;
  /**
   * Starts over with an empty board and cancels a pending bot move, which
   * then never appears. Given new seats or a new level, the new game uses
   * them; otherwise it keeps the current ones.
   */
  newGame(seats?: Seats, level?: Level): void;
  /**
   * Plays `column` for the current player if their seat is `'remote'` and the
   * move is legal. Returns whether it was played.
   */
  playRemoteMove(column: number): boolean;
  /**
   * Shows `notice` in the status line instead of the game's status, and
   * ignores column clicks and disables "New game" until it is cleared with
   * `undefined`. Survives new games.
   */
  setNotice(notice: string | undefined): void;
}

/**
 * Owns the running game: builds the status and board views in their
 * containers, applies column clicks on a human's turn, plays bot moves once
 * the engine has answered and a short pause has passed, takes remote moves
 * from outside, and re-renders after every change.
 */
export function createGameController(
  containers: { readonly status: HTMLElement; readonly board: HTMLElement },
  options: ControllerOptions,
): GameController {
  const { engine, botDelayMs = DEFAULT_BOT_DELAY_MS, random = Math.random, onHumanMove } = options;
  let seats = options.seats;
  let level = options.level ?? DEFAULT_LEVEL;
  let state = newGame();
  let notice: string | undefined;
  let pendingBotMove: ReturnType<typeof setTimeout> | undefined;

  const statusView = createStatusView(containers.status, () => restart());
  const boardView = createBoardView(containers.board, (column) => {
    if (notice !== undefined || !acceptsClicks(seats[state.currentPlayer])) return;
    if (play(column)) onHumanMove?.(state.history.length - 1, column);
  });
  show(state);

  function restart(nextSeats: Seats = seats, nextLevel: Level = level): void {
    seats = nextSeats;
    level = nextLevel;
    clearTimeout(pendingBotMove);
    pendingBotMove = undefined;
    engine.cancel();
    show(newGame());
  }

  /** Plays `column` for the current player; returns false if the move is illegal. */
  function play(column: number): boolean {
    const next = playMove(state, column);
    if (next === state) return false;
    show(next);
    return true;
  }

  function show(next: GameState): void {
    state = next;
    render();
    if (state.status.kind === 'playing' && seats[state.currentPlayer] === 'bot') startBotMove();
  }

  /**
   * Starts the level's move (the engine's search, or a quick rule on the
   * page) and the pause together and plays the answer once both are done.
   * Every new game and every move replaces `state`, so an answer for an
   * older position is recognised and dropped.
   */
  function startBotMove(): void {
    const position = state;
    let answer: number | undefined;
    let paused = false;
    const playWhenReady = () => {
      if (answer !== undefined && paused && state === position) play(answer);
    };
    pendingBotMove = setTimeout(() => {
      pendingBotMove = undefined;
      paused = true;
      playWhenReady();
    }, botDelayMs);
    const levelPlay = LEVEL_PLAY[level];
    if (levelPlay.kind !== 'search') {
      answer = chooseLevelMove(position, level, random);
      return;
    }
    const { options: searchOptions } = levelPlay;
    engine
      .search(position, searchOptions)
      .then(({ column }) => {
        if (!canPlay(position, column)) throw new Error(`Engine chose illegal column ${column}`);
        return column;
      })
      .catch((error: unknown) => {
        if (state !== position) return undefined;
        console.error('The search failed; the computer falls back to a quick search.', error);
        const maxDepth = Math.min(searchOptions.maxDepth ?? FALLBACK_DEPTH, FALLBACK_DEPTH);
        const { noiseMargin } = searchOptions;
        return searchMove(position, { maxDepth, noiseMargin, random }).column;
      })
      .then((column) => {
        answer = column;
        playWhenReady();
      });
  }

  function render(): void {
    statusView.render(state, seats, notice);
    // Disabled columns also drop their hover highlight, so the board only
    // looks clickable when a click would count.
    boardView.render(state, notice === undefined && acceptsClicks(seats[state.currentPlayer]));
  }

  return {
    get state() {
      return state;
    },
    newGame: restart,
    playRemoteMove(column) {
      return seats[state.currentPlayer] === 'remote' && play(column);
    },
    setNotice(next) {
      notice = next;
      render();
    },
  };
}

/** True if column clicks count as moves on `seat`'s turn. */
function acceptsClicks(seat: Seat): boolean {
  // No default branch: TypeScript reports a missing return if a new seat kind is added.
  switch (seat) {
    case 'human':
      return true;
    case 'bot':
    case 'remote':
      return false;
  }
}
