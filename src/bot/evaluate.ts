import { COLUMNS, ROWS } from '../game/board';
import { cellBits, type SearchBoard } from './search-board';

/*
 * Evaluation weights, all in one place so #36 can tune them. A group is any
 * four cells in a row (horizontal, vertical or diagonal); a group that
 * holds discs of only one player can still become that player's four in a
 * row and adds to their score.
 */

/** A group with two discs of one player and two empty cells. */
export const TWO_WEIGHT = 2;
/** A group with three discs of one player and one empty cell. */
export const THREE_WEIGHT = 5;
/** Each disc in the centre column, which lies in the most groups. */
export const CENTRE_WEIGHT = 3;

/**
 * The score the search gives a won position (#33 may subtract the distance
 * to the win, so quicker wins score higher). Far above any heuristic score,
 * so a found win always beats a position that only looks good.
 */
export const WIN_SCORE = 1_000_000;

const CENTRE_COLUMN = (COLUMNS - 1) / 2;

/** The groups of four as (low, high) bit mask pairs in the search board's layout. */
const groupLow: number[] = [];
const groupHigh: number[] = [];

/** Unit steps (column, row) for horizontal, vertical, rising and falling lines. */
const DIRECTIONS: readonly (readonly [number, number])[] = [
  [1, 0],
  [0, 1],
  [1, 1],
  [1, -1],
];

for (const [dc, dr] of DIRECTIONS) {
  for (let column = 0; column < COLUMNS; column++) {
    for (let row = 0; row < ROWS; row++) {
      const endColumn = column + 3 * dc;
      const endRow = row + 3 * dr;
      if (endColumn >= COLUMNS || endRow < 0 || endRow >= ROWS) continue;
      let low = 0;
      let high = 0;
      for (let i = 0; i < 4; i++) {
        const [l, h] = cellBits(column + i * dc, row + i * dr);
        low |= l;
        high |= h;
      }
      groupLow.push(low);
      groupHigh.push(high);
    }
  }
}

/** Number of groups of four on the board (69 on 7 × 6). */
export const GROUP_COUNT = groupLow.length;

// Typed arrays keep the hot loop below on plain integers.
const GROUP_LOW = Int32Array.from(groupLow);
const GROUP_HIGH = Int32Array.from(groupHigh);

const CENTRE_LOW = centreMask(0);
const CENTRE_HIGH = centreMask(1);

/** Score of a group by the number of discs of its only owner. */
const GROUP_WEIGHTS: readonly number[] = [
  0,
  0,
  TWO_WEIGHT,
  THREE_WEIGHT,
  // A complete four is a win, which the search scores with WIN_SCORE and
  // never evaluates; counting it like three keeps the score bounded.
  THREE_WEIGHT,
];

/**
 * No heuristic score is larger than this in absolute value: one side's
 * total is at most every group at its highest weight plus a full centre
 * column, and the score is the difference of two such totals.
 */
export const MAX_HEURISTIC_SCORE = GROUP_COUNT * Math.max(...GROUP_WEIGHTS) + ROWS * CENTRE_WEIGHT;

/**
 * Heuristic score of a position that is not won, from the view of the
 * player to move: positive when it looks good for them. Between
 * -MAX_HEURISTIC_SCORE and MAX_HEURISTIC_SCORE.
 */
export function evaluate(board: SearchBoard): number {
  return scoreDiscs(board.ownLow, board.ownHigh, board.opponentLow, board.opponentHigh);
}

/**
 * The score of `evaluate` for arbitrary disc sets (in the search board's
 * bit layout): the player to move owns (ownLow, ownHigh). The score only
 * depends on the two sets, never on which colour moves.
 */
export function scoreDiscs(
  ownLow: number,
  ownHigh: number,
  opponentLow: number,
  opponentHigh: number,
): number {
  let score =
    CENTRE_WEIGHT *
    (bitCount(ownLow & CENTRE_LOW) +
      bitCount(ownHigh & CENTRE_HIGH) -
      bitCount(opponentLow & CENTRE_LOW) -
      bitCount(opponentHigh & CENTRE_HIGH));
  for (let i = 0; i < GROUP_COUNT; i++) {
    const low = GROUP_LOW[i] ?? 0;
    const high = GROUP_HIGH[i] ?? 0;
    // One number per group: a group that spans both halves covers at most
    // columns c to c + 3, so its high-half bits (columns 4 and up, bit
    // (column - 4) * 7 + row) all lie below its low-half bits (bit
    // column * 7 + row, column >= c) and never collide in the OR.
    const ownInGroup = (ownLow & low) | (ownHigh & high);
    const opponentInGroup = (opponentLow & low) | (opponentHigh & high);
    // Groups holding discs of both players can never be completed.
    if (opponentInGroup === 0) {
      if (ownInGroup !== 0) score += GROUP_WEIGHTS[bitCount(ownInGroup)] ?? 0;
    } else if (ownInGroup === 0) {
      score -= GROUP_WEIGHTS[bitCount(opponentInGroup)] ?? 0;
    }
  }
  return score;
}

/** The centre column's cells in one half of the bit layout (0: low, 1: high). */
function centreMask(half: 0 | 1): number {
  let mask = 0;
  for (let row = 0; row < ROWS; row++) mask |= cellBits(CENTRE_COLUMN, row)[half];
  return mask;
}

/** Number of set bits in a 32-bit number. */
function bitCount(x: number): number {
  x -= (x >>> 1) & 0x55555555;
  x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
  return (Math.imul((x + (x >>> 4)) & 0x0f0f0f0f, 0x01010101) >>> 24) & 0xff;
}
