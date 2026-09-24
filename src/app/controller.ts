import { chooseRandomMove, type RandomSource } from '../bot/random-bot';
import type { Player } from '../game/board';
import { newGame, playMove, type GameState } from '../game/game';
import { createBoardView } from '../ui/board-view';
import { createStatusView } from '../ui/status-view';

/**
 * Who makes the moves for a player. Adding a kind (e.g. `'remote'`) makes
 * the compiler report every switch over seats that does not handle it yet.
 */
export type Seat = 'human' | 'bot';

export type Seats = Readonly<Record<Player, Seat>>;

/** Pause before a bot move, so the human can follow the game. */
export const DEFAULT_BOT_DELAY_MS = 500;

export interface ControllerOptions {
  readonly seats: Seats;
  /** Milliseconds between the bot's turn starting and its move. */
  readonly botDelayMs?: number;
  /** Random source for the bot; tests pass a fixed one. */
  readonly random?: RandomSource;
}

export interface GameController {
  /** The game currently shown. */
  readonly state: GameState;
  /** Starts over with an empty board and cancels a pending bot move. */
  newGame(): void;
}

/**
 * Owns the running game: builds the status and board views in their
 * containers, applies column clicks on a human's turn, plays bot moves after
 * a short delay, and re-renders after every change.
 */
export function createGameController(
  containers: { readonly status: HTMLElement; readonly board: HTMLElement },
  options: ControllerOptions,
): GameController {
  const { seats, botDelayMs = DEFAULT_BOT_DELAY_MS, random = Math.random } = options;
  let state = newGame();
  let pendingBotMove: ReturnType<typeof setTimeout> | undefined;

  const statusView = createStatusView(containers.status, restart);
  const boardView = createBoardView(containers.board, (column) => {
    if (acceptsClicks(seats[state.currentPlayer])) play(column);
  });
  show(state);

  function restart(): void {
    clearTimeout(pendingBotMove);
    pendingBotMove = undefined;
    show(newGame());
  }

  function play(column: number): void {
    const next = playMove(state, column);
    if (next !== state) show(next);
  }

  function show(next: GameState): void {
    state = next;
    statusView.render(state);
    boardView.render(state);
    if (state.status.kind === 'playing' && seats[state.currentPlayer] === 'bot') {
      pendingBotMove = setTimeout(() => {
        pendingBotMove = undefined;
        play(chooseRandomMove(state, random));
      }, botDelayMs);
    }
  }

  return {
    get state() {
      return state;
    },
    newGame: restart,
  };
}

/** True if column clicks count as moves on `seat`'s turn. */
function acceptsClicks(seat: Seat): boolean {
  // No default branch: TypeScript reports a missing return if a new seat kind is added.
  switch (seat) {
    case 'human':
      return true;
    case 'bot':
      return false;
  }
}
