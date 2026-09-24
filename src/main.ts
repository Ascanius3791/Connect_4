import './style.css';
import { newGame, playMove } from './game/game';
import { createBoardView } from './ui/board-view';

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('Missing #app element');

const heading = document.createElement('h1');
heading.textContent = 'Connect 4';
const boardContainer = document.createElement('div');
app.replaceChildren(heading, boardContainer);

let state = newGame();
const view = createBoardView(boardContainer, (column) => {
  const next = playMove(state, column);
  if (next === state) return;
  state = next;
  view.render(state);
});
view.render(state);
