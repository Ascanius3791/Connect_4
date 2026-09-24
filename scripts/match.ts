import { newGame, playMove, type GameState } from '../src/game/game';
import { chooseLevelMove, LEVELS, type Level } from '../src/bot/levels';
import type { RandomSource } from '../src/bot/random-bot';

/** A bot for a match: picks a column for the player to move. */
export type Bot = (state: GameState, random: RandomSource) => number;

/** The bot playing a level, exactly as the game does. */
export function levelBot(level: Level): Bot {
  return (state, random) => chooseLevelMove(state, level, random);
}

/** Wins, losses and draws of one side of a match. */
export interface Tally {
  wins: number;
  losses: number;
  draws: number;
  /** Win 1, draw ½, loss 0. */
  score: number;
  /** Longest time one of this side's moves took, in milliseconds. */
  slowestMoveMs: number;
}

/** One finished game. `starter` and `winner` name a side, 'a' or 'b'. */
export interface GameRecord {
  readonly starter: 'a' | 'b';
  readonly winner: 'a' | 'b' | null;
  readonly moves: readonly number[];
}

export interface MatchResult {
  readonly a: Tally;
  readonly b: Tally;
  readonly games: readonly GameRecord[];
}

/**
 * Plays `games` games between bots `a` and `b`, alternating who starts
 * (`a` starts the first game). Both bots draw their randomness from
 * `random`, so the same seed replays the same match as long as the bots
 * themselves do not depend on the clock. `onGame` reports each finished
 * game, for progress output.
 */
export function playMatch(
  a: Bot,
  b: Bot,
  games: number,
  random: RandomSource,
  onGame?: (game: GameRecord, index: number) => void,
): MatchResult {
  const tallies = { a: emptyTally(), b: emptyTally() };
  const records: GameRecord[] = [];
  for (let index = 0; index < games; index++) {
    const starter = index % 2 === 0 ? 'a' : 'b';
    const second = starter === 'a' ? 'b' : 'a';
    const bots = { a, b };
    let state = newGame();
    while (state.status.kind === 'playing') {
      // Player 1 (red) is always the starter.
      const side = state.currentPlayer === 1 ? starter : second;
      const started = performance.now();
      const column = bots[side](state, random);
      const tally = tallies[side];
      tally.slowestMoveMs = Math.max(tally.slowestMoveMs, performance.now() - started);
      const next = playMove(state, column);
      if (next === state) throw new Error(`Side ${side} played an illegal column ${column}`);
      state = next;
    }
    const winner =
      state.status.kind === 'won' ? (state.status.winner === 1 ? starter : second) : null;
    if (winner === null) {
      for (const tally of [tallies.a, tallies.b]) {
        tally.draws++;
        tally.score += 0.5;
      }
    } else {
      const loser = winner === 'a' ? 'b' : 'a';
      tallies[winner].wins++;
      tallies[winner].score++;
      tallies[loser].losses++;
    }
    const record: GameRecord = { starter, winner, moves: state.history };
    records.push(record);
    onGame?.(record, index);
  }
  return { a: tallies.a, b: tallies.b, games: records };
}

function emptyTally(): Tally {
  return { wins: 0, losses: 0, draws: 0, score: 0, slowestMoveMs: 0 };
}

/** Small seeded generator (mulberry32): numbers in [0, 1) like `Math.random`. */
export function mulberry32(seed: number): RandomSource {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface MatchArgs {
  readonly levelA: Level;
  readonly levelB: Level;
  readonly games: number;
  /** Undefined when the caller should pick a random seed. */
  readonly seed: number | undefined;
}

export const DEFAULT_GAMES = 100;

export const USAGE = `Usage: npm run bot-match -- <levelA> <levelB> [games] [--seed <n>]
Levels: ${LEVELS.join(', ')}. Games default to ${DEFAULT_GAMES}.`;

/** Parses the command line arguments after the script name; throws with a message on bad input. */
export function parseArgs(args: readonly string[]): MatchArgs {
  const positional: string[] = [];
  let seed: number | undefined;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i] ?? '';
    if (arg === '--seed') {
      seed = parseInteger(args[++i], 'seed');
    } else if (arg.startsWith('--seed=')) {
      seed = parseInteger(arg.slice('--seed='.length), 'seed');
    } else if (arg.startsWith('--')) {
      throw new Error(`Unknown option ${arg}`);
    } else {
      positional.push(arg);
    }
  }
  const [a, b, games, ...rest] = positional;
  if (a === undefined || b === undefined || rest.length > 0) {
    throw new Error('Expected two levels and optionally a number of games');
  }
  const gameCount = games === undefined ? DEFAULT_GAMES : parseInteger(games, 'games');
  if (gameCount < 1) throw new Error('The number of games must be at least 1');
  return { levelA: parseLevel(a), levelB: parseLevel(b), games: gameCount, seed };
}

function parseLevel(text: string): Level {
  const level = LEVELS.find((candidate) => candidate === text.toLowerCase());
  if (level === undefined) throw new Error(`Unknown level "${text}"`);
  return level;
}

function parseInteger(text: string | undefined, name: string): number {
  if (text === undefined || !/^\d+$/.test(text)) {
    throw new Error(`The ${name} must be a whole number, got "${text ?? ''}"`);
  }
  return Number(text);
}

/** The result table the script prints. */
export function formatResult(names: { a: string; b: string }, result: MatchResult): string {
  const games = result.games.length;
  const nameWidth = Math.max(names.a.length, names.b.length, 'level'.length);
  const widths = [nameWidth, 6, 6, 6, 13, 9];
  const row = (cells: readonly string[]) =>
    cells
      .map((cell, i) => (i === 0 ? cell.padEnd(nameWidth) : cell.padStart(widths[i] ?? 0)))
      .join('  ');
  const line = (name: string, tally: Tally) =>
    row([
      name,
      String(tally.wins),
      String(tally.losses),
      String(tally.draws),
      `${formatScore(tally.score)} (${((100 * tally.score) / games).toFixed(1)}%)`,
      `${tally.slowestMoveMs.toFixed(0)} ms`,
    ]);
  return [
    row(['level', 'wins', 'losses', 'draws', 'score', 'slowest']),
    line(names.a, result.a),
    line(names.b, result.b),
  ].join('\n');
}

function formatScore(score: number): string {
  return Number.isInteger(score) ? String(score) : score.toFixed(1);
}
