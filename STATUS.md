# Project status

_Last updated: 2026-09-24, after issue #21 (online games notice a lost connection, reject broken links, and offer a rematch)._

## Can I play yet?

**Yes: against a friend on the same computer, against the computer, or online against a friend on another PC.** Open https://ascanius3791.github.io/Connect_4/ and pick a mode above the board:

- **Two players** (the default): take turns clicking a column; a disc drops into the lowest free slot. Red starts, then yellow. The line above the board shows whose turn it is, then "Red wins!", "Yellow wins!" or "Draw!".
- **Against the computer**: choose "You start" or "Computer starts"; whoever starts plays red. Click a column on your turn, and the computer answers after a short pause. It still plays random moves, so it is easy to beat. The line above the board says "Your turn", "Computer is thinking…", "You win!", "Computer wins!" or "Draw!".
- **Play online**: a link appears; click "Copy link" and send it to your friend. When they open it, the game starts. You (the one who sent the link) play red and move first; your friend plays yellow. Each of you clicks on your own screen during your turn, and the move shows up on both boards right away. The line says "Your turn", "Opponent's turn", "You win!", "Opponent wins!" or "Draw!". If the two games ever disagree, both see "Game out of sync" and the connection ends.
  - **Rematch**: after a game, both of you see a "Rematch" button. When one clicks it, the other sees "Opponent wants a rematch" and an "Accept" button. Once accepted, a new game starts on both PCs, and whoever moved second last time starts (and plays red).
  - **Problems**: if your opponent closes the tab or the connection drops, the line shows "Connection lost" within about 10 seconds and the board stops taking clicks. A link to a game that no longer exists shows "Could not join this game. Ask for a new link." within about 15 seconds. To play again after either, pick another mode, then "Play online" for a new link; no reload needed.

Changing the mode or who starts begins a new game right away. "New game" starts over with the current choices; in an online game it is switched off; use "Rematch" after the game instead.

## Progress

| Milestone      | Status  |
| -------------- | ------- |
| 1. Setup       | Done    |
| 2. Local game  | Done    |
| 3. Random bot  | Done    |
| 4. Online play | Review  |
| 5. GUI polish  | Planned |
| 6. Bot levels  | Planned |

## What works

- Every push is checked automatically and deployed to the website.
- A complete local game for two players: 7 × 6 board, red and yellow discs, click a column to play.
- Playing against a computer that picks random moves, with you or the computer starting.
- A status line shows whose turn it is and the result; screen readers announce it.
- "New game" restarts at any point, during or after a game.
- Online play between two PCs (or two tabs): a direct connection via PeerJS with no server of our own, a shareable link with a "Copy link" button, a check that both pages are the same version, and live moves. Every received move is checked; anything that does not fit ends the game as "out of sync" on both sides instead of letting the boards drift apart.
- Online games notice a closed tab or dropped connection (the pages exchange a short signal every few seconds), give up on a link that cannot be joined, and offer a rematch in which the players take turns starting.

## Next up

1. Review of milestone 4 (Online play): code review, fixes, then a play-test checklist for you
