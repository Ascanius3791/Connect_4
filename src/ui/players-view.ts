import type { Seat, Seats } from '../app/controller';
import type { Player } from '../game/board';
import type { GameState } from '../game/game';
import { opponentOf, PLAYER_NAMES, playerClass } from './players';
import type { Notice } from './status-view';

export interface PlayersView {
  /**
   * Shows who plays each colour in `state`. When a human plays the computer
   * or an online opponent, their card is marked as theirs for the whole
   * game. While the game is on and no `notice` is shown, the card of the
   * player to move carries the turn marker and the other card looks
   * inactive.
   */
  render(state: GameState, seats: Seats, notice?: Notice): void;
}

/** Card names by seat when a human plays against the other seat. */
const SEAT_NAMES: Readonly<Record<Seat, string>> = {
  human: 'You',
  bot: 'Computer',
  remote: 'Opponent',
};

/**
 * Builds one player card in each container (red, then yellow) and returns a
 * view that updates them in place. The cards are not `aria-live`: the status
 * line already announces every turn, so each card only offers one text for
 * screen readers to read on demand, and its visible parts are hidden from them.
 */
export function createPlayersView(containers: Readonly<Record<Player, HTMLElement>>): PlayersView {
  const cards = ([1, 2] as const).map((player) => createCard(containers[player], player));

  return {
    render(state, seats, notice) {
      const opponent = opponentOf(seats);
      const toMove =
        notice === undefined && state.status.kind === 'playing' ? state.currentPlayer : undefined;
      for (const card of cards) {
        const { player } = card;
        const seat = seats[player];
        const colour = PLAYER_NAMES[player];
        const name = opponent ? SEAT_NAMES[seat] : colour;
        const yours = opponent !== undefined && seat === 'human';
        const turn = toMove === player ? turnText(seat) : '';

        card.root.classList.toggle('yours', yours);
        card.root.classList.toggle('to-move', toMove === player);
        card.root.classList.toggle('waiting', toMove !== undefined && toMove !== player);
        card.badge.hidden = !yours;
        card.name.textContent = opponent ? `${name} · ${colour}` : name;
        card.turn.textContent = turn;
        // E.g. "You, red, to move"; the colour name is the card's name in "Two players".
        const parts = opponent ? [name, colour] : [name];
        if (turn) parts.push(turn);
        card.label.textContent = parts.map((part, i) => (i ? part.toLowerCase() : part)).join(', ');
      }
    },
  };
}

/** What the card of the player to move says. */
function turnText(seat: Seat): string {
  return seat === 'bot' ? 'Thinking…' : 'To move';
}

interface Card {
  readonly player: Player;
  readonly root: HTMLElement;
  readonly label: HTMLElement;
  readonly badge: HTMLElement;
  readonly name: HTMLElement;
  readonly turn: HTMLElement;
}

function createCard(container: HTMLElement, player: Player): Card {
  const root = document.createElement('div');
  root.className = `player-card ${playerClass(player)}`;

  const label = document.createElement('p');
  label.className = 'visually-hidden';

  const body = document.createElement('div');
  body.className = 'player-card-body';
  body.setAttribute('aria-hidden', 'true');
  const badge = span('player-card-badge');
  badge.textContent = 'Your colour';
  const disc = span(`disc player-card-disc ${playerClass(player)}`);
  const name = span('player-card-name');
  const turn = span('player-card-turn');
  body.append(badge, disc, name, turn);

  root.append(label, body);
  container.replaceChildren(root);
  return { player, root, label, badge, name, turn };
}

function span(className: string): HTMLElement {
  const node = document.createElement('span');
  node.className = className;
  return node;
}
