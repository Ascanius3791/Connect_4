# Project status

_Last updated: 2026-09-24, after issue #8._

## Can I play yet?

**Not yet.** The deployed page (https://ascanius3791.github.io/Connect_4/) only shows a heading so far. The game rules are being built in the background; the first playable version arrives with #9, when the board appears and you can click columns to drop discs. This section will then explain how to play.

## Progress

| Milestone      | Status                           |
| -------------- | -------------------------------- |
| 1. Setup       | Done                             |
| 2. Local game  | In progress (3 of 5 issues done) |
| 3. Random bot  | Planned                          |
| 4. Online play | Planned                          |
| 5. GUI polish  | Planned                          |
| 6. Bot levels  | Planned                          |

## What works

- Every push is checked automatically and deployed to the website.
- Behind the scenes: a model of the 7 × 6 board that knows where a dropped disc lands and when a column is full, and rules that recognise four in a row (in any direction) and a draw on a full board, and a game manager that tracks whose turn it is, records every move, refuses illegal moves and knows when the game is won or drawn. Nothing of it is visible yet.

## Next up

1. #9 Show the board and drop discs by clicking a column ← **first playable version**
2. #10 Show whose turn it is, the result, and a "New game" button
