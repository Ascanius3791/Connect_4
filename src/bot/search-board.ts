import { COLUMNS, ROWS, type Cell, type Player } from '../game/board';
import type { GameState } from '../game/game';

/** Columns in the order the search tries them: centre first, edges last. */
export const SEARCH_ORDER: readonly number[] = [3, 2, 4, 1, 5, 0, 6];

/**
 * Bit layout: bit `column * 7 + row`, with a spare, always empty bit on top
 * of each column so that lines never wrap into the next column. The 49 bits
 * do not fit JavaScript's 32-bit bitwise operators, so they are split into
 * two numbers: columns 0-3 in the low one (bits 0-27), columns 4-6 in the
 * high one (bits 28-48, stored as bits 0-20).
 */
const COLUMN_BITS = ROWS + 1;
const LOW_COLUMNS = 4;
const LOW_BITS = LOW_COLUMNS * COLUMN_BITS;
const LOW_MASK = 2 ** LOW_BITS - 1;
const CELLS = COLUMNS * ROWS;

/** Bit shifts for vertical, horizontal, rising and falling lines. */
const VERTICAL = 1;
const HORIZONTAL = COLUMN_BITS;
const RISING = COLUMN_BITS + 1;
const FALLING = COLUMN_BITS - 1;

/**
 * A mutable position for the bot's search: play and undo in place, and ask
 * whether a move wins before playing it. It stores two bitboards, the discs
 * of the player to move and all discs, so passing the turn is one XOR.
 * The immutable model in `src/game/` stays the source of truth for the UI.
 */
export class SearchBoard {
  /** Discs of the player to move. */
  private currentLow = 0;
  private currentHigh = 0;
  /** All discs. */
  private maskLow = 0;
  private maskHigh = 0;
  private readonly heights = new Uint8Array(COLUMNS);
  private readonly moves = new Uint8Array(CELLS);
  private count = 0;

  /** Replays `state.history`, so any reachable game state can be searched. */
  static fromState(state: GameState): SearchBoard {
    return SearchBoard.fromMoves(state.history);
  }

  static fromMoves(columns: readonly number[]): SearchBoard {
    const board = new SearchBoard();
    for (const column of columns) board.play(column);
    return board;
  }

  /** Number of discs on the board. */
  get moveCount(): number {
    return this.count;
  }

  /** Red (1) moves first, so the parity of the move count decides. */
  get currentPlayer(): Player {
    return (this.count & 1) === 0 ? 1 : 2;
  }

  /** False for a full column and for anything that is not a column index. */
  canPlay(column: number): boolean {
    return (this.heights[column] ?? ROWS) < ROWS;
  }

  /** Playable columns in ascending order, like `legalColumns` in `src/game/board.ts`. */
  legalColumns(): number[] {
    const legal: number[] = [];
    for (let column = 0; column < COLUMNS; column++) {
      if (this.canPlay(column)) legal.push(column);
    }
    return legal;
  }

  isFull(): boolean {
    return this.count === CELLS;
  }

  /**
   * True if dropping a disc in `column` would complete four in a row for
   * the player to move. Does not change the board; false if the column
   * cannot be played.
   */
  isWinningMove(column: number): boolean {
    if (!this.canPlay(column)) return false;
    let low = this.currentLow;
    let high = this.currentHigh;
    const bit = bitIndex(column, this.heights[column] ?? 0);
    if (column < LOW_COLUMNS) low |= 1 << bit;
    else high |= 1 << bit;
    return (
      aligned(low, high, VERTICAL) ||
      aligned(low, high, HORIZONTAL) ||
      aligned(low, high, RISING) ||
      aligned(low, high, FALLING)
    );
  }

  /** Drops a disc for the player to move and passes the turn. */
  play(column: number): void {
    if (!this.canPlay(column)) {
      throw new RangeError(`Column ${column} cannot be played`);
    }
    // The opponent's discs become the discs of the player to move next.
    this.currentLow ^= this.maskLow;
    this.currentHigh ^= this.maskHigh;
    const row = this.heights[column] ?? 0;
    this.heights[column] = row + 1;
    const bit = bitIndex(column, row);
    if (column < LOW_COLUMNS) this.maskLow |= 1 << bit;
    else this.maskHigh |= 1 << bit;
    this.moves[this.count++] = column;
  }

  /** Takes back the last move, restoring the previous position and turn. */
  undo(): void {
    if (this.count === 0) throw new Error('No move to undo');
    const column = this.moves[--this.count] ?? 0;
    const row = (this.heights[column] ?? 1) - 1;
    this.heights[column] = row;
    const bit = bitIndex(column, row);
    if (column < LOW_COLUMNS) this.maskLow ^= 1 << bit;
    else this.maskHigh ^= 1 << bit;
    this.currentLow ^= this.maskLow;
    this.currentHigh ^= this.maskHigh;
  }

  /** The disc at a cell (row 0 is the bottom), like `getCell` in `src/game/board.ts`. */
  cell(column: number, row: number): Cell {
    if (!Number.isInteger(column) || column < 0 || column >= COLUMNS) {
      throw new RangeError(`Column ${column} is out of range 0-${COLUMNS - 1}`);
    }
    if (!Number.isInteger(row) || row < 0 || row >= ROWS) {
      throw new RangeError(`Row ${row} is out of range 0-${ROWS - 1}`);
    }
    const bit = 1 << bitIndex(column, row);
    const low = column < LOW_COLUMNS;
    if (((low ? this.maskLow : this.maskHigh) & bit) === 0) return 0;
    const own = ((low ? this.currentLow : this.currentHigh) & bit) !== 0;
    const mover = this.currentPlayer;
    return own ? mover : mover === 1 ? 2 : 1;
  }
}

/** Bit of a cell within its half (low: columns 0-3, high: columns 4-6). */
function bitIndex(column: number, row: number): number {
  return (column < LOW_COLUMNS ? column : column - LOW_COLUMNS) * COLUMN_BITS + row;
}

/**
 * True if the discs in (low, high) contain four in a row along `shift`.
 * `m = p & (p >> s)` marks discs with a neighbour one step along the line;
 * `m & (m >> 2s)` then marks the start of four in a row. The shifts treat
 * the two halves as one 49-bit number, carrying the high half's lowest bits
 * into the top of the low half.
 */
function aligned(low: number, high: number, shift: number): boolean {
  const pairsLow = low & shiftLow(low, high, shift);
  const pairsHigh = high & (high >>> shift);
  const double = 2 * shift;
  return (
    (pairsLow & shiftLow(pairsLow, pairsHigh, double)) !== 0 ||
    (pairsHigh & (pairsHigh >>> double)) !== 0
  );
}

/** Low half of the 49-bit number (low, high) shifted right by `shift`. */
function shiftLow(low: number, high: number, shift: number): number {
  return ((low >>> shift) | (high << (LOW_BITS - shift))) & LOW_MASK;
}
