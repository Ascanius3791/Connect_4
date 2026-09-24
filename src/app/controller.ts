import { chooseRandomMove, type RandomSource } from '../bot/random-bot';
import type { Player } from '../game/board';
import { newGame, playMove, type GameState } from '../game/game';
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

export interface ControllerOptions {
  readonly seats: Seats;
  /** Milliseconds between the bot's turn starting and its move. */
  readonly botDelayMs?: number;
  /** Random source for the bot; tests pass a fixed one. */
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
   * Starts over with an empty board and cancels a pending bot move. Given new
   * seats, the new game uses them; otherwise it keeps the current ones.
   */
  newGame(seats?: Seats): void;
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
 * containers, applies column clicks on a human's turn, plays bot moves after
 * a short delay, takes remote moves from outside, and re-renders after every
 * change.
 */
export function createGameController(
  containers: { readonly status: HTMLElement; readonly board: HTMLElement },
  options: ControllerOptions,
): GameController {
  const { botDelayMs = DEFAULT_BOT_DELAY_MS, random = Math.random, onHumanMove } = options;
  let seats = options.seats;
  let state = newGame();
  let notice: string | undefined;
  let pendingBotMove: ReturnType<typeof setTimeout> | undefined;

  const statusView = createStatusView(containers.status, () => restart());
  const boardView = createBoardView(containers.board, (column) => {
    if (notice !== undefined || !acceptsClicks(seats[state.currentPlayer])) return;
    if (play(column)) onHumanMove?.(state.history.length - 1, column);
  });
  show(state);

  function restart(nextSeats: Seats = seats): void {
    seats = nextSeats;
    clearTimeout(pendingBotMove);
    pendingBotMove = undefined;
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
    if (state.status.kind === 'playing' && seats[state.currentPlayer] === 'bot') {
      pendingBotMove = setTimeout(() => {
        pendingBotMove = undefined;
        play(chooseRandomMove(state, random));
      }, botDelayMs);
    }
  }

  function render(): void {
    statusView.render(state, seats, notice);
    boardView.render(state, notice === undefined);
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
