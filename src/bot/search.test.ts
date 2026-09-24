import { describe, expect, it } from 'vitest';
import { COLUMNS, legalColumns } from '../game/board';
import { newGame, playMove, type GameState } from '../game/game';
import { MAX_HEURISTIC_SCORE, WIN_SCORE, evaluate } from './evaluate';
import { SearchBoard } from './search-board';
import { searchMove, type SearchResult } from './search';

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

/** Plays a string of column digits from the empty board. */
function play(moves: string): GameState {
  return [...moves].reduce((s, c) => {
    const next = playMove(s, Number(c));
    if (next === s) throw new Error(`Move ${c} was rejected`);
    return next;
  }, newGame());
}

/** Every column `searchMove` can pick, found by sweeping `random` over [0, 1). */
function chosenColumns(state: GameState, maxDepth: number): Set<number> {
  const columns = new Set<number>();
  for (let k = 0; k < 8; k++) {
    columns.add(searchMove(state, { maxDepth, random: () => (k + 0.5) / 8 }).column);
  }
  return columns;
}

/**
 * Plain minimax without pruning, with the same rules as the search: a win
 * on ply p scores WIN_SCORE - p, a full board 0, the horizon `evaluate`.
 */
function minimax(board: SearchBoard, ply: number, depth: number): number {
  if (board.isFull()) return 0;
  for (let column = 0; column < COLUMNS; column++) {
    if (board.isWinningMove(column)) return WIN_SCORE - ply - 1;
  }
  if (depth === 0) return evaluate(board);
  let best = -Infinity;
  for (const column of board.legalColumns()) {
    board.play(column);
    best = Math.max(best, -minimax(board, ply + 1, depth - 1));
    board.undo();
  }
  return best;
}

/** The best root score and every column that reaches it, by plain minimax. */
function reference(state: GameState, depth: number): { score: number; columns: Set<number> } {
  const board = SearchBoard.fromState(state);
  const scores = new Map<number, number>();
  for (const column of board.legalColumns()) {
    if (board.isWinningMove(column)) {
      scores.set(column, WIN_SCORE - 1);
    } else {
      board.play(column);
      scores.set(column, -minimax(board, 1, depth - 1));
      board.undo();
    }
  }
  const score = Math.max(...scores.values());
  const columns = new Set([...scores].filter(([, s]) => s === score).map(([c]) => c));
  return { score, columns };
}

/** Random running positions with at least one move left. */
function randomPositions(count: number, seed: number): GameState[] {
  const random = seededRandom(seed);
  const positions: GameState[] = [];
  while (positions.length < count) {
    let state = newGame();
    const length = Math.floor(random() * 36);
    while (state.history.length < length && state.status.kind === 'playing') {
      const legal = legalColumns(state.board);
      state = playMove(state, legal[Math.floor(random() * legal.length)] ?? 0);
    }
    if (state.status.kind === 'playing') positions.push(state);
  }
  return positions;
}

/** A full game of 42 moves that ends without four in a row. */
const DRAW_GAME = '231220400060316366502612332554644541451513';

const RED_WINS_IN_1: SearchResult = { kind: 'win', player: 1, moves: 1, exact: true };
const YELLOW_WINS_IN_1: SearchResult = { kind: 'win', player: 2, moves: 1, exact: true };

