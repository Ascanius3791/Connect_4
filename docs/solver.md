# Solver: speed and decisions

`src/bot/solver.ts` decides whether the player to move wins, draws or loses when both sides play perfectly (a "weak" solver: it does not find the distance to the win). It follows Pascal Pons' tutorial (http://blog.gamesolver.org/): negamax with alpha-beta over the values -1, 0 and 1, never playing a move that hands the opponent an immediate win, moves ordered by how many winning cells they create, and a transposition table of bounds (32 MB by default, a position and its mirror image share an entry). It answers one position with at most two null-window searches: "can the player to move win?" and, if not, "can they at least draw?".

## Benchmark

```sh
npm run solver-bench -- <file>... [--max-positions <n>] [--time-limit <ms>] [--by-moves]
```

The test files are Pons' six sets of 1000 positions each, not committed to this repository. Download them from http://blog.gamesolver.org/data/, e.g. http://blog.gamesolver.org/data/Test_L3_R1, and likewise `Test_L2_R1`, `Test_L2_R2`, `Test_L1_R1`, `Test_L1_R2` and `Test_L1_R3`. Each line is a position (columns 1-7 from the empty board) and its exact score; the benchmark compares the score's sign with the solver's answer. The table is cleared before every position, so the times do not depend on the order of a file. `--by-moves` breaks the results down by the number of discs already played.

## Results

Measured on 2026-09-24 on the development PC (Intel Core i7-1065G7, 8 threads, Node 24), one thread, with `--time-limit 10000`. The table used "always replace" (`--replacement always`), the default before the comparison below; the node counts of the first five files are exact for it, the times vary by about ±30% between runs on this laptop.

| File       | Discs played | Positions | Mean time | Slowest | Mean nodes | Most nodes | Wrong | Over 10 s |
| ---------- | -----------: | --------: | --------: | ------: | ---------: | ---------: | ----: | --------: |
| Test_L3_R1 |        29-41 |      1000 |  0.028 ms |  2.3 ms |         29 |      1,486 |     0 |         0 |
| Test_L2_R1 |        15-28 |      1000 |  0.133 ms |   14 ms |        486 |     59,516 |     0 |         0 |
| Test_L2_R2 |        15-27 |      1000 |    7.2 ms |  346 ms |     19,668 |    817,845 |     0 |         0 |
| Test_L1_R1 |         4-14 |      1000 |    5.9 ms |  359 ms |     22,178 |  1,328,918 |     0 |         0 |
| Test_L1_R2 |         4-14 |      1000 |    126 ms |   4.5 s |    531,174 | 18,315,102 |     0 |         0 |
| Test_L1_R3 |         1-13 |      1000 |     3.8 s |  > 10 s | 14,563,554 | 43,545,600 |     0 |       216 |

Test_L1_R3 was measured with an earlier build that was about 14% slower per node (it also scored moves where only one was possible); its node counts are the same. All 5,784 positions that finished were solved correctly. The solver visits about 3.5 to 4 million positions per second.

The hard opening positions (Test_L1_R3 and Test_L1_R2) by discs played, slowest time per group:

| Discs played | L1_R3 positions | L1_R3 slowest | L1_R3 over 10 s | L1_R2 positions | L1_R2 slowest |
| -----------: | --------------: | ------------: | --------------: | --------------: | ------------: |
|          1-3 |              81 |        > 10 s |              62 |               0 |             – |
|            4 |             130 |        > 10 s |              72 |               2 |        193 ms |
|            5 |             160 |        > 10 s |              51 |               6 |         1.0 s |
|            6 |             146 |        > 10 s |              24 |              33 |         3.5 s |
|            7 |             137 |        > 10 s |               5 |              48 |         4.5 s |
|            8 |             120 |        > 10 s |               2 |              68 |         2.3 s |
|            9 |              77 |         7.3 s |               0 |             100 |         1.6 s |
|           10 |              64 |         8.5 s |               0 |             112 |        938 ms |
|           11 |              50 |        977 ms |               0 |             144 |         1.2 s |
|           12 |              19 |         1.5 s |               0 |             172 |         1.3 s |
|           13 |              16 |         2.0 s |               0 |             150 |        668 ms |
|           14 |               0 |             – |               – |             165 |        678 ms |

From 14 discs on, every measured position took under 1 s (Test_L2_R2 starts at 15 discs, slowest 346 ms).

## Transposition table

Two ways to fill the table, same memory (`SolverOptions.replacement`, bench option `--replacement`): "always" keeps one entry per slot and overwrites it; "depth" (the default) uses buckets of two entries, where the first keeps the position with the fewest discs (the most work to find again) and the second takes everything else. Node counts on samples of Test_L1_R3 (identical answers), `--time-limit 30000`:

| Sample                          | Always: mean / most nodes | Depth: mean / most nodes | Depth saves |
| ------------------------------- | ------------------------: | -----------------------: | ----------- |
| First 20 positions, 6-7 discs   |       20,575,019 / 96.9 M |      17,617,721 / 70.9 M | 14% / 27%   |
| First 120 positions, 8-10 discs |        3,449,708 / 31.5 M |       3,376,154 / 27.8 M | 2% / 12%    |

With fewer nodes than table entries (the later files) both give the same counts; "depth" helps once the table fills up, as in the hard openings, while generating the opening book and in a table kept across the moves of a game. On Test_L1_R2, which rarely fills the table, both need about the same number of nodes.

## Decisions

**Opening book depth (#39).** The solver answers within 1 s in every measured position from 14 discs on, but not before: with 11 to 13 discs the slowest positions took 1.0 to 2.0 s, and with 10 or fewer up to 10 s and more. So for the 1 s target the book must cover the positions with up to 13 discs in which the Perfect bot has to move; if a slowest case of about 2 s is acceptable (the Perfect level's budget in #40), up to 10 discs. The book only needs the positions the bot can reach while following it (its own chosen move, every reply of the opponent), and in a lost position it needs no values of the moves, since every move loses. #39 measures the generation time for each depth before choosing.

**TypeScript or WebAssembly.** TypeScript is fast enough. WebAssembly with native 64-bit integers might visit two to three times as many positions per second, which would move the depth the book needs by only one or two discs, at the cost of a second language and build step. The book, not the solver's raw speed, is what keeps every move fast. Revisit only if generating the book turns out to be impractical.
