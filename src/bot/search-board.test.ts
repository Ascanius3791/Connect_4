import { describe, expect, it } from 'vitest';
import {
  COLUMNS,
  ROWS,
  dropDisc,
  getCell,
  legalColumns,
  type Board,
  type Cell,
} from '../game/board';
import { newGame, playMove, type GameState } from '../game/game';
import { findWin } from '../game/rules';
import { SEARCH_ORDER, SearchBoard } from './search-board';

/** Small seeded generator (mulberry32), so the random games are the same on every run. */
function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function play(moves: string): GameState {
  return [...moves].reduce((s, c) => {
    const next = playMove(s, Number(c));
    if (next === s) throw new Error(`Move ${c} was rejected`);
    return next;
  }, newGame());
}

function discs(board: SearchBoard): Cell[][] {
  return Array.from({ length: COLUMNS }, (_, c) =>
    Array.from({ length: ROWS }, (_, r) => board.cell(c, r)),
  );
}

function modelDiscs(board: Board): Cell[][] {
  return Array.from({ length: COLUMNS }, (_, c) =>
    Array.from({ length: ROWS }, (_, r) => getCell(board, c, r)),
  );
}

/** Everything observable about a search board, to compare before and after an undo. */
function snapshot(board: SearchBoard) {
  return {
    discs: discs(board),
    player: board.currentPlayer,
    moveCount: board.moveCount,
    legal: board.legalColumns(),
    full: board.isFull(),
    wins: [0, 1, 2, 3, 4, 5, 6].map((c) => board.isWinningMove(c)),
  };
}

function expectMatches(board: SearchBoard, state: GameState): void {
  expect(discs(board)).toEqual(modelDiscs(state.board));
  expect(board.currentPlayer).toBe(state.currentPlayer);
  expect(board.moveCount).toBe(state.history.length);
  expect(board.legalColumns()).toEqual(legalColumns(state.board));
  expect(board.isFull()).toBe(legalColumns(state.board).length === 0);
}

/**
 * Plays one game through both the search board and `playMove`, comparing
 * them before and after every move, then undoes every move and checks that
 * each earlier position comes back. Returns how the game ended.
 */
function playThrough(pick: (legal: number[], turn: number) => number): 'won' | 'draw' {
  const board = new SearchBoard();
  let state = newGame();
  const snapshots: ReturnType<typeof snapshot>[] = [];
  while (state.status.kind === 'playing') {
    const legal = legalColumns(state.board);
    // Every legal column's win check agrees with findWin on the model.
    for (const column of legal) {
      const after = dropDisc(state.board, column, state.currentPlayer).board;
      expect(board.isWinningMove(column)).toBe(findWin(after) !== null);
    }
    const column = pick(legal, state.history.length);
    const wins = board.isWinningMove(column);
    snapshots.push(snapshot(board));
    board.play(column);
    state = playMove(state, column);
    expectMatches(board, state);
    expect(state.status.kind === 'won').toBe(wins);
    expect(state.status.kind === 'draw').toBe(board.isFull() && !wins);
  }
  for (let i = snapshots.length - 1; i >= 0; i--) {
    board.undo();
    expect(snapshot(board)).toEqual(snapshots[i]);
  }
  expectMatches(board, newGame());
  return state.status.kind;
}

/** A full game of 42 moves that ends without four in a row. */
const DRAW_GAME = '231220400060316366502612332554644541451513';

