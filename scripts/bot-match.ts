/**
 * Bot-vs-bot match from the command line (#36):
 *
 *   npm run bot-match -- <levelA> <levelB> [games] [--seed <n>]
 *
 * Plays the levels exactly as the game does (the parameters in
 * src/bot/levels.ts), alternating who starts, and prints each side's wins,
 * losses, draws and score. Without --seed a random seed is chosen and
 * printed, so any match can be replayed. Levels that search with a time
 * limit (Expert) reach a depth that depends on the machine's speed, so
 * their games only repeat exactly on a similar machine and load.
 */
import { formatResult, levelBot, mulberry32, parseArgs, playMatch, USAGE } from './match';

function main(): void {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n${USAGE}\n`);
    process.exitCode = 1;
    return;
  }
  const { levelA, levelB, games } = args;
  const seed = args.seed ?? Math.floor(Math.random() * 2 ** 32);
  process.stdout.write(`${levelA} vs ${levelB}, ${games} games, seed ${seed}\n`);
  const started = performance.now();
  // Progress only on a terminal, so output redirected to a file stays clean.
  const progress = process.stderr.isTTY;
  const result = playMatch(levelBot(levelA), levelBot(levelB), games, mulberry32(seed), (_, i) => {
    if (progress) process.stderr.write(`\rgame ${i + 1}/${games}`);
  });
  if (progress) process.stderr.write('\n');
  const names =
    levelA === levelB ? { a: `${levelA} A`, b: `${levelB} B` } : { a: levelA, b: levelB };
  process.stdout.write(`${formatResult(names, result)}\n`);
  process.stdout.write(`took ${((performance.now() - started) / 1000).toFixed(1)} s\n`);
}

main();
