import { COLUMNS, ROWS } from '../game/board';
import { SEARCH_ORDER, SearchBoard } from './search-board';

/** What the player to move gets when both sides play perfectly. */
export type SolverValue = 'win' | 'draw' | 'loss';

export interface SolveOptions {
  /** Wall-clock budget; without it the solver runs until it knows the answer. */
  readonly timeLimitMs?: number;
}

export interface SolverOptions {
  /**
   * The transposition table holds 2^tableBits positions, 8 bytes each.
   * The default, 22, takes 32 MB.
   */
  readonly tableBits?: number;
  /**
   * What a new entry overwrites when its slot is taken. 'depth' (the
   * default) uses the same memory as buckets of two entries. The first keeps the
   * position with the fewest discs, the most work to find again, and
   * passes the one it replaces on to the second; the second takes
   * everything else. Entries with fewer discs than the position being
   * solved can no longer come up, so the first gives them up. 'always':
   * one entry per slot, and the new entry always wins. 'depth' needs up to
   * a quarter fewer nodes once the table fills up (docs/solver.md).
   */
  readonly replacement?: 'always' | 'depth';
}

/**
 * The bit layout of `src/bot/search-board.ts`: bit `column * 7 + row` of a
 * 49-bit number, split into a low half (columns 0-3, 28 bits) and a high
 * half (columns 4-6, 21 bits). The helpers below shift the pair exactly
 * like one 49-bit number, so the solver can use the classic bitboard
 * formulas with JavaScript's 32-bit operators.
 */
const LOW_BITS = 28;
const LOW_MASK = 2 ** LOW_BITS - 1;
const HIGH_MASK = 2 ** 21 - 1;
const COLUMN_BITS = ROWS + 1;
const LOW_COLUMNS = 4;
const CELLS = COLUMNS * ROWS;

/** The bottom cell of every column. */
const BOTTOM_LOW = 1 | (1 << 7) | (1 << 14) | (1 << 21);
const BOTTOM_HIGH = 1 | (1 << 7) | (1 << 14);
/** Every playable cell (the spare top bit of each column excluded). */
const BOARD_LOW = BOTTOM_LOW * (2 ** ROWS - 1);
const BOARD_HIGH = BOTTOM_HIGH * (2 ** ROWS - 1);

/** The playable cells of each column, in its half; the other half's mask is 0. */
const COLUMN_LOW: readonly number[] = Array.from({ length: COLUMNS }, (_, column) =>
  column < LOW_COLUMNS ? (2 ** ROWS - 1) << (column * COLUMN_BITS) : 0,
);
const COLUMN_HIGH: readonly number[] = Array.from({ length: COLUMNS }, (_, column) =>
  column < LOW_COLUMNS ? 0 : (2 ** ROWS - 1) << ((column - LOW_COLUMNS) * COLUMN_BITS),
);

/** The column masks in search order (centre first). */
const ORDER_LOW = Int32Array.from(SEARCH_ORDER, (column) => COLUMN_LOW[column] ?? 0);
const ORDER_HIGH = Int32Array.from(SEARCH_ORDER, (column) => COLUMN_HIGH[column] ?? 0);

/** Values inside the search: loss, draw and win for the player to move. */
const LOSS = -1;
const DRAW = 0;
const WIN = 1;

/** The clock is read once every this many nodes (a power of two). */
const CLOCK_INTERVAL = 1024;

/**
 * Decides positions as win, draw or loss for the player to move, a "weak"
 * solver in the sense of Pascal Pons' tutorial (blog.gamesolver.org), which
 * it follows: negamax with alpha-beta over the values -1, 0 and 1, only
 * ever playing moves that do not hand the opponent an immediate win,
 * trying the moves that create the most own winning cells first, and a
 * transposition table of bounds.
 *
 * The table keeps every bound it learns across calls: a position's value
 * never changes, so later questions about the same game get faster. One
 * solver uses 2^tableBits * 8 bytes, allocated once.
 */
export class Solver {
  /** Nodes visited by the last `solve`. */
  nodes = 0;

  /**
   * Two 32-bit words per entry: the low half of the position's key, and
   * the high half shifted left by 11 above the number of discs (6 bits),
   * a flag for a used entry (0x10) and the two stored bounds (2 bits each).
   */
  private readonly table: Int32Array;
  private readonly hashShift: number;
  /** Buckets of two entries ('depth' replacement) instead of one. */
  private readonly twoTier: boolean;
  private readonly slotShift: number;
  /** Discs on the board of the position `solve` was asked about. */
  private rootCount = 0;
  private deadline = Infinity;
  private aborted = false;

