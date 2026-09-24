import { describe, expect, it } from 'vitest';
import { COLUMNS, ROWS, type Cell, type Player } from '../game/board';
import {
  CENTRE_WEIGHT,
  GROUP_COUNT,
  MAX_HEURISTIC_SCORE,
  THREE_WEIGHT,
  TWO_WEIGHT,
  WIN_SCORE,
  evaluate,
  scoreDiscs,
} from './evaluate';
import { SearchBoard, cellBits } from './search-board';

/** Small seeded generator (mulberry32), so the random positions are the same on every run. */
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

/** Move lists of random positions that nobody has won, of every length. */
function randomPositions(count: number, seed: number): number[][] {
  const random = seededRandom(seed);
  const positions: number[][] = [];
  while (positions.length < count) {
    const board = new SearchBoard();
    const moves: number[] = [];
    const length = Math.floor(random() * 43);
    while (moves.length < length) {
      const legal = board.legalColumns();
      const column = legal[Math.floor(random() * legal.length)];
      if (column === undefined || board.isWinningMove(column)) break;
      board.play(column);
      moves.push(column);
    }
    positions.push(moves);
  }
  return positions;
}

const evaluateMoves = (moves: readonly number[]): number => evaluate(SearchBoard.fromMoves(moves));

type Grid = Cell[][];

function grid(board: SearchBoard): Grid {
  return Array.from({ length: COLUMNS }, (_, c) =>
    Array.from({ length: ROWS }, (_, r) => board.cell(c, r)),
  );
}

const other = (player: Player): Player => (player === 1 ? 2 : 1);

/** The discs of `player` in `cells` as (low, high) bits. */
function bitsOf(cells: Grid, player: Player): [number, number] {
  let low = 0;
  let high = 0;
  cells.forEach((column, c) =>
    column.forEach((cell, r) => {
      if (cell !== player) return;
      const [l, h] = cellBits(c, r);
      low |= l;
      high |= h;
    }),
  );
  return [low, high];
}

/** Score of `cells` for `mover`, through the bit-level scorer. */
function scoreGrid(cells: Grid, mover: Player): number {
  const [ownLow, ownHigh] = bitsOf(cells, mover);
  const [opponentLow, opponentHigh] = bitsOf(cells, other(mover));
  return scoreDiscs(ownLow, ownHigh, opponentLow, opponentHigh);
}

/** Straightforward cell-by-cell version of the scoring rules, to check the bit version against. */
function referenceScore(cells: Grid, mover: Player): number {
  const weights = [0, 0, TWO_WEIGHT, THREE_WEIGHT, THREE_WEIGHT];
  let score = 0;
  let groups = 0;
  for (const [dc, dr] of [
    [1, 0],
    [0, 1],
    [1, 1],
    [1, -1],
  ] as const) {
    for (let c = 0; c < COLUMNS; c++) {
      for (let r = 0; r < ROWS; r++) {
        const line: Cell[] = [];
        for (let i = 0; i < 4; i++) {
          const cell = cells[c + i * dc]?.[r + i * dr];
          if (cell !== undefined) line.push(cell);
        }
        if (line.length < 4) continue;
        groups++;
        const own = line.filter((cell) => cell === mover).length;
        const opponent = line.filter((cell) => cell === other(mover)).length;
        if (opponent === 0) score += weights[own] ?? 0;
        if (own === 0) score -= weights[opponent] ?? 0;
      }
    }
  }
  expect(groups).toBe(69);
  for (const cell of cells[3] ?? []) {
    if (cell === mover) score += CENTRE_WEIGHT;
    if (cell === other(mover)) score -= CENTRE_WEIGHT;
  }
  return score;
}

describe('evaluate', () => {
  it('lists the 69 groups of four', () => {
    expect(GROUP_COUNT).toBe(69);
  });

  it('scores the empty board 0', () => {
    expect(evaluateMoves([])).toBe(0);
  });

  it('favours the owner of a single centre disc', () => {
    // Yellow to move after red's centre disc: the centre bonus alone, as a
    // single disc makes no two in any group.
    const board = SearchBoard.fromMoves([3]);
    expect(evaluate(board)).toBe(-CENTRE_WEIGHT);
    // The same discs from red's view.
    expect(scoreGrid(grid(board), 1)).toBe(CENTRE_WEIGHT);
  });

  it('scores an open three higher than an open two', () => {
    const two = emptyGrid();
    setCell(two, 0, 0, 1);
    setCell(two, 1, 0, 1);
    const three = emptyGrid();
    setCell(three, 0, 0, 1);
    setCell(three, 1, 0, 1);
    setCell(three, 2, 0, 1);
    expect(scoreGrid(two, 1)).toBe(TWO_WEIGHT);
    expect(scoreGrid(three, 1)).toBeGreaterThan(scoreGrid(two, 1));
    // From the opponent's view the same positions are bad.
    expect(scoreGrid(two, 2)).toBe(-TWO_WEIGHT);
  });

  it('counts a group blocked by the other colour for nobody', () => {
    // Red's two in the bottom-left group scores for red while it is open.
    const cells = emptyGrid();
    setCell(cells, 0, 0, 1);
    setCell(cells, 1, 0, 1);
    expect(scoreGrid(cells, 1)).toBe(TWO_WEIGHT);
    // A yellow disc at (2, 0) blocks both groups that hold the two red
    // discs; yellow's single disc makes no two either, so nobody scores.
    setCell(cells, 2, 0, 2);
    expect(scoreGrid(cells, 1)).toBe(0);
    // Three red discs and a yellow one in the bottom-left group: that group
    // still counts for nobody, only red's centre disc at (3, 0) scores.
    setCell(cells, 3, 0, 1);
    expect(scoreGrid(cells, 1)).toBe(CENTRE_WEIGHT);
  });

  it('matches a cell-by-cell reference on random positions', () => {
    for (const moves of randomPositions(500, 1)) {
      const board = SearchBoard.fromMoves(moves);
      expect(evaluate(board)).toBe(referenceScore(grid(board), board.currentPlayer));
    }
  });

  it('gives the same score after swapping all colours and the turn', () => {
    for (const moves of randomPositions(300, 2)) {
      const board = SearchBoard.fromMoves(moves);
      const cells = grid(board);
      const swapped = cells.map((column) =>
        column.map((cell): Cell => (cell === 0 ? 0 : other(cell))),
      );
      expect(scoreGrid(swapped, other(board.currentPlayer))).toBe(evaluate(board));
      // Swapping only the colours, not the turn, flips the sign.
      expect(scoreGrid(swapped, board.currentPlayer)).toBe(0 - evaluate(board));
    }
  });

  it('gives the same score for the mirrored board', () => {
    for (const moves of randomPositions(300, 3)) {
      const mirrored = moves.map((column) => COLUMNS - 1 - column);
      expect(evaluateMoves(mirrored)).toBe(evaluateMoves(moves));
    }
  });

  it('keeps heuristic scores within the bound, far below a win', () => {
    expect(MAX_HEURISTIC_SCORE * 100).toBeLessThan(WIN_SCORE);
    for (const moves of randomPositions(1000, 4)) {
      expect(Math.abs(evaluateMoves(moves))).toBeLessThanOrEqual(MAX_HEURISTIC_SCORE);
    }
  });
});

function emptyGrid(): Grid {
  return Array.from({ length: COLUMNS }, () => Array.from({ length: ROWS }, (): Cell => 0));
}

function setCell(cells: Grid, column: number, row: number, cell: Cell): void {
  const target = cells[column];
  if (!target) throw new RangeError(`Column ${column}`);
  target[row] = cell;
}
