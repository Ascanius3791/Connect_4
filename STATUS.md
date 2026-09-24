# Project status

_Last updated: 2026-09-24, after issue #14._

## Can I play yet?

**Yes, two players on one computer.** Open https://ascanius3791.github.io/Connect_4/ and take turns clicking a column; a disc drops into the lowest free slot. Red starts, then yellow. The line above the board shows whose turn it is, then "Red wins!", "Yellow wins!" or "Draw!" when the game ends. Click "New game" at any time to start over with an empty board.

## Progress

| Milestone      | Status  |
| -------------- | ------- |
| 1. Setup       | Done    |
| 2. Local game  | Done    |
| 3. Random bot  | Started |
| 4. Online play | Planned |
| 5. GUI polish  | Planned |
| 6. Bot levels  | Planned |

## What works

- Every push is checked automatically and deployed to the website.
- A complete local game for two players: 7 × 6 board, red and yellow discs, click a column to play.
- A status line shows whose turn it is and the result; screen readers announce it.
- "New game" restarts at any point, during or after a game.
- The computer opponent can pick a random legal move; it cannot be played against yet.

## Next up

1. #15 Let the computer take its turns automatically
2. #16 Choose between two players and playing against the computer
