import { describe, expect, it } from 'vitest';
import { canPlay, newGame, playMove, type GameState } from '../game/game';
import {
  chooseLevelMove,
  chooseThreatMove,
  DEFAULT_LEVEL,
  LEVEL_PLAY,
  LEVELS,
  type Level,
} from './levels';

/** Small seeded generator (mulberry32), so the tests are the same on every run. */
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

/** Every column a level picks when `random` sweeps over [0, 1). */
function chosenColumns(state: GameState, level: Level): Set<number> {
  const columns = new Set<number>();
  for (let k = 0; k < 8; k++) columns.add(chooseLevelMove(state, level, () => (k + 0.5) / 8));
  return columns;
}

/** A full game of 42 moves that ends without four in a row. */
const DRAW_GAME = '231220400060316366502612332554644541451513';

describe('levels', () => {
  it('lists the five levels from weakest to strongest with Medium as default', () => {
    expect(LEVELS).toEqual(['beginner', 'easy', 'medium', 'hard', 'expert']);
    expect(DEFAULT_LEVEL).toBe('medium');
  });

  it('keeps every search to about a second and lets Expert use all of it', () => {
    for (const level of LEVELS) {
      const levelPlay = LEVEL_PLAY[level];
      if (levelPlay.kind !== 'search') continue;
      expect(levelPlay.options.timeLimitMs).toBeLessThanOrEqual(1000);
    }
    expect(LEVEL_PLAY.expert).toEqual({ kind: 'search', options: { timeLimitMs: 1000 } });
  });

  it('lets Medium and Hard add randomness and search deeper than the level below', () => {
    const { medium, hard } = LEVEL_PLAY;
    if (medium.kind !== 'search' || hard.kind !== 'search') throw new Error('Not searches');
    expect(medium.options.noiseMargin).toBeGreaterThan(0);
    expect(hard.options.noiseMargin).toBeGreaterThan(0);
    expect(hard.options.maxDepth).toBeGreaterThan(medium.options.maxDepth ?? Infinity);
  });
});

describe('chooseThreatMove', () => {
  it('takes a win in one move', () => {
    // Red has three on the bottom row (1, 2, 3) and moves; 0 and 4 win.
    expect(chooseThreatMove(play('112233'), () => 0.99)).toBe(0);
    // Yellow has three in column 6 and moves.
    expect(chooseThreatMove(play('0606164'), () => 0.99)).toBe(6);
  });

  it('prefers its own win over blocking', () => {
    // Red threatens column 3 on the bottom row, Yellow column 6 upwards.
    expect(chooseThreatMove(play('061626'), () => 0)).toBe(3);
    expect(chooseThreatMove(play('0616265'), () => 0)).toBe(6);
  });

  it("blocks the opponent's win in one move", () => {
    // Red has three on the bottom row (0, 1, 2); Yellow must play 3.
    expect(chooseThreatMove(play('0516260'), () => 0)).toBe(3);
    // Yellow has three in column 5; Red must play 5.
    expect(chooseThreatMove(play('550515'), () => 0)).toBe(5);
  });

  it('plays randomly without a win or threat', () => {
    expect(chooseThreatMove(newGame(), () => 0)).toBe(0);
    expect(chooseThreatMove(newGame(), () => 0.99)).toBe(6);
  });

  it('refuses a finished game', () => {
    expect(() => chooseThreatMove(play(DRAW_GAME))).toThrow();
  });
});

describe('chooseLevelMove', () => {
  it('lets Beginner play only legal moves', () => {
    const random = seededRandom(1);
    for (let game = 0; game < 20; game++) {
      let state = newGame();
      while (state.status.kind === 'playing') {
        const column = chooseLevelMove(state, 'beginner', random);
        expect(canPlay(state, column)).toBe(true);
        state = playMove(state, column);
      }
    }
  });

  it.each(LEVELS)('gives the same %s move for the same random source', (level) => {
    // Thirteen moves before the end, so even Expert finishes its search
    // (it proves the draw) instead of stopping at the clock.
    const positions = [play(DRAW_GAME.slice(0, 29))];
    if (level !== 'expert') positions.push(play('3342'), play('332244'));
    for (const state of positions) {
      const first = chooseLevelMove(state, level, seededRandom(5));
      expect(canPlay(state, first)).toBe(true);
      expect(chooseLevelMove(state, level, seededRandom(5))).toBe(first);
    }
  });

  it.each(['easy', 'medium', 'hard', 'expert'] as const)('lets %s take a win in one', (level) => {
    expect(chosenColumns(play('061626'), level)).toEqual(new Set([3]));
  });

  // Expert would think for a second on every try; the search's own tests
  // cover its blocking.
  it.each(['easy', 'medium', 'hard'] as const)("lets %s block the opponent's win", (level) => {
    expect(chosenColumns(play('0516260'), level)).toEqual(new Set([3]));
  });

  it('lets Medium vary its move among good ones', () => {
    expect(chosenColumns(play('3342'), 'medium').size).toBeGreaterThan(1);
  });
});
