# Project status

_Last updated: 2026-09-24, #26 (a consistent look in light and dark mode)._

## Can I play yet?

**Yes: against a friend on the same computer, against the computer, or online against a friend on another PC.** Open https://ascanius3791.github.io/Connect_4/ and pick a mode above the board:

- **Two players** (the default): take turns clicking a column; a disc drops into the lowest free slot. Red starts, then yellow. The line above the board shows whose turn it is, then "Red wins!", "Yellow wins!" or "Draw!".
- **Against the computer**: choose "You start" or "Computer starts"; whoever starts plays red. Then pick a **Level** (Medium is preselected):
  - **Beginner** plays random moves.
  - **Easy** takes a win when it has one and blocks yours, otherwise plays randomly.
  - **Medium** looks 4 moves ahead (yours and its own), **Hard** 8 moves; both sometimes pick a slightly worse move, so games vary.
  - **Expert** thinks for a full second per move and is very hard to beat.

  Click a column on your turn; the computer answers after half a second to a second. Changing the level starts a new game right away. While the computer thinks, the page keeps reacting: "New game" or changing the mode, who starts or the level cancels its move at once. The line above the board says "Your turn", "Computer is thinking…", "You win!", "Computer wins!" or "Draw!".

- **Play online**: a link appears; click "Copy link" and send it to your friend. When they open it, the game starts. You (the one who sent the link) play red and move first; your friend plays yellow. Each of you clicks on your own screen during your turn, and the move shows up on both boards right away. The line says "Your turn", "Opponent's turn", "You win!", "Opponent wins!" or "Draw!". If the two games ever disagree, both see "Game out of sync" and the connection ends.
  - **Rematch**: after a game, both of you see a "Rematch" button. When one clicks it, the other sees "Opponent wants a rematch" and an "Accept" button. Once accepted, a new game starts on both PCs, and whoever moved second last time starts (and plays red).
  - **Problems**: if your opponent closes the tab or the connection drops, the line shows "Connection lost" within about 10 seconds and the board stops taking clicks. A link to a game that no longer exists shows "Could not join this game. Ask for a new link." within about 15 seconds. If the host's own internet drops briefly while waiting, the link keeps working; if it stays down, the host sees a message to start a new online game. To play again after any of these, pick another mode, then "Play online" for a new link; no reload needed.

**Analysis** (in "Two players" and "Against the computer"): click the "Analysis" button below "New game" to switch it on or off. While it is on, the computer looks at every position for about a second: a green ring marks the cell where the best move's disc would land, and the line next to the button says what it found, for example "Red wins in 2 moves", "Draw with best play" or "No forced win within the next 6 moves" (how far it looked, counting each player's own moves). It never changes the computer's own moves.

Changing the mode, who starts or the level begins a new game right away. "New game" starts over with the current choices; in an online game it is switched off; use "Rematch" after the game instead.

## Progress

| Milestone      | Status                   |
| -------------- | ------------------------ |
| 1. Setup       | Done                     |
| 2. Local game  | Done                     |
| 3. Random bot  | Done                     |
| 4. Online play | Done                     |
| 5. GUI polish  | In progress              |
| 6. Bot levels  | Reviewed, play-test next |

## What works

- Every push is checked automatically and deployed to the website.
- A complete local game for two players: 7 × 6 board, red and yellow discs, click a column to play.
- Playing against a computer on five levels, from random moves (Beginner) to a full second of looking ahead (Expert), in the background so the page never freezes, with you or the computer starting. If the background search ever fails, the computer still moves, using a quicker search, and the error appears in the browser console.
- The levels are measured, not guessed: in bot-against-bot matches each level scores 83% to 97% against the one below it (results in docs/bot-levels.md).
- A status line shows whose turn it is and the result; screen readers announce it.
- "New game" restarts at any point, during or after a game.
- Online play between two PCs (or two tabs): a direct connection via PeerJS with no server of our own, a shareable link with a "Copy link" button, a check that both pages are the same version, and live moves. Every received move is checked; anything that does not fit ends the game as "out of sync" on both sides instead of letting the boards drift apart.
- Online games notice a closed tab or dropped connection (the pages exchange a short signal every few seconds), give up on a link that cannot be joined, and offer a rematch in which the players take turns starting.
- The board only reacts to the mouse (highlight, hand cursor) when it is your turn.
- Behind the scenes: a fast internal board that can try out about 16 million positions per second, a score for how good a position looks (counting the lines of four each player can still complete, plus discs in the centre column), and a search that looks ahead as many moves as its time allows (from the start of a game, 8 moves take about 6 milliseconds, 12 moves about 0.14 seconds), finds forced wins and says what it could prove (for example "Red wins in 2 moves" or a draw). The computer opponent uses it since #34 (Medium, Hard and Expert since #35).
- A designed look that follows your system's light or dark setting: segmented buttons for the mode, who starts and the level, one button style, a panel for the online link, a spinner while connecting and red error boxes when something goes wrong, a shaded board with rounded corners, and a Connect 4 icon in the browser tab. The whole page fits a laptop or desktop window without scrolling, with room on both sides of the board for the player cards coming next.
- An "Analysis" button that shows the best move on the board and what the search proves about the position, in its own background worker so it never slows the computer's moves.

## Next up

Your play-test of milestone 6 (bot levels) on the website; problems you find become bug issues.

Then the rest of milestone 5 (GUI polish):

1. #27 Show which colour you play and whose turn it is
2. #28 Falling discs and a preview of your move
3. #29 Winning line highlight and a game-over screen
4. #30 Remember the chosen mode across reloads
