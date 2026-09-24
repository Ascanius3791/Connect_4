import { describe, expect, it } from 'vitest';
import { COLUMNS, ROWS, createBoard, dropDisc, type Board, type Player } from './board';
import { findWin, isDraw, type Position } from './rules';

/**
 * Builds a board from a picture, top line = highest row. 'X' is player 1,
 * 'O' is player 2, '.' is empty. Missing top lines count as empty rows.
 */
function boardFrom(picture: string): Board {
  const lines = picture
    .trim()
    .split('\n')
    .map((line) => line.trim());
  if (lines.length > ROWS || lines.some((line) => line.length !== COLUMNS)) {
    throw new Error(`Picture must have at most ${ROWS} lines of ${COLUMNS} cells`);
  }
  const rows = lines.reverse();
  let board = createBoard();
  for (let column = 0; column < COLUMNS; column++) {
    let top = false;
    for (const line of rows) {
      const symbol = line[column];
      if (symbol === '.') {
        top = true;
        continue;
      }
      if (top) throw new Error(`Floating disc in column ${column}`);
      const player: Player = symbol === 'X' ? 1 : 2;
      board = dropDisc(board, column, player).board;
    }
  }
  return board;
}

function sorted(cells: readonly Position[]): Position[] {
  return [...cells].sort((a, b) => a.column - b.column || a.row - b.row);
}

function expectWin(board: Board, winner: Player, cells: [number, number][]): void {
  const win = findWin(board);
  expect(win?.winner).toBe(winner);
  expect(sorted(win?.cells ?? [])).toEqual(sorted(cells.map(([column, row]) => ({ column, row }))));
}

const DRAW_BOARD = `
  XOXOXOX
  XOXOXOX
  OXOXOXO
  OXOXOXO
  XOXOXOX
  XOXOXOX
`;

describe('findWin', () => {
  it('finds nothing on an empty board', () => {
    expect(findWin(createBoard())).toBeNull();
  });

  it('detects a horizontal win in the bottom-left corner', () => {
    const board = boardFrom(`
      OOO....
      XXXX...
    `);
    expectWin(board, 1, [
      [0, 0],
      [1, 0],
      [2, 0],
      [3, 0],
    ]);
  });

  it('detects a horizontal win in the top row at the right edge', () => {
    const board = boardFrom(`
      ...OOOO
      ...XOXO
      ...OXOX
      ...OXOX
      ...XOXO
      ...XOXO
    `);
    expectWin(board, 2, [
      [3, 5],
      [4, 5],
      [5, 5],
      [6, 5],
    ]);
  });

  it('detects a vertical win in the left column', () => {
    const board = boardFrom(`
      X......
      XO.....
      XO.....
      XO.....
    `);
    expectWin(board, 1, [
      [0, 0],
      [0, 1],
      [0, 2],
      [0, 3],
    ]);
  });

  it('detects a vertical win reaching the top of the right column', () => {
    const board = boardFrom(`
      ......O
      ......O
      ......O
      ......O
      .....OX
      .....XX
    `);
    expectWin(board, 2, [
      [6, 2],
      [6, 3],
      [6, 4],
      [6, 5],
    ]);
  });

  it('detects a rising diagonal from the bottom-left corner', () => {
    const board = boardFrom(`
      ...X...
      ..XO...
      .XOX...
      XOOO...
    `);
    expectWin(board, 1, [
      [0, 0],
      [1, 1],
      [2, 2],
      [3, 3],
    ]);
  });

  it('detects a rising diagonal into the top-right corner', () => {
    const board = boardFrom(`
      ......O
      .....OX
      ....OXO
      ...OOXO
      ...OXOX
      ...OXOX
    `);
    expectWin(board, 2, [
      [3, 2],
      [4, 3],
      [5, 4],
      [6, 5],
    ]);
  });

  it('detects a falling diagonal into the bottom-right corner', () => {
    const board = boardFrom(`
      ...X...
      ...OX..
      ...XOX.
      ...OXOX
    `);
    expectWin(board, 1, [
      [3, 3],
      [4, 2],
      [5, 1],
      [6, 0],
    ]);
  });

  it('does not count three in a row', () => {
    expect(findWin(boardFrom('XXX.OOO'))).toBeNull();
    const board = boardFrom(`
      X..O...
      XXOO...
      XOXO...
    `);
    expect(findWin(board)).toBeNull();
  });

  it('does not count four interrupted by an opponent disc', () => {
    expect(findWin(boardFrom('XXOXX..'))).toBeNull();
    const board = boardFrom(`
      X......
      X......
      O......
      X......
      X......
    `);
    expect(findWin(board)).toBeNull();
  });

  it('counts a line of five as a win with all five cells', () => {
    const board = boardFrom(`
      .OOXOO.
      .XXXXX.
    `);
    expectWin(board, 1, [
      [1, 0],
      [2, 0],
      [3, 0],
      [4, 0],
      [5, 0],
    ]);
  });

  it('returns the cells of every line when one move completes two', () => {
    const board = boardFrom(`
      ...X...
      ...XO..
      ...XOO.
      XXXXOOO
    `);
    expectWin(board, 1, [
      [0, 0],
      [1, 0],
      [2, 0],
      [3, 0],
      [3, 1],
      [3, 2],
      [3, 3],
    ]);
  });

  it('does not mutate the board', () => {
    const board = boardFrom('XXXX...');
    const snapshot = structuredClone(board);
    findWin(board);
    isDraw(board);
    expect(board).toEqual(snapshot);
  });
});

describe('isDraw', () => {
  it('is false on an empty board', () => {
    expect(isDraw(createBoard())).toBe(false);
  });

  it('is false while the board is not full', () => {
    expect(isDraw(boardFrom('XOXOXO.'))).toBe(false);
  });

  it('is true on a full board without a winner', () => {
    const board = boardFrom(DRAW_BOARD);
    expect(findWin(board)).toBeNull();
    expect(isDraw(board)).toBe(true);
  });

  it('is false when the last move fills the board and wins', () => {
    const almostFull = boardFrom(`
      OXOXXX.
      XOXOXOX
      OXOXOXO
      OXOXOXO
      XOXOXOX
      XOXOXOX
    `);
    expect(findWin(almostFull)).toBeNull();
    const board = dropDisc(almostFull, 6, 1).board;
    expectWin(board, 1, [
      [3, 5],
      [4, 5],
      [5, 5],
      [6, 5],
    ]);
    expect(isDraw(board)).toBe(false);
  });
});