  /** Winning cells found by `winningCells`, in the two halves. */
  private winLow = 0;
  private winHigh = 0;

  /**
   * Move lists for each node on the current path, `COLUMNS` entries per
   * number of discs on the board, so no array is allocated while searching.
   */
  private readonly moveLow = new Int32Array(CELLS * COLUMNS);
  private readonly moveHigh = new Int32Array(CELLS * COLUMNS);
  private readonly moveScore = new Int32Array(CELLS * COLUMNS);

  constructor(options: SolverOptions = {}) {
    const bits = Math.floor(options.tableBits ?? 22);
    if (bits < 10 || bits > 26) throw new RangeError(`tableBits ${bits} is out of range 10-26`);
    this.table = new Int32Array(2 ** (bits + 1));
    this.twoTier = options.replacement !== 'always';
    // Half as many buckets of twice the size keep the memory the same.
    this.hashShift = 32 - (this.twoTier ? bits - 1 : bits);
    this.slotShift = this.twoTier ? 2 : 1;
  }

  /** Forgets everything the table learned, e.g. to time positions fairly. */
  clear(): void {
    this.table.fill(0);
  }

  /**
   * The value of the position after `moves` (column indexes from the empty
   * board) for the player to move, or undefined if the time limit ran out
   * first. Throws for an illegal move and for a finished game.
   */
  solve(moves: readonly number[], options: SolveOptions = {}): SolverValue | undefined {
    const board = new SearchBoard();
    for (const column of moves) {
      if (board.isWinningMove(column)) throw new Error('Cannot solve: the game is over');
      board.play(column);
    }
    if (board.isFull()) throw new Error('Cannot solve: the game is over');

    this.nodes = 0;
    this.aborted = false;
    this.deadline =
      options.timeLimitMs === undefined ? Infinity : performance.now() + options.timeLimitMs;

    const ownLow = board.ownLow;
    const ownHigh = board.ownHigh;
    const maskLow = ownLow | board.opponentLow;
    const maskHigh = ownHigh | board.opponentHigh;
    const count = board.moveCount;
    this.rootCount = count;

    // The search assumes the player to move cannot win at once.
    this.winningCells(ownLow, ownHigh, maskLow, maskHigh);
    const possibleLow = (maskLow + BOTTOM_LOW) & BOARD_LOW;
    const possibleHigh = (maskHigh + BOTTOM_HIGH) & BOARD_HIGH;
    if ((this.winLow & possibleLow) !== 0 || (this.winHigh & possibleHigh) !== 0) return 'win';

    // Two null-window searches: "can the player to move win?", and if not,
    // "can they at least draw?".
    const winning = this.negamax(ownLow, ownHigh, maskLow, maskHigh, count, DRAW, WIN);
    if (this.aborted) return undefined;
    if (winning > DRAW) return 'win';
    const drawing = this.negamax(ownLow, ownHigh, maskLow, maskHigh, count, LOSS, DRAW);
    if (this.aborted) return undefined;
    return drawing >= DRAW ? 'draw' : 'loss';
  }

