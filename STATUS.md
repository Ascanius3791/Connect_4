# Project status

_Last updated: 2026-09-24, after issue #18._

## Can I play yet?

**Yes, against a friend on the same computer or against the computer.** Open https://ascanius3791.github.io/Connect_4/ and pick a mode above the board:

- **Two players** (the default): take turns clicking a column; a disc drops into the lowest free slot. Red starts, then yellow. The line above the board shows whose turn it is, then "Red wins!", "Yellow wins!" or "Draw!".
- **Against the computer**: choose "You start" or "Computer starts"; whoever starts plays red. Click a column on your turn, and the computer answers after a short pause. It still plays random moves, so it is easy to beat. The line above the board says "Your turn", "Computer is thinking…", "You win!", "Computer wins!" or "Draw!".

Changing the mode or who starts begins a new game right away. "New game" starts over with the current choices.

## Progress

| Milestone      | Status  |
| -------------- | ------- |
| 1. Setup       | Done    |
| 2. Local game  | Done    |
| 3. Random bot  | Done    |
| 4. Online play | Started |
| 5. GUI polish  | Planned |
| 6. Bot levels  | Planned |

## What works

- Every push is checked automatically and deployed to the website.
- A complete local game for two players: 7 × 6 board, red and yellow discs, click a column to play.
- Playing against a computer that picks random moves, with you or the computer starting.
- A status line shows whose turn it is and the result; screen readers announce it.
- "New game" restarts at any point, during or after a game.
- Groundwork for online play: two browsers can open a direct connection to each other (via PeerJS, no server of our own), and there is a fixed, checked message format for what they send each other (moves, rematch, keep-alive), so broken or outdated data is ignored. None of this is visible in the game yet.

## Next up

1. #19 Host an online game and join it via a shared link
