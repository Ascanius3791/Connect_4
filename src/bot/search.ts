import { COLUMNS, ROWS, type Player } from '../game/board';
import type { GameState } from '../game/game';
import { MAX_HEURISTIC_SCORE, WIN_SCORE, evaluate } from './evaluate';
import type { RandomSource } from './random-bot';
import { SEARCH_ORDER, SearchBoard } from './search-board';

/**
 * What the search could prove about a position. `moves` counts the
 * winning player's own moves including the winning disc; `exact` is true
 * when no quicker forced win exists. `depth` is the number of plies
 * (single moves of either player) that were searched completely.
 */
export type SearchResult =
  | {
      readonly kind: 'win';
      readonly player: Player;
      readonly moves: number;
      readonly exact: boolean;
    }
  | { readonly kind: 'draw' }
  | { readonly kind: 'unknown'; readonly depth: number };

export interface SearchOptions {
  /** Deepest iteration in plies; defaults to the number of empty cells. */
  readonly maxDepth?: number;
  /**
   * Wall-clock budget. Without it the search runs up to `maxDepth`; with
   * neither option it uses DEFAULT_TIME_LIMIT_MS so it cannot run for ages.
   */
  readonly timeLimitMs?: number;
  /**
   * Plays weaker on purpose: while no win or loss is proven, every move
   * scoring at most this much below the best counts as good enough, and
   * one of them is picked at random. 0 (the default) picks among the
   * equally best moves only. In the heuristic's units (see `evaluate`).
   */
  readonly noiseMargin?: number;
  /** Picks among the moves that count as best; `Math.random` by default. */
  readonly random?: RandomSource;
}

export interface SearchOutcome {
  /** The move to play, always legal. */
  readonly column: number;
  readonly result: SearchResult;
}

/** Time limit used when the caller gives neither `maxDepth` nor `timeLimitMs`. */
export const DEFAULT_TIME_LIMIT_MS = 1000;

const CELLS = COLUMNS * ROWS;

/** Above every score the search can return. */
const INFINITE = WIN_SCORE + 1;

/** The clock is read once every this many nodes (a power of two). */
const CLOCK_INTERVAL = 1024;

/**
 * Chooses a move for the player to move with a negamax alpha-beta search
 * that deepens one ply at a time until `maxDepth`, the time limit or a
 * proven result stops it, and reports what it proved.
 *
 * Scores are from the view of the player to move. A win completed on ply
 * `p` (counted from the root, the winning disc included) scores
 * `WIN_SCORE - p`, a loss the negation, so quicker wins and slower losses
 * score higher. Everything else is the heuristic `evaluate`, far smaller.
 */
export function searchMove(state: GameState, options: SearchOptions = {}): SearchOutcome {
  if (state.status.kind !== 'playing') {
    throw new Error('Cannot search a move: the game is over');
  }
  const board = SearchBoard.fromState(state);
  const remaining = CELLS - board.moveCount;
  const maxDepth = Math.max(1, Math.min(remaining, Math.floor(options.maxDepth ?? remaining)));
  const timeLimit =
    options.timeLimitMs ?? (options.maxDepth === undefined ? DEFAULT_TIME_LIMIT_MS : Infinity);
  const deadline = performance.now() + timeLimit;
  const random = options.random ?? Math.random;
  const margin = Math.max(0, options.noiseMargin ?? 0);

  const search = new Search(board);
  let order = SEARCH_ORDER.filter((column) => board.canPlay(column));
  let best: RootResult | undefined;
  for (let depth = 1; depth <= maxDepth; depth++) {
    // Depth 1 always completes, so there is always a move to return.
    if (depth > 1 && performance.now() >= deadline) break;
    search.deadline = depth === 1 ? Infinity : deadline;
    const result = search.root(order, depth, margin);
    if (result === undefined) break;
    best = result;
    if (Math.abs(result.score) > MAX_HEURISTIC_SCORE) break;
    // Try the best move of this iteration first in the next one.
    const first = result.columns[0];
    if (first !== undefined) order = [first, ...order.filter((column) => column !== first)];
  }
  if (best === undefined) throw new Error('Depth 1 did not complete');

  const columns = [...best.candidates].sort((a, b) => a - b);
  const column = columns[Math.min(columns.length - 1, Math.floor(random() * columns.length))];
  if (column === undefined) throw new Error('Cannot search a move: no legal column');
  return { column, result: describe(best, remaining, board.currentPlayer) };
}

