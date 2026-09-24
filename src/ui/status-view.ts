import type { Seat, Seats } from '../app/controller';
import type { Player } from '../game/board';
import type { GameState } from '../game/game';
import { PLAYER_NAMES, playerClass } from './players';

export interface StatusView {
  /**
   * Shows whose turn it is in `state`, or how its game ended. When a human
   * plays the computer or an online opponent, the texts speak to the human
   * ("Your turn", "You win!"); otherwise they name the colours. A `notice`
   * (e.g. the state of an online connection) replaces the game's status and
   * disables "New game" while it is shown. "New game" is also disabled in an
   * online game, where restarting alone would split the two players' games.
   */
  render(state: GameState, seats: Seats, notice?: string): void;
}

/**
 * Builds the status line and the "New game" button inside `container` once
 * and returns a view that updates the line in place. The line is an
 * `aria-live` region, so screen readers announce every change.
 */
export function createStatusView(container: HTMLElement, onNewGame: () => void): StatusView {
  const line = document.createElement('p');
  line.className = 'status';
  line.setAttribute('aria-live', 'polite');
  const disc = document.createElement('span');
  disc.setAttribute('aria-hidden', 'true');
  const text = document.createElement('span');
  line.append(disc, text);

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'new-game';
  button.textContent = 'New game';
  button.addEventListener('click', onNewGame);

  container.replaceChildren(line, button);

  return {
    render(state, seats, notice) {
      const { player, message } =
        notice === undefined ? describe(state, seats) : { player: undefined, message: notice };
      disc.className = player ? `disc ${playerClass(player)}` : 'disc';
      disc.hidden = !player;
      text.textContent = message;
      button.disabled = notice !== undefined || seats[1] === 'remote' || seats[2] === 'remote';
    },
  };
}

type Opponent = Exclude<Seat, 'human'>;

/** Texts for the opponent's turn and win, by who the opponent is. */
const OPPONENT_TEXTS: Readonly<Record<Opponent, { turn: string; wins: string }>> = {
  bot: { turn: 'Computer is thinking…', wins: 'Computer wins!' },
  remote: { turn: "Opponent's turn", wins: 'Opponent wins!' },
};

/** The status message and the player whose disc goes next to it, if any. */
function describe(state: GameState, seats: Seats): { player?: Player; message: string } {
  const { status } = state;
  const opponent = opponentOf(seats);
  // No default branch: TypeScript reports a missing return if a new status kind is added.
  switch (status.kind) {
    case 'playing': {
      const player = state.currentPlayer;
      if (!opponent) return { player, message: `${PLAYER_NAMES[player]}'s turn` };
      const message = seats[player] === 'human' ? 'Your turn' : OPPONENT_TEXTS[opponent].turn;
      return { player, message };
    }
    case 'won': {
      const player = status.winner;
      if (!opponent) return { player, message: `${PLAYER_NAMES[player]} wins!` };
      const message = seats[player] === 'human' ? 'You win!' : OPPONENT_TEXTS[opponent].wins;
      return { player, message };
    }
    case 'draw':
      return { message: 'Draw!' };
  }
}

/** The other seat if exactly one seat is a human, so the texts can speak to them. */
function opponentOf(seats: Seats): Opponent | undefined {
  if (seats[1] === 'human') return seats[2] === 'human' ? undefined : seats[2];
  return seats[2] === 'human' ? seats[1] : undefined;
}
