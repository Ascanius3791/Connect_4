// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Seats } from '../app/controller';
import { newGame, playMove, type GameState } from '../game/game';
import { createStatusView } from './status-view';

const DRAW_GAME = '231220400060316366502612332554644541451513';
const TWO_HUMANS: Seats = { 1: 'human', 2: 'human' };
const HUMAN_STARTS: Seats = { 1: 'human', 2: 'bot' };
const COMPUTER_STARTS: Seats = { 1: 'bot', 2: 'human' };
const ONLINE_HOST: Seats = { 1: 'human', 2: 'remote' };
const ONLINE_GUEST: Seats = { 1: 'remote', 2: 'human' };

function play(moves: string): GameState {
  return [...moves].reduce((s, c) => playMove(s, Number(c)), newGame());
}

let container: HTMLElement;

beforeEach(() => {
  container = document.createElement('div');
});

function statusText(): string | null | undefined {
  return container.querySelector('.status')?.textContent;
}

function disc(): HTMLElement | null {
  return container.querySelector('.disc');
}

describe('createStatusView', () => {
  it("shows whose turn it is with that player's disc while playing", () => {
    const view = createStatusView(container, () => {});
    view.render(newGame(), TWO_HUMANS);
    expect(statusText()).toBe("Red's turn");
    expect(disc()?.className).toBe('disc player-1');
    expect(disc()?.hidden).toBe(false);

    view.render(play('3'), TWO_HUMANS);
    expect(statusText()).toBe("Yellow's turn");
    expect(disc()?.className).toBe('disc player-2');
  });

  it('shows the winner after a win', () => {
    const view = createStatusView(container, () => {});
    view.render(play('0011223'), TWO_HUMANS);
    expect(statusText()).toBe('Red wins!');
    expect(disc()?.className).toBe('disc player-1');

    view.render(play('60011223'), TWO_HUMANS);
    expect(statusText()).toBe('Yellow wins!');
    expect(disc()?.className).toBe('disc player-2');
  });

  it('shows a draw without a disc', () => {
    createStatusView(container, () => {}).render(play(DRAW_GAME), TWO_HUMANS);
    expect(statusText()).toBe('Draw!');
    expect(disc()?.hidden).toBe(true);
  });

  it('announces the status to screen readers', () => {
    createStatusView(container, () => {}).render(newGame(), TWO_HUMANS);
    expect(container.querySelector('.status')?.getAttribute('aria-live')).toBe('polite');
  });

  it('shows a notice instead of the game status and disables New game', () => {
    const view = createStatusView(container, () => {});
    view.render(play('3'), TWO_HUMANS, { text: 'Waiting for opponent…', tone: 'progress' });
    expect(statusText()).toBe('Waiting for opponent…');
    expect(disc()?.hidden).toBe(true);
    expect(container.querySelector<HTMLButtonElement>('button.new-game')?.disabled).toBe(true);

    view.render(play('3'), TWO_HUMANS);
    expect(statusText()).toBe("Yellow's turn");
    expect(disc()?.hidden).toBe(false);
    expect(container.querySelector<HTMLButtonElement>('button.new-game')?.disabled).toBe(false);
  });

  it.each(['progress', 'error'] as const)(
    'marks a %s notice on the status line until it is cleared',
    (tone) => {
      const view = createStatusView(container, () => {});
      view.render(newGame(), TWO_HUMANS, { text: 'Connection lost', tone });
      expect(container.querySelector('.status')?.className).toBe(`status notice-${tone}`);

      view.render(newGame(), TWO_HUMANS);
      expect(container.querySelector('.status')?.className).toBe('status');
    },
  );

  it('reports clicks on the New game button', () => {
    const onNewGame = vi.fn();
    createStatusView(container, onNewGame).render(play('0011223'), TWO_HUMANS);
    const button = container.querySelector<HTMLButtonElement>('button.new-game');
    expect(button?.textContent).toBe('New game');
    expect(button?.disabled).toBe(false);
    button?.click();
    expect(onNewGame).toHaveBeenCalledOnce();
  });
});

describe('createStatusView against the computer', () => {
  it.each([
    ['you start', HUMAN_STARTS, '', 'Your turn', 'player-1'],
    ['you start', HUMAN_STARTS, '3', 'Computer is thinking…', 'player-2'],
    ['the computer starts', COMPUTER_STARTS, '', 'Computer is thinking…', 'player-1'],
    ['the computer starts', COMPUTER_STARTS, '3', 'Your turn', 'player-2'],
  ])('speaks to the human while playing when %s (moves "%s")', (_, seats, moves, text, player) => {
    createStatusView(container, () => {}).render(play(moves), seats);
    expect(statusText()).toBe(text);
    expect(disc()?.className).toBe(`disc ${player}`);
  });

  it.each([
    ['you start and win', HUMAN_STARTS, '0011223', 'You win!'],
    ['you start and lose', HUMAN_STARTS, '60011223', 'Computer wins!'],
    ['the computer starts and wins', COMPUTER_STARTS, '0011223', 'Computer wins!'],
    ['the computer starts and you win', COMPUTER_STARTS, '60011223', 'You win!'],
  ])('names the winner from the human point of view when %s', (_, seats, moves, text) => {
    createStatusView(container, () => {}).render(play(moves), seats);
    expect(statusText()).toBe(text);
  });

  it.each([HUMAN_STARTS, COMPUTER_STARTS])('shows a draw without a disc', (seats) => {
    createStatusView(container, () => {}).render(play(DRAW_GAME), seats);
    expect(statusText()).toBe('Draw!');
    expect(disc()?.hidden).toBe(true);
  });

  it('uses colour names when the computer plays both sides', () => {
    createStatusView(container, () => {}).render(play('0011223'), { 1: 'bot', 2: 'bot' });
    expect(statusText()).toBe('Red wins!');
  });
});

describe('createStatusView in an online game', () => {
  it.each([
    ['the host', ONLINE_HOST, '', 'Your turn'],
    ['the host', ONLINE_HOST, '3', "Opponent's turn"],
    ['the guest', ONLINE_GUEST, '', "Opponent's turn"],
    ['the guest', ONLINE_GUEST, '3', 'Your turn'],
    ['the host', ONLINE_HOST, '0011223', 'You win!'],
    ['the guest', ONLINE_GUEST, '0011223', 'Opponent wins!'],
    ['the host', ONLINE_HOST, '60011223', 'Opponent wins!'],
    ['the guest', ONLINE_GUEST, '60011223', 'You win!'],
    ['the host', ONLINE_HOST, DRAW_GAME, 'Draw!'],
  ])('speaks to %s (moves "%s")', (_, seats, moves, text) => {
    createStatusView(container, () => {}).render(play(moves), seats);
    expect(statusText()).toBe(text);
  });

  it('disables New game', () => {
    createStatusView(container, () => {}).render(play('0011223'), ONLINE_GUEST);
    expect(container.querySelector<HTMLButtonElement>('button.new-game')?.disabled).toBe(true);
  });
});
