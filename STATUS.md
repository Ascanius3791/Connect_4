# Project status

_Last updated: 2026-09-24, after issue #20 (online games are playable: moves appear live on both PCs)._

## Can I play yet?

**Yes: against a friend on the same computer, against the computer, or online against a friend on another PC.** Open https://ascanius3791.github.io/Connect_4/ and pick a mode above the board:

- **Two players** (the default): take turns clicking a column; a disc drops into the lowest free slot. Red starts, then yellow. The line above the board shows whose turn it is, then "Red wins!", "Yellow wins!" or "Draw!".
- **Against the computer**: choose "You start" or "Computer starts"; whoever starts plays red. Click a column on your turn, and the computer answers after a short pause. It still plays random moves, so it is easy to beat. The line above the board says "Your turn", "Computer is thinking…", "You win!", "Computer wins!" or "Draw!".
- **Play online**: a link appears; click "Copy link" and send it to your friend. When they open it, the game starts. You (the one who sent the link) play red and move first; your friend plays yellow. Each of you clicks on your own screen during your turn, and the move shows up on both boards right away. The line says "Your turn", "Opponent's turn", "You win!", "Opponent wins!" or "Draw!". If the two games ever disagree, both see "Game out of sync" and the connection ends.

Changing the mode or who starts begins a new game right away. "New game" starts over with the current choices; in an online game it is switched off for now.

Not handled online yet (next issue): noticing that the other player has left or lost the connection, a clear message for a broken link, and a rematch. For a new online game, choose "Play online" again and send the new link.

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
- Online play between two PCs (or two tabs): a direct connection via PeerJS with no server of our own, a shareable link with a "Copy link" button, a check that both pages are the same version, and live moves. Every received move is checked; anything that does not fit ends the game as "out of sync" on both sides instead of letting the boards drift apart.

## Next up

1. #21 Handle lost connections, bad links and rematches online
