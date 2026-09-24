import { describe, expect, it } from 'vitest';
import { COLUMNS, ROWS, createBoard, dropDisc, getCell, legalColumns, type Board } from './board';

function fillColumn(board: Board, column: number): Board {
  let next = board;
  for (let i = 0; i < ROWS; i++) {
    next = dropDisc(next, column, i % 2 === 0 ? 1 : 2).board;
  }
  return next;
}

describe('createBoard', () => {
  it('returns an empty 7 x 6 board', () => {
    expect(COLUMNS).toBe(7);
    expect(ROWS).toBe(6);
    const board = createBoard();
    for (let column = 0; column < COLUMNS; column++) {
      for (let row = 0; row < ROWS; row++) {
        expect(getCell(board, column, row)).toBe(0);
      }
    }
    expect(legalColumns(board)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });
});

describe('dropDisc', () => {
  it('places a disc in the bottom row of an empty column', () => {
    const { board, row } = dropDisc(createBoard(), 3, 1);
    expect(row).toBe(0);
    expect(getCell(board, 3, 0)).toBe(1);
    expect(getCell(board, 3, 1)).toBe(0);
  });

  it('stacks discs in one column', () => {
    const first = dropDisc(createBoard(), 2, 1);
    const second = dropDisc(first.board, 2, 2);
    const third = dropDisc(second.board, 2, 1);
    expect([first.row, second.row, third.row]).toEqual([0, 1, 2]);
    expect(getCell(third.board, 2, 0)).toBe(1);
    expect(getCell(third.board, 2, 1)).toBe(2);
    expect(getCell(third.board, 2, 2)).toBe(1);
    expect(getCell(third.board, 2, 3)).toBe(0);
  });

  it('fills a column to the top row', () => {
    let board = createBoard();
    for (let row = 0; row < ROWS; row++) {
      const result = dropDisc(board, 0, 1);
      expect(result.row).toBe(row);
      board = result.board;
    }
    expect(getCell(board, 0, ROWS - 1)).toBe(1);
  });

  it('rejects a full column and leaves the board unchanged', () => {
    const board = fillColumn(createBoard(), 4);
    const snapshot = structuredClone(board);
    expect(() => dropDisc(board, 4, 1)).toThrow('Column 4 is full');
    expect(board).toEqual(snapshot);
  });

  it.each([-1, 7, 1.5])('rejects out-of-range column %s', (column) => {
    const board = createBoard();
    const snapshot = structuredClone(board);
    expect(() => dropDisc(board, column, 1)).toThrow(RangeError);
    expect(board).toEqual(snapshot);
  });

  it('does not mutate the input board', () => {
    const board = dropDisc(createBoard(), 1, 2).board;
    const snapshot = structuredClone(board);
    const result = dropDisc(board, 1, 1);
    expect(board).toEqual(snapshot);
    expect(getCell(board, 1, 1)).toBe(0);
    expect(getCell(result.board, 1, 1)).toBe(1);
  });
});

describe('legalColumns', () => {
  it('shrinks as columns fill', () => {
    let board = fillColumn(createBoard(), 0);
    expect(legalColumns(board)).toEqual([1, 2, 3, 4, 5, 6]);
    board = fillColumn(board, 6);
    expect(legalColumns(board)).toEqual([1, 2, 3, 4, 5]);
    for (let column = 1; column < 6; column++) board = fillColumn(board, column);
    expect(legalColumns(board)).toEqual([]);
  });

  it('keeps partially filled columns legal', () => {
    const board = dropDisc(createBoard(), 3, 1).board;
    expect(legalColumns(board)).toContain(3);
  });
});

describe('getCell', () => {
  it('rejects out-of-range coordinates', () => {
    const board = createBoard();
    expect(() => getCell(board, -1, 0)).toThrow(RangeError);
    expect(() => getCell(board, COLUMNS, 0)).toThrow(RangeError);
    expect(() => getCell(board, 0, -1)).toThrow(RangeError);
    expect(() => getCell(board, 0, ROWS)).toThrow(RangeError);
  });
});
