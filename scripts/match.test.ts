import { describe, expect, it } from 'vitest';
import {
  DEFAULT_GAMES,
  formatResult,
  levelBot,
  mulberry32,
  parseArgs,
  playMatch,
  type Bot,
} from './match';

describe('playMatch', () => {
  it('plays Beginner against Beginner with alternating starters and counts that add up', () => {
    const result = playMatch(levelBot('beginner'), levelBot('beginner'), 4, mulberry32(1));
    expect(result.games.map((game) => game.starter)).toEqual(['a', 'b', 'a', 'b']);
    for (const side of [result.a, result.b]) {
      expect(side.wins + side.losses + side.draws).toBe(4);
      expect(side.score).toBe(side.wins + side.draws / 2);
    }
    expect(result.a.wins).toBe(result.b.losses);
    expect(result.a.draws).toBe(result.b.draws);
    expect(result.a.score + result.b.score).toBe(4);
    for (const game of result.games) {
      if (game.winner === null) continue;
      // The starter plays the odd moves, so the winner made the last one.
      const winnerStarted = game.winner === game.starter;
      expect(game.moves.length % 2 === 1).toBe(winnerStarted);
    }
  });

  it('lets the starter play first in every game', () => {
    const firstMovers: string[] = [];
    const bot =
      (name: string): Bot =>
      (state, random) => {
        if (state.history.length === 0) firstMovers.push(name);
        return levelBot('beginner')(state, random);
      };
    playMatch(bot('a'), bot('b'), 4, mulberry32(2));
    expect(firstMovers).toEqual(['a', 'b', 'a', 'b']);
  });

  it('replays the same match from the same seed and varies with another seed', () => {
    const moves = (seed: number) =>
      playMatch(levelBot('easy'), levelBot('beginner'), 4, mulberry32(seed)).games.map((game) =>
        game.moves.join(''),
      );
    expect(moves(3)).toEqual(moves(3));
    expect(moves(3)).not.toEqual(moves(4));
    expect(new Set(moves(3)).size).toBeGreaterThan(1);
  });

  it('scores a draw as half a point for each side', () => {
    // A full game of 42 moves that ends without four in a row.
    const drawGame = '231220400060316366502612332554644541451513';
    const scripted: Bot = (state) => Number(drawGame[state.history.length]);
    const result = playMatch(scripted, scripted, 2, mulberry32(5));
    expect(result.games.every((game) => game.winner === null)).toBe(true);
    expect(result.a).toMatchObject({ wins: 0, losses: 0, draws: 2, score: 1 });
    expect(result.b).toMatchObject({ wins: 0, losses: 0, draws: 2, score: 1 });
    expect(formatResult({ a: 'x', b: 'y' }, result)).toContain('1 (50.0%)');
  });
});

describe('parseArgs', () => {
  it('reads two levels, the number of games and a seed', () => {
    expect(parseArgs(['Hard', 'medium', '20', '--seed', '42'])).toEqual({
      levelA: 'hard',
      levelB: 'medium',
      games: 20,
      seed: 42,
    });
    expect(parseArgs(['--seed=7', 'easy', 'beginner'])).toEqual({
      levelA: 'easy',
      levelB: 'beginner',
      games: DEFAULT_GAMES,
      seed: 7,
    });
    expect(parseArgs(['expert', 'hard']).seed).toBeUndefined();
  });

  it('rejects unknown levels, options and bad numbers', () => {
    expect(() => parseArgs(['easy'])).toThrow();
    expect(() => parseArgs(['easy', 'master'])).toThrow(/Unknown level/);
    expect(() => parseArgs(['easy', 'hard', '0'])).toThrow();
    expect(() => parseArgs(['easy', 'hard', 'many'])).toThrow();
    expect(() => parseArgs(['easy', 'hard', '--seed'])).toThrow();
    expect(() => parseArgs(['easy', 'hard', '--fast'])).toThrow(/Unknown option/);
    expect(() => parseArgs(['easy', 'hard', '10', 'extra'])).toThrow();
  });
});
