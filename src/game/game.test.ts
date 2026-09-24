import { describe, expect, it } from 'vitest';
import { COLUMNS, ROWS, getCell } from './board';
import { canPlay, newGame, playMove, type GameState } from './game';

function play(moves: string, state: GameState = newGame()): GameState {
  return [...moves].reduce((s, c) => {
    const next = playMove(s, Number(c));
    if (next === s) throw new Error(`Move ${c} was rejected`);
    return next;
  }, state);
}

/** A full game of 42 moves that ends without four in a row. */
const DRAW_GAME = '231220400060316366502612332554644541451513';

describe('newGame', () => {
  it('starts with an empty board, player 1 to move, playing and no history', () => {
    const state = newGame();
    for (let column = 0; column < COLUMNS; column++) {
      for (let row = 0; row < ROWS; row++) {
        expect(getCell(state.board, column, row)).toBe(0);
      }
    }
    expect(state.currentPlayer).toBe(1);
    expect(state.status).toEqual({ kind: 'playing' });
    expect(state.history).toEqual([]);
  });
});

describe('playMove', () => {
  it('drops a disc for the current player and alternates turns', () => {
    const first = playMove(newGame(), 3);
    expect(getCell(first.board, 3, 0)).toBe(1);
    expect(first.currentPlayer).toBe(2);

    const second = playMove(first, 3);
    expect(getCell(second.board, 3, 1)).toBe(2);
    expect(second.currentPlayer).toBe(1);
  });

  it('records every move in the history', () => {
    expect(play('3342').history).toEqual([3, 3, 4, 2]);
  });

  it('does not modify the previous state', () => {
    const before = play('33');
    const snapshot = JSON.stringify(before);
    playMove(before, 4);
    expect(JSON.stringify(before)).toBe(snapshot);
  });

  it('ends in a win with the winner and winning cells', () => {
    // Player 1 builds a horizontal line on the bottom row, player 2 stacks on top.
    const state = play('0011223');
    expect(state.status).toEqual({
      kind: 'won',
      winner: 1,
      cells: [
        { column: 0, row: 0 },
        { column: 1, row: 0 },
        { column: 2, row: 0 },
        { column: 3, row: 0 },
      ],
    });
  });

  it('keeps the game going until the winning move', () => {
    expect(play('001122').status).toEqual({ kind: 'playing' });
  });

  it('ends in a draw when the last move fills the board without a win', () => {
    const beforeLast = play(DRAW_GAME.slice(0, -1));
    expect(beforeLast.status).toEqual({ kind: 'playing' });

    const state = play(DRAW_GAME);
    expect(state.status).toEqual({ kind: 'draw' });
    expect(state.history).toHaveLength(COLUMNS * ROWS);
  });

  it('rejects moves after a win', () => {
    const won = play('0011223');
    expect(canPlay(won, 4)).toBe(false);
    expect(playMove(won, 4)).toBe(won);
  });

  it('rejects moves after a draw', () => {
    const drawn = play(DRAW_GAME);
    expect(playMove(drawn, 0)).toBe(drawn);
  });

  it('rejects a move into a full column', () => {
    const state = play('000000');
    expect(canPlay(state, 0)).toBe(false);
    expect(playMove(state, 0)).toBe(state);
    expect(state.history).toHaveLength(6);
  });

  it.each([-1, COLUMNS, 1.5, NaN])('rejects the invalid column %s', (column) => {
    const state = play('3');
    expect(canPlay(state, column)).toBe(false);
    expect(playMove(state, column)).toBe(state);
  });
});

describe('serialisation', () => {
  it('survives a JSON round-trip mid-game', () => {
    const state = play('33425');
    const copy = JSON.parse(JSON.stringify(state)) as GameState;
    expect(copy).toEqual(state);
    expect(playMove(copy, 4)).toEqual(playMove(state, 4));
  });

  it('survives a JSON round-trip after a win', () => {
    const state = play('0011223');
    expect(JSON.parse(JSON.stringify(state))).toEqual(state);
  });
});