interface RootResult {
  /** Depth of the completed iteration. */
  readonly depth: number;
  /** Best score, for the player to move at the root. */
  readonly score: number;
  /** Every column with that score, in search order (never empty). */
  readonly columns: readonly number[];
  /**
   * The columns to pick from: those within the noise margin of the best
   * score, or only the best ones once a win or loss is proven.
   */
  readonly candidates: readonly number[];
}

function describe(best: RootResult, remaining: number, mover: Player): SearchResult {
  const { score, depth } = best;
  if (score > MAX_HEURISTIC_SCORE || score < -MAX_HEURISTIC_SCORE) {
    // Ply of the winning disc; the root player's own moves are the odd
    // plies and the opponent's the even ones, so either way the winner
    // made ceil(ply / 2) moves. Iterative deepening stops at the first
    // depth that proves a win, and the minimax value with distance scores
    // is the quickest forced win (the slowest loss), so it is exact.
    const ply = WIN_SCORE - Math.abs(score);
    const player: Player = score > 0 ? mover : mover === 1 ? 2 : 1;
    return { kind: 'win', player, moves: Math.ceil(ply / 2), exact: true };
  }
  // Searching every remaining cell leaves no heuristic leaf, so a score
  // of 0 there is the value of a board filled without a winner.
  if (depth >= remaining) return { kind: 'draw' };
  return { kind: 'unknown', depth };
}

/** One search over a board, reused across the iterations. */
class Search {
  deadline = Infinity;
  private nodes = 0;
  private aborted = false;

  constructor(private readonly board: SearchBoard) {}

  /**
   * Scores every root move exactly enough to know which ones tie for best
   * and which lie within `margin` of it, or returns undefined when the
   * clock ran out. Each move is searched with alpha `margin + 1` below the
   * best score so far, so such a move comes back as its exact score
   * instead of a bound; a move below that gets an upper bound that is
   * below it too.
   */
  root(order: readonly number[], depth: number, margin: number): RootResult | undefined {
    const board = this.board;
    let bestScore = -INFINITE;
    const scores: (readonly [column: number, score: number])[] = [];
    for (const column of order) {
      let score: number;
      if (board.isWinningMove(column)) {
        score = WIN_SCORE - 1;
      } else {
        board.play(column);
        score = -this.negamax(1, depth - 1, -INFINITE, -(bestScore - margin - 1));
        board.undo();
        if (this.aborted) return undefined;
      }
      scores.push([column, score]);
      if (score > bestScore) bestScore = score;
    }
    // Once a win or loss is proven, a random pick must not throw away a
    // win or hurry a loss, so only the best moves stay.
    const proven = Math.abs(bestScore) > MAX_HEURISTIC_SCORE;
    const lowest = proven ? bestScore : bestScore - margin;
    return {
      depth,
      score: bestScore,
      columns: scores.filter(([, score]) => score === bestScore).map(([column]) => column),
      candidates: scores.filter(([, score]) => score >= lowest).map(([column]) => column),
    };
  }

  /**
   * Fail-soft negamax: the exact score if it lies strictly between alpha
   * and beta, otherwise a bound on the same side. `ply` counts the moves
   * played since the root, `depth` the plies still to search.
   */
  private negamax(ply: number, depth: number, alpha: number, beta: number): number {
    if ((++this.nodes & (CLOCK_INTERVAL - 1)) === 0 && performance.now() >= this.deadline) {
      this.aborted = true;
    }
    if (this.aborted) return 0;
    const board = this.board;
    // Nobody has won yet: the search never plays a winning move, it
    // scores it here instead.
    if (board.isFull()) return 0;
    for (let column = 0; column < COLUMNS; column++) {
      if (board.isWinningMove(column)) return WIN_SCORE - ply - 1;
    }
    if (depth === 0) return evaluate(board);

    // With no immediate win, the opponent wins on ply + 2 at the soonest
    // and the player to move on ply + 3, which bounds the score.
    const lowest = -(WIN_SCORE - ply - 2);
    if (alpha < lowest) {
      alpha = lowest;
      if (alpha >= beta) return alpha;
    }
    const highest = WIN_SCORE - ply - 3;
    if (beta > highest) {
      beta = highest;
      if (alpha >= beta) return beta;
    }

    let best = -INFINITE;
    for (const column of SEARCH_ORDER) {
      if (!board.canPlay(column)) continue;
      board.play(column);
      const score = -this.negamax(ply + 1, depth - 1, -beta, -alpha);
      board.undo();
      if (this.aborted) return 0;
      if (score > best) {
        best = score;
        if (score > alpha) {
          alpha = score;
          if (alpha >= beta) break;
        }
      }
    }
    return best;
  }
}
