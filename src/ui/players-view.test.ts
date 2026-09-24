// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import type { Seats } from '../app/controller';
import type { Player } from '../game/board';
import { newGame, playMove, type GameState } from '../game/game';
import { createPlayersView, type PlayersView } from './players-view';
import type { Notice } from './status-view';

const DRAW_GAME = '231220400060316366502612332554644541451513';
const TWO_HUMANS: Seats = { 1: 'human', 2: 'human' };
const HUMAN_STARTS: Seats = { 1: 'human', 2: 'bot' };
const COMPUTER_STARTS: Seats = { 1: 'bot', 2: 'human' };
const ONLINE_HOST: Seats = { 1: 'human', 2: 'remote' };
const ONLINE_GUEST: Seats = { 1: 'remote', 2: 'human' };
const CONNECTION_LOST: Notice = { text: 'Connection lost', tone: 'error' };

function play(moves: string): GameState {
  return [...moves].reduce((s, c) => playMove(s, Number(c)), newGame());
}

let containers: Record<Player, HTMLElement>;
let view: PlayersView;

beforeEach(() => {
  containers = { 1: document.createElement('div'), 2: document.createElement('div') };
  view = createPlayersView(containers);
});

function card(player: Player): HTMLElement {
  const node = containers[player].querySelector<HTMLElement>('.player-card');
  if (!node) throw new Error(`No card for player ${player}`);
  return node;
}

function name(player: Player): string | null | undefined {
  return card(player).querySelector('.player-card-name')?.textContent;
}

function turnText(player: Player): string | null | undefined {
  return card(player).querySelector('.player-card-turn')?.textContent;
}

function label(player: Player): string | null | undefined {
  return card(player).querySelector('.visually-hidden')?.textContent;
}

/** The player whose card carries the "You" mark, if any. */
function yours(): Player | undefined {
  return ([1, 2] as const).find((player) => card(player).classList.contains('yours'));
}

/** The player whose card carries the turn marker, if any. */
function toMove(): Player | undefined {
  return ([1, 2] as const).find((player) => card(player).classList.contains('to-move'));
}

function waiting(player: Player): boolean {
  return card(player).classList.contains('waiting');
}

describe('createPlayersView', () => {
  it('puts a card with a disc in its colour into each container', () => {
    view.render(newGame(), TWO_HUMANS);
    expect(card(1).classList.contains('player-1')).toBe(true);
    expect(card(2).classList.contains('player-2')).toBe(true);
    for (const player of [1, 2] as const) {
      const disc = card(player).querySelector('.disc');
      expect(disc?.classList.contains(`player-${player}`)).toBe(true);
      expect(disc?.closest('[aria-hidden="true"]')).not.toBeNull();
    }
  });

  it.each([
    ['two players', TWO_HUMANS, 'Red', 'Yellow'],
    ['you start against the computer', HUMAN_STARTS, 'You · Red', 'Computer · Yellow'],
    ['the computer starts', COMPUTER_STARTS, 'Computer · Red', 'You · Yellow'],
    ['online as the host', ONLINE_HOST, 'You · Red', 'Opponent · Yellow'],
    ['online as the guest', ONLINE_GUEST, 'Opponent · Red', 'You · Yellow'],
    ['the computer against itself', { 1: 'bot', 2: 'bot' } as Seats, 'Red', 'Yellow'],
  ])('names the players for %s', (_, seats, red, yellow) => {
    view.render(newGame(), seats);
    expect(name(1)).toBe(red);
    expect(name(2)).toBe(yellow);
  });

  it.each([
    ['you start against the computer', HUMAN_STARTS, 1],
    ['the computer starts', COMPUTER_STARTS, 2],
    ['online as the host', ONLINE_HOST, 1],
    ['online as the guest', ONLINE_GUEST, 2],
    ['two players', TWO_HUMANS, undefined],
  ] as const)('marks your card when %s', (_, seats, player) => {
    view.render(newGame(), seats);
    expect(yours()).toBe(player);
    for (const p of [1, 2] as const) {
      expect(card(p).querySelector<HTMLElement>('.player-card-badge')?.hidden).toBe(p !== player);
    }
  });

  it('keeps the "You" mark on the same card while the turn changes', () => {
    for (const moves of ['', '3', '33', '334']) {
      view.render(play(moves), COMPUTER_STARTS);
      expect(yours()).toBe(2);
    }
  });

  it('puts the turn marker on the player to move and switches it after a move', () => {
    view.render(newGame(), TWO_HUMANS);
    expect(toMove()).toBe(1);
    expect(waiting(2)).toBe(true);
    expect(turnText(1)).toBe('To move');
    expect(turnText(2)).toBe('');

    view.render(play('3'), TWO_HUMANS);
    expect(toMove()).toBe(2);
    expect(waiting(1)).toBe(true);
    expect(turnText(2)).toBe('To move');
    expect(turnText(1)).toBe('');
  });

  it.each([
    ['a win', play('0011223'), undefined],
    ['a draw', play(DRAW_GAME), undefined],
    ['a notice', play('3'), CONNECTION_LOST],
  ])('shows no turn marker after %s but keeps the "You" mark', (_, state, notice) => {
    view.render(state, ONLINE_GUEST, notice);
    expect(toMove()).toBeUndefined();
    expect(waiting(1) || waiting(2)).toBe(false);
    expect(turnText(1)).toBe('');
    expect(turnText(2)).toBe('');
    expect(yours()).toBe(2);
  });

  it("says Thinking… on the computer's card only on its turn", () => {
    view.render(newGame(), HUMAN_STARTS);
    expect(turnText(1)).toBe('To move');
    expect(turnText(2)).toBe('');

    view.render(play('3'), HUMAN_STARTS);
    expect(turnText(1)).toBe('');
    expect(turnText(2)).toBe('Thinking…');

    view.render(play('0011223'), COMPUTER_STARTS);
    expect(turnText(1)).toBe('');
  });

  it('gives screen readers one text per card without announcing it', () => {
    view.render(newGame(), HUMAN_STARTS);
    expect(label(1)).toBe('You, red, to move');
    expect(label(2)).toBe('Computer, yellow');
    view.render(play('3'), HUMAN_STARTS);
    expect(label(1)).toBe('You, red');
    expect(label(2)).toBe('Computer, yellow, thinking…');

    view.render(newGame(), TWO_HUMANS);
    expect(label(1)).toBe('Red, to move');
    expect(label(2)).toBe('Yellow');

    for (const player of [1, 2] as const) {
      expect(containers[player].querySelector('[aria-live]')).toBeNull();
    }
  });
});
