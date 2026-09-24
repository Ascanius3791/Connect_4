import './style.css';
import { createGameController, type Seats } from './app/controller';
import { createModeView, DEFAULT_MODE_SETTINGS, type ModeSettings } from './ui/mode-view';

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('Missing #app element');

const heading = document.createElement('h1');
heading.textContent = 'Connect 4';
const modeContainer = document.createElement('div');
modeContainer.className = 'mode-bar';
const statusContainer = document.createElement('div');
statusContainer.className = 'status-bar';
const boardContainer = document.createElement('div');
app.replaceChildren(heading, modeContainer, statusContainer, boardContainer);

/** Player 1 always moves first and plays red, so the starter takes seat 1. */
function seatsFor(settings: ModeSettings): Seats {
  if (settings.mode === 'two-players') return { 1: 'human', 2: 'human' };
  return settings.starter === 'human' ? { 1: 'human', 2: 'bot' } : { 1: 'bot', 2: 'human' };
}

const controller = createGameController(
  { status: statusContainer, board: boardContainer },
  { seats: seatsFor(DEFAULT_MODE_SETTINGS) },
);
createModeView(modeContainer, DEFAULT_MODE_SETTINGS, (settings) =>
  controller.newGame(seatsFor(settings)),
);
