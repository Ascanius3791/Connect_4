import './style.css';
import { createGameController } from './app/controller';

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('Missing #app element');

const heading = document.createElement('h1');
heading.textContent = 'Connect 4';
const statusContainer = document.createElement('div');
statusContainer.className = 'status-bar';
const boardContainer = document.createElement('div');
app.replaceChildren(heading, statusContainer, boardContainer);

createGameController(
  { status: statusContainer, board: boardContainer },
  { seats: { 1: 'human', 2: 'human' } },
);
