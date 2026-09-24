// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { COLUMNS, ROWS } from '../game/board';
import { newGame, playMove, type GameState } from '../game/game';
import { createBoardView } from './board-view';

function play(moves: string): GameState {
  return [...moves].reduce((s, c) => playMove(s, Number(c)), newGame());
}

let container: HTMLElement;

beforeEach(() => {
  container = document.createElement('div');
});

function columns(): HTMLButtonElement[] {
  return [...container.querySelectorAll<HTMLButtonElement>('.column')];
}

describe('createBoardView', () => {
  it('renders an empty 7 × 6 board for a new game', () => {
    createBoardView(container, () => {}).render(newGame());
    expect(columns()).toHaveLength(COLUMNS);
    expect(container.querySelectorAll('.cell')).toHaveLength(COLUMNS * ROWS);
    expect(container.querySelectorAll('.player-1, .player-2')).toHaveLength(0);
  });

  it('renders each disc in its column and row with its player colour', () => {
    createBoardView(container, () => {}).render(play('3342'));
    expect(container.querySelectorAll('.player-1')).toHaveLength(2);
    expect(container.querySelectorAll('.player-2')).toHaveLength(2);

    const cell = (column: number, row: number) =>
      columns()[column]?.querySelectorAll('.cell')[row]?.className;
    expect(cell(3, 0)).toBe('cell player-1');
    expect(cell(3, 1)).toBe('cell player-2');
    expect(cell(4, 0)).toBe('cell player-1');
    expect(cell(2, 0)).toBe('cell player-2');
    expect(cell(3, 2)).toBe('cell');
  });

  it('updates the same board in place on re-render', () => {
    const view = createBoardView(container, () => {});
    view.render(newGame());
    const board = container.querySelector('.board');
    view.render(play('0'));
    expect(container.querySelector('.board')).toBe(board);
    expect(container.querySelectorAll('.player-1')).toHaveLength(1);
  });

  it('reports the clicked column', () => {
    const onColumnClick = vi.fn();
    createBoardView(container, onColumnClick).render(newGame());
    columns()[5]?.click();
    expect(onColumnClick).toHaveBeenCalledWith(5);
  });

  it('disables full columns', () => {
    createBoardView(container, () => {}).render(play('000000'));
    const disabled = columns().filter((c) => c.disabled);
    expect(disabled).toEqual([columns()[0]]);
  });

  it('disables every column once the game is over', () => {
    createBoardView(container, () => {}).render(play('0011223'));
    expect(columns().every((c) => c.disabled)).toBe(true);
  });

  it('disables every column when not interactive, but still shows the discs', () => {
    const view = createBoardView(container, () => {});
    view.render(play('3'), false);
    expect(columns().every((c) => c.disabled)).toBe(true);
    expect(container.querySelectorAll('.player-1')).toHaveLength(1);
    view.render(play('3'), true);
    expect(columns().every((c) => c.disabled)).toBe(false);
  });

  it('outlines the free cell where a disc in the given column lands', () => {
    const view = createBoardView(container, () => {});
    view.render(play('3342'), true, 3);
    const outlined = [...container.querySelectorAll('.best-move')];
    expect(outlined).toHaveLength(1);
    expect(outlined[0]).toBe(columns()[3]?.querySelectorAll('.cell')[2]);
    expect(outlined[0]?.className).toBe('cell best-move');

    view.render(play('3342'), true, 0);
    expect(container.querySelectorAll('.best-move')).toHaveLength(1);
    expect(columns()[0]?.querySelector('.cell')?.classList.contains('best-move')).toBe(true);
  });

  it('keeps the disc colours next to the outline', () => {
    createBoardView(container, () => {}).render(play('3342'), true, 3);
    const cells = columns()[3]?.querySelectorAll('.cell');
    expect(cells?.[0]?.className).toBe('cell player-1');
    expect(cells?.[1]?.className).toBe('cell player-2');
  });

  it('removes the outline when rendered without one', () => {
    const view = createBoardView(container, () => {});
    view.render(newGame(), true, 3);
    view.render(newGame(), true);
    expect(container.querySelectorAll('.best-move')).toHaveLength(0);
  });

  it('outlines nothing in a full column', () => {
    createBoardView(container, () => {}).render(play('000000'), true, 0);
    expect(container.querySelectorAll('.best-move')).toHaveLength(0);
  });
});