describe('SearchBoard', () => {
  it('starts empty with red to move', () => {
    const board = new SearchBoard();
    expectMatches(board, newGame());
    expect(board.isFull()).toBe(false);
  });

  // About a second on its own; the timeout leaves room for a busy CI runner.
  it(
    'agrees with the game model through many random games, and undoes back to empty',
    {
      timeout: 30_000,
    },
    () => {
      const random = seededRandom(31);
      for (let game = 0; game < 200; game++) {
        playThrough((legal) => legal[Math.floor(random() * legal.length)] ?? -1);
      }
    },
  );

  it('agrees with the game model through a drawn game, and undoes back to empty', () => {
    const moves = [...DRAW_GAME].map(Number);
    expect(playThrough((_, turn) => moves[turn] ?? -1)).toBe('draw');
  });

  it('builds the same position from any game state, including finished ones', () => {
    const random = seededRandom(7);
    for (let game = 0; game < 100; game++) {
      let state = newGame();
      const stop = Math.floor(random() * 43);
      while (state.status.kind === 'playing' && state.history.length < stop) {
        const legal = legalColumns(state.board);
        state = playMove(state, legal[Math.floor(random() * legal.length)] ?? -1);
      }
      expectMatches(SearchBoard.fromState(state), state);
    }
  });

  it('builds a drawn, full board', () => {
    const state = play(DRAW_GAME);
    expect(state.status.kind).toBe('draw');
    const board = SearchBoard.fromState(state);
    expectMatches(board, state);
    expect(board.isFull()).toBe(true);
    expect(board.legalColumns()).toEqual([]);
    expect(board.canPlay(3)).toBe(false);
  });

  it('asks about a win without changing the board', () => {
    const board = SearchBoard.fromMoves([0, 6, 1, 6, 2, 6]);
    const before = snapshot(board);
    expect(board.isWinningMove(3)).toBe(true);
    expect(snapshot(board)).toEqual(before);
  });

  describe('finds wins in all four directions', () => {
    // Each case: moves before the winning one, the winning column, and a
    // column that does not win in the same position.
    const cases: [name: string, moves: string, win: number, noWin: number][] = [
      ['horizontal, at the end of the line', '061626', 3, 4],
      ['horizontal, in the middle of the line', '061636', 2, 4],
      ['horizontal, on the right', '605040', 3, 2],
      ['horizontal, in the middle, across the centre', '263656', 4, 1],
      ['vertical', '010101', 0, 2],
      ['vertical, on the right', '656565', 6, 4],
      ['rising diagonal, at the top', '0112232336', 3, 4],
      ['rising diagonal, in the middle', '0112323336', 2, 4],
      ['falling diagonal, at the bottom', '6554434330', 3, 2],
      ['falling diagonal, in the middle', '6554343330', 4, 2],
    ];
    for (const [name, moves, win, noWin] of cases) {
      it(name, () => {
        const state = play(moves);
        expect(state.status.kind).toBe('playing');
        const board = SearchBoard.fromState(state);
        expect(board.isWinningMove(win)).toBe(true);
        expect(board.isWinningMove(noWin)).toBe(false);
        // Cross-check the hand-picked position against the game's own rules.
        expect(playMove(state, win).status).toMatchObject({
          kind: 'won',
          winner: state.currentPlayer,
        });
        expect(playMove(state, noWin).status.kind).toBe('playing');
      });
    }
  });

  it('does not count lines that wrap from the top of one column into the next', () => {
    // Red holds rows 3-5 of column 3 and plays row 0 of column 4, which
    // would be the next bit without the spare bit on top of each column.
    const state = play('3303303030');
    const board = SearchBoard.fromState(state);
    expect([board.cell(3, 3), board.cell(3, 4), board.cell(3, 5)]).toEqual([1, 1, 1]);
    expect(board.currentPlayer).toBe(1);
    expect(board.isWinningMove(4)).toBe(false);
    expect(playMove(state, 4).status.kind).toBe('playing');
  });

  it('only accepts playable columns', () => {
    const board = SearchBoard.fromMoves([0, 0, 0, 0, 0, 0]);
    expect(board.canPlay(0)).toBe(false);
    expect(board.isWinningMove(0)).toBe(false);
    expect(() => board.play(0)).toThrow(RangeError);
    for (const column of [-1, 7, 1.5, Number.NaN]) {
      expect(board.canPlay(column)).toBe(false);
      expect(board.isWinningMove(column)).toBe(false);
      expect(() => board.play(column)).toThrow(RangeError);
    }
    expect(board.moveCount).toBe(6);
    expect(() => board.cell(7, 0)).toThrow(RangeError);
    expect(() => board.cell(0, 6)).toThrow(RangeError);
  });

  it('refuses to undo on an empty board', () => {
    expect(() => new SearchBoard().undo()).toThrow();
  });
});

describe('SEARCH_ORDER', () => {
  it('lists every column once, centre first', () => {
    expect([...SEARCH_ORDER].sort()).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(SEARCH_ORDER[0]).toBe(3);
    const distances = SEARCH_ORDER.map((c) => Math.abs(c - 3));
    expect(distances).toEqual([...distances].sort());
  });
});
