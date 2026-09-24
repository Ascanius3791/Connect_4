# Bot levels: parameters and measured strength

Each level should clearly beat the one directly below it (at least 65% of the points, win 1, draw ½). Measured with

```sh
npm run bot-match -- <levelA> <levelB> [games] [--seed <n>]
```

which plays the levels exactly as the game does, alternating who starts. Re-run these pairings after changing `src/bot/levels.ts` or `src/bot/evaluate.ts` and compare.

## Parameters

Levels (`LEVEL_PLAY` in `src/bot/levels.ts`):

| Level    | How it plays                                                         |
| -------- | -------------------------------------------------------------------- |
| Beginner | Random legal move                                                    |
| Easy     | Win in one if possible, else block a win in one, else random         |
| Medium   | Search 4 plies, then pick any move within 6 of the best score        |
| Hard     | Search 8 plies, then pick any move within 2 of the best score        |
| Expert   | Search as deep as 1 second allows (usually 12+ plies), the best move |

Every search stops after 1000 ms at most. Once a win or loss is proven, Medium and Hard play the best move without noise.

Evaluation weights (`src/bot/evaluate.ts`): a group of four with two discs of one player and two empty cells counts 2, with three discs 5, and each disc in the centre column 3.

## Results

Measured on 2026-09-24 (#36) on an 8-core Windows laptop, Node 24.

| Pairing          | Games | Seed | Wins–losses–draws | Score of the stronger level | Slowest move |
| ---------------- | ----: | ---: | ----------------- | --------------------------: | -----------: |
| Easy vs Beginner |   200 |    1 | 193–6–1           |                       96.8% |        11 ms |
| Medium vs Easy   |   200 |    1 | 193–5–2           |                       97.0% |        13 ms |
| Hard vs Medium   |   200 |    1 | 184–11–5          |                       93.3% |        75 ms |
| Expert vs Hard   |   100 |    2 | 81–15–4           |                       83.0% |      1001 ms |

Expert vs Hard takes about 15 minutes for 100 games. Its games depend on the machine's speed (Expert's depth is set by the clock), so the same seed only repeats exactly on a similar machine and load. An earlier run with seed 1, partly on a busy machine, gave 82–14–4 (84.0%).

## Evaluation weights tried

Variant weights (two, three, centre) against the current (2, 5, 3), both sides searching 8 plies, from random 4-move openings, each opening played with both colours. With 600 to 1000 games, differences of about ±3% are noise.

| Weights  | Score of the variant | Games |
| -------- | -------------------: | ----: |
| 2, 5, 3  |      49.7% (control) |   600 |
| 1, 5, 3  |                49.3% |   600 |
| 3, 5, 3  |                48.6% |   600 |
| 5, 5, 3  |                40.1% |   600 |
| 2, 8, 3  |         51.5%, 50.5% |  1200 |
| 2, 12, 3 |                50.0% |   600 |
| 2, 30, 3 |                45.3% |   600 |
| 3, 10, 3 |         53.2%, 49.9% |  1600 |
| 1, 8, 2  |                46.6% |   600 |
| 2, 5, 1  |         49.9%, 51.6% |  1600 |
| 2, 5, 0  |         54.2%, 46.4% |  1600 |
| 3, 10, 0 |                51.4% |  1000 |
| 2, 5, 6  |                47.3% |   600 |
| 1, 3, 1  |                50.8% |   600 |
| 0, 1, 0  |                29.0% |   600 |
| 0, 0, 1  |                16.8% |   600 |

No variant beat the current weights beyond noise, so they stay. Extreme weights (centre only, threes only, twos as heavy as threes) are clearly worse.
