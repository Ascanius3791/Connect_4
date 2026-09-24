import type { Player } from '../game/board';
import type { GameState } from '../game/game';
import { PLAYER_NAMES, playerClass } from './players';

export interface StatusView {
  /** Shows whose turn it is in `state`, or how its game ended. */
  render(state: GameState): void;
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
    render(state) {
      const { player, message } = describe(state);
      disc.className = player ? `disc ${playerClass(player)}` : 'disc';
      disc.hidden = !player;
      text.textContent = message;
    },
  };
}

/** The status message and the player whose disc goes next to it, if any. */
function describe(state: GameState): { player?: Player; message: string } {
  const { status } = state;
  // No default branch: TypeScript reports a missing return if a new status kind is added.
  switch (status.kind) {
    case 'playing':
      return {
        player: state.currentPlayer,
        message: `${PLAYER_NAMES[state.currentPlayer]}'s turn`,
      };
    case 'won':
      return { player: status.winner, message: `${PLAYER_NAMES[status.winner]} wins!` };
    case 'draw':
      return { message: 'Draw!' };
  }
}
