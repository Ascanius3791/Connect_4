# Project status

_Last updated: 2026-09-24, after issue #9._

## Can I play yet?

**Yes, two players on one computer.** Open https://ascanius3791.github.io/Connect_4/ and take turns clicking a column; a disc drops into the lowest free slot. Red starts, then yellow. Hovering a column highlights it. Full columns and a finished game ignore clicks.

Not there yet: the page does not show whose turn it is or who won, and there is no "New game" button (reload the page to start over). Both come with #10.

## Progress

| Milestone      | Status                           |
| -------------- | -------------------------------- |
| 1. Setup       | Done                             |
| 2. Local game  | In progress (4 of 5 issues done) |
| 3. Random bot  | Planned                          |
| 4. Online play | Planned                          |
| 5. GUI polish  | Planned                          |
| 6. Bot levels  | Planned                          |

## What works

- Every push is checked automatically and deployed to the website.
- The board appears in the browser: 7 columns × 6 rows, red and yellow discs, click a column to play.
- Behind the scenes, the game knows where discs land, whose turn it is, refuses illegal moves, and recognises four in a row in any direction and a draw.

## Next up

1. #10 Show whose turn it is, the result, and a "New game" button
