import './style.css';
import { createGameController, type Seats } from './app/controller';
import {
  hostOnlineGame,
  joinOnlineGame,
  parseJoinId,
  type OnlineSession,
  type OnlineStatus,
} from './app/online';
import { createModeView, DEFAULT_MODE_SETTINGS, type ModeSettings } from './ui/mode-view';
import { createOnlineView, onlineStatusText } from './ui/online-view';

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('Missing #app element');

const heading = document.createElement('h1');
heading.textContent = 'Connect 4';
const modeContainer = document.createElement('div');
modeContainer.className = 'mode-bar';
const onlineContainer = document.createElement('div');
const statusContainer = document.createElement('div');
statusContainer.className = 'status-bar';
const boardContainer = document.createElement('div');
app.replaceChildren(heading, modeContainer, onlineContainer, statusContainer, boardContainer);

/** Player 1 always moves first and plays red, so the starter takes seat 1. */
function seatsFor(settings: ModeSettings): Seats {
  switch (settings.mode) {
    // Until connected, the connection notice keeps the board locked; the
    // online session then starts a game with a remote seat.
    case 'online':
    case 'two-players':
      return { 1: 'human', 2: 'human' };
    case 'computer':
      return settings.starter === 'human' ? { 1: 'human', 2: 'bot' } : { 1: 'bot', 2: 'human' };
  }
}

// Opening a join link starts the page in online mode as the guest.
const joinId = parseJoinId(location.hash);
const initialSettings: ModeSettings =
  joinId === undefined ? DEFAULT_MODE_SETTINGS : { ...DEFAULT_MODE_SETTINGS, mode: 'online' };

let session: OnlineSession | undefined;
const controller = createGameController(
  { status: statusContainer, board: boardContainer },
  {
    seats: seatsFor(initialSettings),
    onHumanMove: (index, column) => session?.sendMove(index, column),
  },
);
const onlineView = createOnlineView(onlineContainer, () => session?.rematch());

/** Shows the online setup in the link box and status line; `undefined` when offline. */
function showOnlineStatus(status: OnlineStatus | undefined): void {
  onlineView.render(status);
  controller.setNotice(status && onlineStatusText(status));
}

if (joinId !== undefined) session = joinOnlineGame(joinId, controller, showOnlineStatus);

createModeView(modeContainer, initialSettings, (settings) => {
  session?.close();
  session = undefined;
  // The join link has served its purpose; reloading should not join again.
  if (location.hash) history.replaceState(null, '', location.pathname + location.search);
  controller.newGame(seatsFor(settings));
  if (settings.mode === 'online') {
    session = hostOnlineGame(location.href, controller, showOnlineStatus);
  } else {
    showOnlineStatus(undefined);
  }
});

// Pasting a join link into a tab that already shows the game only changes the
// fragment; reload so the page starts as the guest.
addEventListener('hashchange', () => {
  if (parseJoinId(location.hash) !== undefined) location.reload();
});
