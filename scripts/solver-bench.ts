/**
 * Solver benchmark from the command line (#38):
 *
 *   npm run solver-bench -- <file>... [--max-positions <n>] [--time-limit <ms>] [--by-moves]
 *     [--replacement always|depth] [--table-bits <n>]
 *
 * Solves the positions of Pascal Pons' test files (see docs/solver.md for
 * where to get them) and prints, per file, the mean and slowest time and
 * node count per position, how many results disagree with the file and,
 * with --time-limit, how many positions ran out of time. --by-moves adds
 * the same per number of moves played, which shows how deep an opening
 * book must go (#39). Each line of a file is a position as column digits
 * 1-7 from the empty board and its exact score, whose sign is the result
 * for the player to move.
 */
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { Solver, type SolverValue } from '../src/bot/solver';

const USAGE =
  'Usage: npm run solver-bench -- <file>... [--max-positions <n>] [--time-limit <ms>] [--by-moves] [--replacement always|depth] [--table-bits <n>]';

interface Args {
  readonly files: readonly string[];
  readonly maxPositions: number;
  readonly timeLimitMs?: number;
  readonly byMoves: boolean;
  readonly replacement: 'always' | 'depth';
  readonly tableBits?: number;
}

function parseArgs(argv: readonly string[]): Args {
  const files: string[] = [];
  let maxPositions = Infinity;
  let timeLimitMs: number | undefined;
  let byMoves = false;
  let replacement: 'always' | 'depth' = 'depth';
  let tableBits: number | undefined;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] ?? '';
    if (arg === '--max-positions' || arg === '--time-limit') {
      const value = Number(argv[++i]);
      if (!Number.isFinite(value) || value <= 0) throw new Error(`${arg} needs a positive number`);
      if (arg === '--max-positions') maxPositions = Math.floor(value);
      else timeLimitMs = value;
    } else if (arg === '--by-moves') {
      byMoves = true;
    } else if (arg === '--replacement') {
      const value = argv[++i];
      if (value !== 'always' && value !== 'depth') throw new Error(`${arg} needs always or depth`);
      replacement = value;
    } else if (arg === '--table-bits') {
      tableBits = Number(argv[++i]);
      if (!Number.isInteger(tableBits)) throw new Error(`${arg} needs a whole number`);
    } else if (arg.startsWith('--')) {
      throw new Error(`Unknown option ${arg}`);
    } else {
      files.push(arg);
    }
  }
  if (files.length === 0) throw new Error('No test file given');
  return { files, maxPositions, timeLimitMs, byMoves, replacement, tableBits };
}

interface Position {
  readonly moves: readonly number[];
  readonly expected: SolverValue;
}

function readPositions(file: string, limit: number): Position[] {
  const positions: Position[] = [];
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    if (positions.length >= limit) break;
    const [digits, score] = line.trim().split(/\s+/);
    if (digits === undefined || digits === '' || score === undefined) continue;
    const value = Number(score);
    positions.push({
      moves: [...digits].map((digit) => Number(digit) - 1),
      expected: value > 0 ? 'win' : value < 0 ? 'loss' : 'draw',
    });
  }
  return positions;
}

/** One solved position. */
interface Run {
  readonly moveCount: number;
  readonly ms: number;
  readonly nodes: number;
  readonly outcome: 'right' | 'wrong' | 'timed out';
}

const HEADER = 'positions  mean ms  slowest ms   mean nodes  most nodes  wrong  timed out';

function summary(label: string, runs: readonly Run[]): string {
  const count = Math.max(1, runs.length);
  const sum = (pick: (run: Run) => number) => runs.reduce((total, run) => total + pick(run), 0);
  const max = (pick: (run: Run) => number) =>
    runs.reduce((most, run) => Math.max(most, pick(run)), 0);
  const outcomes = (outcome: Run['outcome']) =>
    runs.filter((run) => run.outcome === outcome).length;
  return [
    label.padEnd(12),
    String(runs.length).padStart(9),
    (sum((run) => run.ms) / count).toFixed(3).padStart(8),
    max((run) => run.ms)
      .toFixed(1)
      .padStart(11),
    Math.round(sum((run) => run.nodes) / count)
      .toString()
      .padStart(12),
    max((run) => run.nodes)
      .toString()
      .padStart(11),
    String(outcomes('wrong')).padStart(6),
    String(outcomes('timed out')).padStart(10),
  ].join(' ');
}

function main(): void {
  let args: Args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n${USAGE}\n`);
    process.exitCode = 1;
    return;
  }
  const solver = new Solver({ tableBits: args.tableBits, replacement: args.replacement });
  const progress = process.stderr.isTTY;
  for (const file of args.files) {
    const name = basename(file);
    const positions = readPositions(file, args.maxPositions);
    const runs: Run[] = positions.map((position, index) => {
      // Every position starts with an empty table, so the times do not
      // depend on the order of the file.
      solver.clear();
      const started = performance.now();
      const value = solver.solve(position.moves, { timeLimitMs: args.timeLimitMs });
      const ms = performance.now() - started;
      if (progress) process.stderr.write(`\r${name} ${index + 1}/${positions.length}`);
      return {
        moveCount: position.moves.length,
        ms,
        nodes: solver.nodes,
        outcome:
          value === undefined ? 'timed out' : value === position.expected ? 'right' : 'wrong',
      };
    });
    if (progress) process.stderr.write('\r\x1b[K');
    process.stdout.write(`${'file'.padEnd(12)} ${HEADER}\n${summary(name, runs)}\n`);
    if (args.byMoves) {
      process.stdout.write(`${'moves played'.padEnd(12)} ${HEADER}\n`);
      const counts = [...new Set(runs.map((run) => run.moveCount))].sort((a, b) => a - b);
      for (const moveCount of counts) {
        const group = runs.filter((run) => run.moveCount === moveCount);
        process.stdout.write(`${summary(String(moveCount), group)}\n`);
      }
    }
    process.stdout.write('\n');
    if (runs.some((run) => run.outcome === 'wrong')) process.exitCode = 1;
  }
}

main();