describe('searchMove', () => {
  it.each([
    ['horizontal', '051526', 3, RED_WINS_IN_1],
    ['vertical', '0101016', 1, YELLOW_WINS_IN_1],
    // Red: (0,0) (1,1) (2,2); column 3 needs three discs below the win.
    ['rising diagonal', '0132122336', 3, RED_WINS_IN_1],
    // Red: (6,0) (5,1) (4,2); column 3 needs three discs below the win.
    ['falling diagonal', '6534544330', 3, RED_WINS_IN_1],
  ] as const)('takes an immediate %s win', (_, moves, column, result) => {
    const state = play(moves);
    for (const maxDepth of [1, 4]) {
      expect(searchMove(state, { maxDepth, random: () => 0 })).toEqual({ column, result });
    }
  });

  it('blocks the opponent’s immediate win', () => {
    // Red has three on the bottom row (0, 1, 2); Yellow must play 3.
    const state = play('0516260');
    for (const maxDepth of [1, 2, 5]) {
      expect(chosenColumns(state, maxDepth)).toEqual(new Set([3]));
    }
  });

  it('prefers its own immediate win over blocking', () => {
    // Red has three on the bottom row, Yellow three in column 6; Red wins in 3.
    const state = play('061626');
    expect(chosenColumns(state, 3)).toEqual(new Set([3]));
    expect(searchMove(state, { maxDepth: 3 }).result).toEqual(RED_WINS_IN_1);
  });

  it('finds a forced win in 2 moves and reports it as exact', () => {
    // Red on (2,0) (3,0), Yellow on top; column 1 or 4 makes an open three.
    const state = play('3322');
    expect(chosenColumns(state, 6)).toEqual(new Set([1, 4]));
    expect(searchMove(state, { maxDepth: 6 }).result).toEqual({
      kind: 'win',
      player: 1,
      moves: 2,
      exact: true,
    });
  });

  it('plays the longest defence when losing', () => {
    // Red threatens column 0 at once and, after that is blocked, column 2
    // gives a double threat on the bottom row. Every other Yellow move
    // loses on the next move.
    const state = play('060633440');
    expect(chosenColumns(state, 6)).toEqual(new Set([0]));
    expect(searchMove(state, { maxDepth: 6 }).result).toEqual({
      kind: 'win',
      player: 1,
      moves: 2,
      exact: true,
    });
  });

  it('proves a draw only after searching to the end of the game', () => {
    for (const left of [6, 13]) {
      const state = play(DRAW_GAME.slice(0, 42 - left));
      expect(searchMove(state, { maxDepth: left }).result).toEqual({ kind: 'draw' });
      // One ply short, the same position is not proven.
      expect(searchMove(state, { maxDepth: left - 1 }).result).toEqual({
        kind: 'unknown',
        depth: left - 1,
      });
    }
  });

  it('reports the searched depth when nothing is proven', () => {
    expect(searchMove(newGame(), { maxDepth: 4 }).result).toEqual({ kind: 'unknown', depth: 4 });
  });

  it('stops close to the time limit with a legal move', () => {
    const start = performance.now();
    const { column, result } = searchMove(newGame(), { timeLimitMs: 50 });
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(100);
    expect(column).toBeGreaterThanOrEqual(0);
    expect(column).toBeLessThan(COLUMNS);
    expect(result.kind).toBe('unknown');
    if (result.kind === 'unknown') expect(result.depth).toBeGreaterThanOrEqual(1);
  });

  it('always completes depth 1, even with no time at all', () => {
    const state = play('0516260');
    expect(searchMove(state, { timeLimitMs: 0, random: () => 0 })).toEqual({
      column: 3,
      result: { kind: 'unknown', depth: 1 },
    });
  });

  it('gives the same move for the same random source', () => {
    for (const state of randomPositions(10, 3)) {
      const first = searchMove(state, { maxDepth: 5, random: seededRandom(11) });
      const second = searchMove(state, { maxDepth: 5, random: seededRandom(11) });
      expect(second).toEqual(first);
    }
  });

  it('varies its move among equally good ones', () => {
    // With the full centre column the position is symmetric, so mirrored
    // columns tie for best.
    expect(chosenColumns(play('333333'), 3).size).toBeGreaterThan(1);
  });

  it('agrees with plain minimax on random positions', () => {
    for (const state of randomPositions(40, 5)) {
      for (const depth of [1, 2, 3, 4]) {
        const expected = reference(state, depth);
        const { result } = searchMove(state, { maxDepth: depth });
        const remaining = 42 - state.history.length;
        const proven = Math.abs(expected.score) > MAX_HEURISTIC_SCORE;
        if (proven) {
          const ply = WIN_SCORE - Math.abs(expected.score);
          expect(result).toEqual({
            kind: 'win',
            player: expected.score > 0 === (state.currentPlayer === 1) ? 1 : 2,
            moves: Math.ceil(ply / 2),
            exact: true,
          });
        } else if (depth >= remaining) {
          expect(result).toEqual({ kind: 'draw' });
        } else {
          expect(result).toEqual({ kind: 'unknown', depth });
        }
        expect(chosenColumns(state, depth)).toEqual(expected.columns);
      }
    }
  });

  it('refuses a finished game', () => {
    expect(() => searchMove(play(DRAW_GAME))).toThrow();
  });
});
