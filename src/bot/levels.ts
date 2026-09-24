import { dropDisc, legalColumns, type Player } from '../game/board';
import type { GameState } from '../game/game';
import { findWin } from '../game/rules';
import { chooseRandomMove, type RandomSource } from './random-bot';
import { searchMove } from './search';
import type { EngineSearchOptions } from './search-protocol';

/** How strong the computer plays, from weakest to strongest. */
export type Level = 'beginner' | 'easy' | 'medium' | 'hard' | 'expert';

export const LEVELS: readonly Level[] = ['beginner', 'easy', 'medium', 'hard', 'expert'];

export const DEFAULT_LEVEL: Level = 'medium';

/**
 * How a level chooses its moves: a random legal move, the rule "win,
 * otherwise block, otherwise random", or the search with the given options.
 */
export type LevelPlay =
  | { readonly kind: 'random' }
  | { readonly kind: 'threats' }
  | { readonly kind: 'search'; readonly options: EngineSearchOptions };

/**
 * Every level's parameters, the only place their numbers live, so #36 can
 * tune them. `maxDepth` is in plies, `timeLimitMs` caps every search at
 * about a second, and `noiseMargin` (in the units of `evaluate`) lets a
 * level pick any move scoring at most that much below the best, as long as
 * no win or loss is proven.
 */
export const LEVEL_PLAY: Readonly<Record<Level, LevelPlay>> = {
  beginner: { kind: 'random' },
  easy: { kind: 'threats' },
  medium: { kind: 'search', options: { maxDepth: 4, timeLimitMs: 1000, noiseMargin: 6 } },
  hard: { kind: 'search', options: { maxDepth: 8, timeLimitMs: 1000, noiseMargin: 2 } },
  expert: { kind: 'search', options: { timeLimitMs: 1000 } },
};

/**
 * Chooses `level`'s move on this page, blocking it while a search runs.
 * The game uses it for the levels that do not search; tests and scripts
 * use it for all of them.
 */
export function chooseLevelMove(
  state: GameState,
  level: Level,
  random: RandomSource = Math.random,
): number {
  const play = LEVEL_PLAY[level];
  switch (play.kind) {
    case 'random':
      return chooseRandomMove(state, random);
    case 'threats':
      return chooseThreatMove(state, random);
    case 'search':
      return searchMove(state, { ...play.options, random }).column;
  }
}

/**
 * Takes a win in one move if there is one, otherwise blocks the
 * opponent's win in one move (the leftmost, if there are several),
 * otherwise plays a random legal move.
 */
export function chooseThreatMove(state: GameState, random: RandomSource = Math.random): number {
  if (state.status.kind !== 'playing') {
    throw new Error('Cannot choose a move: the game is over');
  }
  const player = state.currentPlayer;
  const opponent: Player = player === 1 ? 2 : 1;
  const winning = (who: Player) =>
    legalColumns(state.board).find(
      (column) => findWin(dropDisc(state.board, column, who).board)?.winner === who,
    );
  return winning(player) ?? winning(opponent) ?? chooseRandomMove(state, random);
}
