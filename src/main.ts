import './style.css';
import { newGame, playMove, type GameState } from './game/game';
import { createBoardView } from './ui/board-view';
import { createStatusView } from './ui/status-view';

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('Missing #app element');

const heading = document.createElement('h1');
heading.textContent = 'Connect 4';
const statusContainer = document.createElement('div');
statusContainer.className = 'status-bar';
const boardContainer = document.createElement('div');
app.replaceChildren(heading, statusContainer, boardContainer);

let state = newGame();
const statusView = createStatusView(statusContainer, () => show(newGame()));
const boardView = createBoardView(boardContainer, (column) => {
  const next = playMove(state, column);
  if (next !== state) show(next);
});
show(state);

function show(next: GameState): void {
  state = next;
  statusView.render(state);
  boardView.render(state);
}