  /**
   * Fail-soft negamax: the exact value if it lies strictly between alpha
   * and beta, otherwise a bound on the same side. `own` holds the discs of
   * the player to move, `mask` all discs, `count` their number. Assumes
   * nobody has won and the player to move cannot win with this move.
   */
  private negamax(
    ownLow: number,
    ownHigh: number,
    maskLow: number,
    maskHigh: number,
    count: number,
    alpha: number,
    beta: number,
  ): number {
    if ((++this.nodes & (CLOCK_INTERVAL - 1)) === 0 && performance.now() >= this.deadline) {
      this.aborted = true;
    }
    if (this.aborted) return DRAW;

    let possibleLow = (maskLow + BOTTOM_LOW) & BOARD_LOW;
    let possibleHigh = (maskHigh + BOTTOM_HIGH) & BOARD_HIGH;
    this.winningCells(ownLow ^ maskLow, ownHigh ^ maskHigh, maskLow, maskHigh);
    const threatLow = this.winLow;
    const threatHigh = this.winHigh;
    // Cells where the opponent would win on their next move must be blocked;
    // two of them cannot both be.
    const forcedLow = possibleLow & threatLow;
    const forcedHigh = possibleHigh & threatHigh;
    if ((forcedLow | forcedHigh) !== 0) {
      if (
        (forcedLow & (forcedLow - 1)) !== 0 ||
        (forcedHigh & (forcedHigh - 1)) !== 0 ||
        (forcedLow !== 0 && forcedHigh !== 0)
      ) {
        return LOSS;
      }
      possibleLow = forcedLow;
      possibleHigh = forcedHigh;
    }
    // Never play directly below a cell where the opponent would win.
    const nextLow = possibleLow & ~shiftRightLow(threatLow, threatHigh, 1);
    const nextHigh = possibleHigh & ~(threatHigh >>> 1);
    if ((nextLow | nextHigh) === 0) return LOSS;
    // At most two cells are left: this move cannot win and the opponent's
    // last one cannot either.
    if (count >= CELLS - 2) return DRAW;

    let keyLow = ownLow + maskLow;
    let keyHigh = ownHigh + maskHigh;
    // A position and its mirror image have the same value: store the one
    // with the smaller key.
    const mirrorLow =
      ((keyHigh >>> 14) & 127) |
      (((keyHigh >>> 7) & 127) << 7) |
      ((keyHigh & 127) << 14) |
      (keyLow & (127 << 21));
    const mirrorHigh =
      ((keyLow >>> 14) & 127) | (((keyLow >>> 7) & 127) << 7) | ((keyLow & 127) << 14);
    if (mirrorHigh < keyHigh || (mirrorHigh === keyHigh && mirrorLow < keyLow)) {
      keyLow = mirrorLow;
      keyHigh = mirrorHigh;
    }
    const slot = this.slot(keyLow, keyHigh);
    const table = this.table;
    // With buckets of two, the position may be in either entry.
    const first = table[slot + 1] ?? 0;
    const inFirst = (first & 0x10) !== 0 && table[slot] === keyLow && first >>> 11 === keyHigh;
    const entry = this.twoTier && !inFirst ? slot + 2 : slot;
    let lower = LOSS;
    let upper = WIN;
    const stored = table[entry + 1] ?? 0;
    if ((stored & 0x10) !== 0 && table[entry] === keyLow && stored >>> 11 === keyHigh) {
      lower = ((stored >> 2) & 3) - 1;
      upper = (stored & 3) - 1;
      if (lower >= beta) return lower;
      if (upper <= alpha) return upper;
      if (lower > alpha) alpha = lower;
      if (upper < beta) beta = upper;
      // Both bounds agree: the value is known.
      if (alpha >= beta) return alpha;
    }

    // Order the moves by how many winning cells they create, best first;
    // ties keep the centre-first order.
    const base = count * COLUMNS;
    const movesLow = this.moveLow;
    const movesHigh = this.moveHigh;
    const scores = this.moveScore;
    let moveCount = 0;
    const single =
      (nextLow & (nextLow - 1)) === 0 &&
      (nextHigh & (nextHigh - 1)) === 0 &&
      (nextLow === 0 || nextHigh === 0);
    for (let k = 0; k < COLUMNS; k++) {
      const moveLow = nextLow & (ORDER_LOW[k] ?? 0);
      const moveHigh = nextHigh & (ORDER_HIGH[k] ?? 0);
      if ((moveLow | moveHigh) === 0) continue;
      // A single move needs no score.
      let score = 0;
      if (!single) {
        this.winningCells(ownLow | moveLow, ownHigh | moveHigh, maskLow, maskHigh);
        score = popCount(this.winLow) + popCount(this.winHigh);
      }
      let i = base + moveCount++;
      while (i > base && (scores[i - 1] ?? 0) < score) {
        movesLow[i] = movesLow[i - 1] ?? 0;
        movesHigh[i] = movesHigh[i - 1] ?? 0;
        scores[i] = scores[i - 1] ?? 0;
        i--;
      }
      movesLow[i] = moveLow;
      movesHigh[i] = moveHigh;
      scores[i] = score;
    }

    const alphaBefore = alpha;
    let best = LOSS;
    for (let i = base; i < base + moveCount; i++) {
      const moveLow = movesLow[i] ?? 0;
      const moveHigh = movesHigh[i] ?? 0;
      // The opponent's discs become those of the player to move.
      const value = -this.negamax(
        ownLow ^ maskLow,
        ownHigh ^ maskHigh,
        maskLow | moveLow,
        maskHigh | moveHigh,
        count + 1,
        -beta,
        -alpha,
      );
      if (this.aborted) return DRAW;
      if (value > best) {
        best = value;
        if (value > alpha) {
          alpha = value;
          if (alpha >= beta) break;
        }
      }
    }

    // A fail-low result is an upper bound, a fail-high one a lower bound.
    if (best <= alphaBefore) upper = Math.min(upper, best);
    else if (best >= beta) lower = Math.max(lower, best);
    else lower = upper = best;
    let target = slot;
    if (this.twoTier) {
      // The search below may have changed the bucket: look again.
      const held = table[slot + 1] ?? 0;
      if ((held & 0x10) !== 0 && !(table[slot] === keyLow && held >>> 11 === keyHigh)) {
        const heldCount = (held >>> 5) & 63;
        if (heldCount < this.rootCount) {
          // Fewer discs than the position being solved: it cannot come up again.
        } else if (count <= heldCount) {
          table[slot + 2] = table[slot] ?? 0;
          table[slot + 3] = held;
        } else {
          target = slot + 2;
        }
      }
    }
    table[target] = keyLow;
    table[target + 1] = (keyHigh << 11) | (count << 5) | 0x10 | ((lower + 1) << 2) | (upper + 1);
    return best;
  }

