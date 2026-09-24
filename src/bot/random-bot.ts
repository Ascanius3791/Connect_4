import { legalColumns } from '../game/board';
import type { GameState } from '../game/game';

/** Returns numbers in [0, 1), like `Math.random`. */
export type RandomSource = () => number;

/**
 * Picks a uniformly random legal column. The `(state, random) => column`
 * shape is shared by all bot levels, so the UI can swap them freely.
 */
export function chooseRandomMove(state: GameState, random: RandomSource = Math.random): number {
  if (state.status.kind !== 'playing') {
    throw new Error('Cannot choose a move: the game is over');
  }
  const legal = legalColumns(state.board);
  const column = legal[Math.floor(random() * legal.length)];
  if (column === undefined) {
    throw new Error('Cannot choose a move: no legal column');
  }
  return column;
}
