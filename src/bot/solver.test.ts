import { describe, expect, it } from 'vitest';
import { COLUMNS, ROWS } from '../game/board';
import { newGame, playMove, type GameState } from '../game/game';
import { SearchBoard } from './search-board';
import { searchMove } from './search';
import { Solver, type SolverValue } from './solver';

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

/** Column indexes from a string of column digits 1-7, as in Pons' test files. */
function moves(digits: string): number[] {
  return [...digits].map((digit) => Number(digit) - 1);
}

function stateAfter(columns: readonly number[]): GameState {
  return columns.reduce((state, column) => {
    const next = playMove(state, column);
    if (next === state) throw new Error(`Move ${column} was rejected`);
    return next;
  }, newGame());
}

/**
 * Random positions of games still in progress with `minMoves` to
 * `maxMoves` discs. Both sides play random moves that do not win, so the
 * games get that far.
 */
function randomPositions(
  count: number,
  minMoves: number,
  maxMoves: number,
  seed: number,
): number[][] {
  const random = seededRandom(seed);
  const positions: number[][] = [];
  while (positions.length < count) {
    const target = minMoves + Math.floor(random() * (maxMoves - minMoves + 1));
    const board = new SearchBoard();
    const history: number[] = [];
    while (history.length < target) {
      const quiet = board.legalColumns().filter((column) => !board.isWinningMove(column));
      const column = quiet[Math.floor(random() * quiet.length)];
      if (column === undefined) break;
      board.play(column);
      history.push(column);
    }
    if (history.length === target) positions.push(history);
  }
  return positions;
}

/** The value for the player to move according to a search to the end of the game. */
function referenceValue(columns: readonly number[]): SolverValue {
  const state = stateAfter(columns);
  const { result } = searchMove(state, { maxDepth: COLUMNS * ROWS - columns.length });
  if (result.kind === 'win') return result.player === state.currentPlayer ? 'win' : 'loss';
  if (result.kind === 'draw') return 'draw';
  throw new Error('The search did not reach the end of the game');
}

describe('Solver', () => {
  const solver = new Solver({ tableBits: 16 });

  it('agrees with a search to the end of the game on random late positions', () => {
    const positions = randomPositions(500, COLUMNS * ROWS - 14, COLUMNS * ROWS - 1, 38);
    const values = new Set<SolverValue>();
    for (const position of positions) {
      const expected = referenceValue(position);
      expect(solver.solve(position), position.join('')).toBe(expected);
      values.add(expected);
    }
    // The sample covers every kind of result.
    expect(values).toEqual(new Set(['win', 'draw', 'loss']));
  });

  it('gives a position and its mirror image the same value', () => {
    for (const position of randomPositions(100, 20, 34, 7)) {
      const mirrored = position.map((column) => COLUMNS - 1 - column);
      expect(new Solver({ tableBits: 16 }).solve(mirrored)).toBe(solver.solve(position));
    }
  });

  it('finds a win in one move', () => {
    // Red has three in the bottom row, columns 1-3, and is to move.
    expect(solver.solve(moves('112233'))).toBe('win');
  });

  it('sees that two open threats of the opponent lose', () => {
    // Red's bottom row in columns 2-4 is open on both sides; yellow to move.
    expect(solver.solve(moves('22334'))).toBe('loss');
  });

  it('sees positions that can only end in a draw', () => {
    // From Pons' Test_L3_R1: one cell left, and four cells left.
    expect(solver.solve(moves('71255763773133525731261364622167124446454'))).toBe('draw');
    expect(solver.solve(moves('23163416124767223154467471272416755633'))).toBe('draw');
  });

  it('solves middle-game positions from the test files', () => {
    // Pons' Test_L2_R2 and Test_L2_R1 with their known results.
    expect(solver.solve(moves('274552224131661'))).toBe('draw');
    expect(solver.solve(moves('6242432155656447531617622'))).toBe('draw');
  });

  it('gives the same answers with either table, also when it is full', () => {
    const always = new Solver({ tableBits: 10, replacement: 'always' });
    const depth = new Solver({ tableBits: 10 });
    for (const position of randomPositions(200, 16, 34, 5)) {
      expect(depth.solve(position), position.join('')).toBe(always.solve(position));
    }
  });

  it('keeps giving the same answers with a table filled by earlier questions', () => {
    const fresh = new Solver({ tableBits: 16 });
    for (const position of randomPositions(50, 24, 34, 11)) {
      const value = fresh.solve(position);
      expect(fresh.solve(position)).toBe(value);
      fresh.clear();
      expect(fresh.solve(position)).toBe(value);
    }
  });

  it('stops soon after its time limit and reports that it does not know', () => {
    const started = performance.now();
    expect(new Solver({ tableBits: 16 }).solve([], { timeLimitMs: 20 })).toBeUndefined();
    expect(performance.now() - started).toBeLessThan(20 + 50);
  });

  it('counts the nodes it visited', () => {
    solver.solve(moves('274552224131661'));
    expect(solver.nodes).toBeGreaterThan(0);
  });

  it('rejects finished games and illegal moves', () => {
    // Red completes a vertical four in column 1.
    expect(() => solver.solve(moves('1212121'))).toThrow(/game is over/);
    expect(() => solver.solve([7])).toThrow(RangeError);
    expect(() => solver.solve(moves('1111111'))).toThrow(RangeError);
  });

  it('checks the size of its table', () => {
    expect(() => new Solver({ tableBits: 9 })).toThrow(RangeError);
    expect(() => new Solver({ tableBits: 27 })).toThrow(RangeError);
  });
});