  /**
   * Index of the first word of the key's slot (bucket). `own + mask` is unique per
   * position: in each column, `mask` is a run of ones from the bottom and
   * adding the player's discs, a subset of it, stays below the next run's
   * range.
   */
  private slot(keyLow: number, keyHigh: number): number {
    const hash = Math.imul(keyLow ^ Math.imul(keyHigh, 0x27d4eb2d), 0x9e3779b1);
    return (hash >>> this.hashShift) << this.slotShift;
  }

  /**
   * Stores in `winLow`/`winHigh` the free cells where the player owning
   * `own` would complete four in a row, whether playable now or not.
   */
  private winningCells(ownLow: number, ownHigh: number, maskLow: number, maskHigh: number): void {
    // Vertical: three discs directly below (never crosses a column).
    const low = (ownLow << 1) & (ownLow << 2) & (ownLow << 3);
    const high = (ownHigh << 1) & (ownHigh << 2) & (ownHigh << 3);
    lineLow = low;
    lineHigh = high;
    // Horizontal, falling and rising diagonals.
    addLines(ownLow, ownHigh, COLUMN_BITS);
    addLines(ownLow, ownHigh, COLUMN_BITS - 1);
    addLines(ownLow, ownHigh, COLUMN_BITS + 1);
    this.winLow = lineLow & (BOARD_LOW ^ maskLow);
    this.winHigh = lineHigh & (BOARD_HIGH ^ maskHigh);
  }
}

/** Winning cells collected by `addLines`, in the two halves. */
let lineLow = 0;
let lineHigh = 0;

/**
 * Adds to `lineLow`/`lineHigh` the cells completing four along `shift`
 * (7 horizontal, 6 and 8 diagonal): two own discs on one side of the cell
 * and a third on either side.
 */
function addLines(ownLow: number, ownHigh: number, shift: number): void {
  const left1Low = shiftLeftLow(ownLow, shift);
  const left1High = shiftLeftHigh(ownLow, ownHigh, shift);
  const left2Low = shiftLeftLow(ownLow, 2 * shift);
  const left2High = shiftLeftHigh(ownLow, ownHigh, 2 * shift);
  const right1Low = shiftRightLow(ownLow, ownHigh, shift);
  const right1High = ownHigh >>> shift;
  const right2Low = shiftRightLow(ownLow, ownHigh, 2 * shift);
  const right2High = ownHigh >>> (2 * shift);
  const pairLow = left1Low & left2Low;
  const pairHigh = left1High & left2High;
  lineLow |= pairLow & (shiftLeftLow(ownLow, 3 * shift) | right1Low);
  lineHigh |= pairHigh & (shiftLeftHigh(ownLow, ownHigh, 3 * shift) | right1High);
  const otherLow = right1Low & right2Low;
  const otherHigh = right1High & right2High;
  lineLow |= otherLow & (left1Low | shiftRightLow(ownLow, ownHigh, 3 * shift));
  lineHigh |= otherHigh & (left1High | (ownHigh >>> (3 * shift)));
}

/** Low half of the 49-bit number (low, high) shifted left by `shift` (at most 27). */
function shiftLeftLow(low: number, shift: number): number {
  return (low << shift) & LOW_MASK;
}

/** High half of the 49-bit number (low, high) shifted left by `shift` (1 to 27). */
function shiftLeftHigh(low: number, high: number, shift: number): number {
  return ((high << shift) | (low >>> (LOW_BITS - shift))) & HIGH_MASK;
}

/** Low half of the 49-bit number (low, high) shifted right by `shift` (1 to 27). */
function shiftRightLow(low: number, high: number, shift: number): number {
  return ((low >>> shift) | (high << (LOW_BITS - shift))) & LOW_MASK;
}

function popCount(bits: number): number {
  bits -= (bits >>> 1) & 0x55555555;
  bits = (bits & 0x33333333) + ((bits >>> 2) & 0x33333333);
  return (Math.imul((bits + (bits >>> 4)) & 0x0f0f0f0f, 0x01010101) >>> 24) & 0xff;
}
