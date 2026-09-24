import type { Seats } from '../app/controller';
import type { Player } from '../game/board';
import type { GameState } from '../game/game';
import { PLAYER_NAMES, playerClass } from './players';

export interface StatusView {
  /**
   * Shows whose turn it is in `state`, or how its game ended. When a human
   * plays the computer, the texts speak to the human ("Your turn",
   * "You win!"); otherwise they name the colours. A `notice` (e.g. the
   * state of an online connection) replaces the game's status and disables
   * "New game" while it is shown.
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
      button.disabled = notice !== undefined;
    },
  };
}

/** The status message and the player whose disc goes next to it, if any. */
function describe(state: GameState, seats: Seats): { player?: Player; message: string } {
  const { status } = state;
  const againstComputer = isAgainstComputer(seats);
  // No default branch: TypeScript reports a missing return if a new status kind is added.
  switch (status.kind) {
    case 'playing': {
      const player = state.currentPlayer;
      if (!againstComputer) return { player, message: `${PLAYER_NAMES[player]}'s turn` };
      const message = seats[player] === 'human' ? 'Your turn' : 'Computer is thinking…';
      return { player, message };
    }
    case 'won': {
      const player = status.winner;
      if (!againstComputer) return { player, message: `${PLAYER_NAMES[player]} wins!` };
      return { player, message: seats[player] === 'human' ? 'You win!' : 'Computer wins!' };
    }
    case 'draw':
      return { message: 'Draw!' };
  }
}

/** True if one seat is a human and the other the computer. */
function isAgainstComputer(seats: Seats): boolean {
  const kinds = [seats[1], seats[2]];
  return kinds.includes('human') && kinds.includes('bot');
}
