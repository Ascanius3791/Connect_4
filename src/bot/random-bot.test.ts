import { describe, expect, it } from 'vitest';
import { canPlay, newGame, playMove, type GameState } from '../game/game';
import { chooseRandomMove } from './random-bot';

function play(moves: string, state: GameState = newGame()): GameState {
  return [...moves].reduce((s, c) => {
    const next = playMove(s, Number(c));
    if (next === s) throw new Error(`Move ${c} was rejected`);
    return next;
  }, state);
}

/** A full game of 42 moves that ends without four in a row. */
const DRAW_GAME = '231220400060316366502612332554644541451513';

/** Columns 0 and 6 are full, 1-5 are free, and nobody has won. */
const OUTER_COLUMNS_FULL = '000000666666';

describe('chooseRandomMove', () => {
  it('picks the first legal column for 0 and the last for 0.999', () => {
    const state = play(OUTER_COLUMNS_FULL);
    expect(chooseRandomMove(state, () => 0)).toBe(1);
    expect(chooseRandomMove(state, () => 0.999)).toBe(5);
  });

  it('never picks a full column', () => {
    const state = play(OUTER_COLUMNS_FULL);
    for (let i = 0; i < 500; i++) {
      const column = chooseRandomMove(state);
      expect([1, 2, 3, 4, 5]).toContain(column);
      expect(canPlay(state, column)).toBe(true);
    }
  });

  it('can pick every legal column', () => {
    const seen = new Set<number>();
    for (let i = 0; i < 1000; i++) seen.add(chooseRandomMove(newGame()));
    expect([...seen].sort()).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('gives each legal column the same share of the random range', () => {
    const state = play(OUTER_COLUMNS_FULL);
    const steps = 1000;
    const counts = new Map<number, number>();
    for (let i = 0; i < steps; i++) {
      const column = chooseRandomMove(state, () => i / steps);
      counts.set(column, (counts.get(column) ?? 0) + 1);
    }
    expect([...counts.values()]).toEqual([200, 200, 200, 200, 200]);
  });

  it('throws for a won game', () => {
    const won = play('0101010');
    expect(won.status.kind).toBe('won');
    expect(() => chooseRandomMove(won)).toThrow();
  });

  it('throws for a drawn game', () => {
    const drawn = play(DRAW_GAME);
    expect(drawn.status.kind).toBe('draw');
    expect(() => chooseRandomMove(drawn)).toThrow();
  });

  it('does not modify the state', () => {
    const state = play('3342');
    const snapshot = JSON.stringify(state);
    chooseRandomMove(state);
    expect(JSON.stringify(state)).toBe(snapshot);
  });
});
