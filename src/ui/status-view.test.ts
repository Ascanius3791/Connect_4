// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { newGame, playMove, type GameState } from '../game/game';
import { createStatusView } from './status-view';

const DRAW_GAME = '231220400060316366502612332554644541451513';

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
    view.render(newGame());
    expect(statusText()).toBe("Red's turn");
    expect(disc()?.className).toBe('disc player-1');
    expect(disc()?.hidden).toBe(false);

    view.render(play('3'));
    expect(statusText()).toBe("Yellow's turn");
    expect(disc()?.className).toBe('disc player-2');
  });

  it('shows the winner after a win', () => {
    const view = createStatusView(container, () => {});
    view.render(play('0011223'));
    expect(statusText()).toBe('Red wins!');
    expect(disc()?.className).toBe('disc player-1');

    view.render(play('60011223'));
    expect(statusText()).toBe('Yellow wins!');
    expect(disc()?.className).toBe('disc player-2');
  });

  it('shows a draw without a disc', () => {
    createStatusView(container, () => {}).render(play(DRAW_GAME));
    expect(statusText()).toBe('Draw!');
    expect(disc()?.hidden).toBe(true);
  });

  it('announces the status to screen readers', () => {
    createStatusView(container, () => {}).render(newGame());
    expect(container.querySelector('.status')?.getAttribute('aria-live')).toBe('polite');
  });

  it('reports clicks on the New game button', () => {
    const onNewGame = vi.fn();
    createStatusView(container, onNewGame).render(play('0011223'));
    const button = container.querySelector<HTMLButtonElement>('button.new-game');
    expect(button?.textContent).toBe('New game');
    expect(button?.disabled).toBe(false);
    button?.click();
    expect(onNewGame).toHaveBeenCalledOnce();
  });
});
