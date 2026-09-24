// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createInProcessEngine } from '../bot/engine';
import { newGame, playMove, type GameState } from '../game/game';
import { createChannelPair, type Channel, type JsonValue } from '../net/channel';
import { PROTOCOL_VERSION } from '../net/protocol';
import { createOnlineView, onlineStatusText } from '../ui/online-view';
import { createGameController } from './controller';
import {
  buildJoinLink,
  handshake,
  hostOnlineGame,
  joinOnlineGame,
  judgeRemoteMove,
  parseJoinId,
  type Connector,
  type HandshakeResult,
  type OnlineSession,
  type OnlineStatus,
} from './online';

const PAGES_URL = 'https://ascanius3791.github.io/Connect_4/';

// Fake timers drive the keep-alive and timeouts; channel deliveries still run
// as real microtasks.
beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

/** Waits until all queued deliveries have happened. */
const settle = () => vi.advanceTimersByTimeAsync(0);

/** Lets `ms` pass, delivering messages sent in between. */
const wait = (ms: number) => vi.advanceTimersByTimeAsync(ms);

describe('buildJoinLink', () => {
  it('appends the ID as a fragment to the Pages base path', () => {
    expect(buildJoinLink(PAGES_URL, 'abc-123')).toBe(
      'https://ascanius3791.github.io/Connect_4/#join=abc-123',
    );
  });

  it('replaces an existing fragment', () => {
    expect(buildJoinLink(`${PAGES_URL}#join=old`, 'new')).toBe(`${PAGES_URL}#join=new`);
    expect(buildJoinLink(`${PAGES_URL}#other`, 'new')).toBe(`${PAGES_URL}#join=new`);
  });

  it('works on the development server', () => {
    expect(buildJoinLink('http://localhost:5173/Connect_4/', 'abc')).toBe(
      'http://localhost:5173/Connect_4/#join=abc',
    );
  });

  it('encodes characters that would break the fragment', () => {
    const link = buildJoinLink(PAGES_URL, 'a b#c');
    expect(parseJoinId(new URL(link).hash)).toBe('a b#c');
  });
});

describe('parseJoinId', () => {
  it('reads the ID from a join link', () => {
    expect(parseJoinId(new URL(`${PAGES_URL}#join=abc-123`).hash)).toBe('abc-123');
    expect(parseJoinId(new URL(buildJoinLink(PAGES_URL, 'xyz')).hash)).toBe('xyz');
  });

  it('returns undefined without a join fragment', () => {
    expect(parseJoinId(new URL(PAGES_URL).hash)).toBeUndefined();
    expect(parseJoinId('')).toBeUndefined();
    expect(parseJoinId('#')).toBeUndefined();
    expect(parseJoinId('#other=abc')).toBeUndefined();
    expect(parseJoinId('#join=')).toBeUndefined();
  });

  it('returns undefined for a malformed encoding', () => {
    expect(parseJoinId('#join=%E0%A4%A')).toBeUndefined();
  });
});

/** Runs the handshake on `channel` and resolves with its result. */
function handshakeResult(channel: Channel, version?: number): Promise<HandshakeResult> {
  return new Promise((resolve) => handshake(channel, resolve, version));
}

describe('handshake', () => {
  it('connects when both sides use the same version', async () => {
    const [a, b] = createChannelPair();
    await expect(Promise.all([handshakeResult(a), handshakeResult(b)])).resolves.toEqual([
      'connected',
      'connected',
    ]);
  });

  it('reports a version mismatch on both sides', async () => {
    const [a, b] = createChannelPair();
    await expect(
      Promise.all([handshakeResult(a), handshakeResult(b, PROTOCOL_VERSION + 1)]),
    ).resolves.toEqual(['version-mismatch', 'version-mismatch']);
  });

  it('sends its hello first and ignores other messages until the hello', async () => {
    const [a, b] = createChannelPair();
    const received: JsonValue[] = [];
    b.onMessage((message) => received.push(message));
    const result = vi.fn();
    handshake(a, result);
    b.send({ type: 'ping' });
    b.send('garbage');
    await settle();
    expect(received).toEqual([{ type: 'hello', version: PROTOCOL_VERSION }]);
    expect(result).not.toHaveBeenCalled();
    b.send({ type: 'hello', version: PROTOCOL_VERSION });
    await settle();
    expect(result).toHaveBeenCalledWith('connected');
  });

  it('reports once and lets the caller take over the very next message', async () => {
    const [a, b] = createChannelPair();
    const received: JsonValue[] = [];
    const result = vi.fn(() => a.onMessage((message) => received.push(message)));
    handshake(a, result);
    b.send({ type: 'hello', version: PROTOCOL_VERSION });
    b.send({ type: 'move', index: 0, column: 3 });
    b.send({ type: 'hello', version: PROTOCOL_VERSION });
    await settle();
    expect(result).toHaveBeenCalledOnce();
    expect(received).toEqual([
      { type: 'move', index: 0, column: 3 },
      { type: 'hello', version: PROTOCOL_VERSION },
    ]);
  });
});

function play(moves: string): GameState {
  return [...moves].reduce((s, c) => playMove(s, Number(c)), newGame());
}

type MoveCase = [label: string, moves: string, remotePlayer: 1 | 2, index: number, column: number];

describe('judgeRemoteMove', () => {
  it.each<MoveCase>([
    ['the first move of a red opponent', '', 1, 0, 3],
    ['the next move of a yellow opponent', '3', 2, 1, 3],
    ['a move after several others', '33', 1, 2, 6],
  ])('applies %s', (_, moves, remotePlayer, index, column) => {
    expect(judgeRemoteMove(play(moves), remotePlayer, { index, column })).toBe('apply');
  });

  it.each<MoveCase>([
    ["the opponent's last move", '3', 1, 0, 3],
    ["the opponent's winning move after the game ended", '0101010', 1, 6, 0],
  ])('ignores a repeat of %s', (_, moves, remotePlayer, index, column) => {
    expect(judgeRemoteMove(play(moves), remotePlayer, { index, column })).toBe('ignore');
  });

  it.each<MoveCase>([
    ["a move on the other player's turn", '', 2, 0, 3],
    ['a move that skips an index', '3', 2, 2, 3],
    ['a move with an index already played', '34', 1, 0, 3],
    ['a move in a full column', '000000', 1, 6, 0],
    ['a move after the game ended', '0101010', 2, 7, 3],
    ["a repeat of the other player's move", '3', 2, 0, 3],
    ['a repeat with a different column', '3', 1, 0, 4],
  ])('reports %s as out of sync', (_, moves, remotePlayer, index, column) => {
    expect(judgeRemoteMove(play(moves), remotePlayer, { index, column })).toBe('out-of-sync');
  });
});

/** A connector over in-memory channels, where the test decides when things happen. */
function fakeConnector() {
  let onGuest: ((channel: Channel) => void) | undefined;
  let onLost: ((error: Error) => void) | undefined;
  let hostSignal: AbortSignal | undefined;
  let register: ((id: string) => void) | undefined;
  let failHost: ((error: Error) => void) | undefined;
  const joined: string[] = [];
  let joinSignal: AbortSignal | undefined;
  let finishJoin: ((channel: Channel) => void) | undefined;
  let failJoin: ((error: Error) => void) | undefined;

  const connector: Connector = {
    host(guestHandler, lostHandler, signal) {
      onGuest = guestHandler;
      onLost = lostHandler;
      hostSignal = signal;
      return new Promise((resolve, reject) => {
        register = resolve;
        failHost = reject;
      });
    },
    join(id, signal) {
      joined.push(id);
      joinSignal = signal;
      return new Promise((resolve, reject) => {
        finishJoin = resolve;
        failJoin = reject;
      });
    },
  };

  return {
    connector,
    joined,
    /** Whether the session has told hosting or joining to stop. */
    hostAborted: () => hostSignal?.aborted,
    joinAborted: () => joinSignal?.aborted,
    register: (id: string) => register?.(id),
    failHost: (error: Error) => failHost?.(error),
    /** The host lost the broker after registering and could not get it back. */
    loseHost: (error: Error) => onLost?.(error),
    /** Hands `channel` to the guest as if joining had succeeded. */
    finishJoin: (channel: Channel) => finishJoin?.(channel),
    /** Opens a channel pair and hands one end to the host and the other to the guest. */
    connect(): [Channel, Channel] {
      const [hostEnd, guestEnd] = createChannelPair();
      onGuest?.(hostEnd);
      finishJoin?.(guestEnd);
      return [hostEnd, guestEnd];
    },
    failJoin: (error: Error) => failJoin?.(error),
  };
}

/**
 * One player's page, wired like `main.ts`: a game controller whose clicked
 * moves go to the online session, a status line that shows the session's
 * status as a notice, and the online view with its rematch button.
 */
function page() {
  const online = document.createElement('div');
  const status = document.createElement('div');
  const board = document.createElement('div');
  let session: OnlineSession | undefined;
  const statuses: OnlineStatus[] = [];
  const controller = createGameController(
    { status, board },
    {
      seats: { 1: 'human', 2: 'human' },
      engine: createInProcessEngine(),
      onHumanMove: (i, c) => session?.sendMove(i, c),
    },
  );
  const onlineView = createOnlineView(online, () => session?.rematch());
  const rematchButton = () => online.querySelector<HTMLButtonElement>('button.rematch');
  return {
    controller,
    statuses,
    onStatus(next: OnlineStatus) {
      statuses.push(next);
      onlineView.render(next);
      controller.setNotice(onlineStatusText(next));
    },
    attach(next: OnlineSession) {
      session = next;
    },
    click(column: number) {
      board.querySelectorAll<HTMLButtonElement>('.column')[column]?.click();
    },
    clickRematch() {
      rematchButton()?.click();
    },
    /** The rematch box's text and button, or `undefined` while it is hidden. */
    rematch() {
      const box = online.querySelector<HTMLElement>('.online-rematch');
      if (!box || box.hidden) return undefined;
      const button = rematchButton();
      return {
        text: box.querySelector('span')?.textContent,
        button: button?.textContent,
        enabled: !button?.disabled,
      };
    },
    statusText: () => status.querySelector('.status')?.textContent,
    newGameEnabled: () => !status.querySelector<HTMLButtonElement>('.new-game')?.disabled,
  };
}

describe('hostOnlineGame and joinOnlineGame', () => {
  it('shows the link, then connects both sides', async () => {
    const fake = fakeConnector();
    const host = page();
    const guest = page();

    hostOnlineGame(PAGES_URL, host.controller, host.onStatus, { connector: fake.connector });
    expect(host.statuses).toEqual([{ kind: 'creating' }]);
    fake.register('abc');
    await settle();
    expect(host.statuses.at(-1)).toEqual({ kind: 'waiting', link: `${PAGES_URL}#join=abc` });

    joinOnlineGame('abc', guest.controller, guest.onStatus, { connector: fake.connector });
    expect(fake.joined).toEqual(['abc']);
    expect(guest.statuses).toEqual([{ kind: 'connecting' }]);

    fake.connect();
    await settle();
    expect(host.statuses.at(-1)).toEqual({ kind: 'connected' });
    expect(guest.statuses).toEqual([{ kind: 'connecting' }, { kind: 'connected' }]);
  });

  it('reports a version mismatch on both sides', async () => {
    const fake = fakeConnector();
    const host = page();
    hostOnlineGame(PAGES_URL, host.controller, host.onStatus, { connector: fake.connector });
    fake.register('abc');
    await settle();

    // The guest runs a newer deployment.
    const [, guestEnd] = fake.connect();
    const guestResult = handshakeResult(guestEnd, PROTOCOL_VERSION + 1);
    await settle();
    expect(host.statuses.at(-1)).toEqual({ kind: 'version-mismatch' });
    await expect(guestResult).resolves.toBe('version-mismatch');
  });

  it('reports when hosting or joining fails', async () => {
    const fake = fakeConnector();
    const host = page();
    const guest = page();
    hostOnlineGame(PAGES_URL, host.controller, host.onStatus, { connector: fake.connector });
    joinOnlineGame('abc', guest.controller, guest.onStatus, { connector: fake.connector });
    fake.failHost(new Error('No broker'));
    fake.failJoin(new Error('No game found'));
    await settle();
    expect(host.statuses.at(-1)).toEqual({ kind: 'failed', message: 'No broker' });
    expect(guest.statuses.at(-1)).toEqual({ kind: 'join-failed' });
    expect(guest.statusText()).toBe('Could not join this game. Ask for a new link.');
  });

  it('stops waiting for a guest when closed', async () => {
    const fake = fakeConnector();
    const host = page();
    const session = hostOnlineGame(PAGES_URL, host.controller, host.onStatus, {
      connector: fake.connector,
    });
    fake.register('abc');
    await settle();
    expect(fake.hostAborted()).toBe(false);
    session.close();
    expect(fake.hostAborted()).toBe(true);

    const [hostEnd] = fake.connect();
    await settle();
    expect(hostEnd.isOpen).toBe(false);
    expect(host.statuses.map((s) => s.kind)).toEqual(['creating', 'waiting']);
  });

  it('ignores hosting that finishes after closing', async () => {
    const fake = fakeConnector();
    const host = page();
    hostOnlineGame(PAGES_URL, host.controller, host.onStatus, {
      connector: fake.connector,
    }).close();
    expect(fake.hostAborted()).toBe(true);
    fake.register('abc');
    await settle();
    expect(host.statuses).toEqual([{ kind: 'creating' }]);
  });

  it('reports when the host loses the server while waiting for a guest', async () => {
    const fake = fakeConnector();
    const host = page();
    hostOnlineGame(PAGES_URL, host.controller, host.onStatus, { connector: fake.connector });
    fake.register('abc');
    await settle();
    fake.loseHost(new Error('Lost the server'));
    expect(host.statuses.at(-1)).toEqual({ kind: 'failed', message: 'Lost the server' });
    expect(host.statusText()).toBe('Lost the server');
    expect(fake.hostAborted()).toBe(true);
  });

  it('stops joining when closed', () => {
    const fake = fakeConnector();
    const guest = page();
    const session = joinOnlineGame('abc', guest.controller, guest.onStatus, {
      connector: fake.connector,
    });
    expect(fake.joinAborted()).toBe(false);
    session.close();
    expect(fake.joinAborted()).toBe(true);
  });

  it('stops joining at the join timeout', () => {
    const fake = fakeConnector();
    const guest = page();
    joinOnlineGame('abc', guest.controller, guest.onStatus, {
      connector: fake.connector,
      joinTimeoutMs: 1_000,
    });
    vi.advanceTimersByTime(999);
    expect(fake.joinAborted()).toBe(false);
    vi.advanceTimersByTime(1);
    expect(fake.joinAborted()).toBe(true);
    expect(guest.statuses.at(-1)).toEqual({ kind: 'join-failed' });
  });

  it('reports a channel that closed before the guest took it over as a failed join', async () => {
    const fake = fakeConnector();
    const guest = page();
    joinOnlineGame('abc', guest.controller, guest.onStatus, { connector: fake.connector });
    const [hostEnd, guestEnd] = createChannelPair();
    hostEnd.close();
    await settle();
    expect(guestEnd.isOpen).toBe(false);

    fake.finishJoin(guestEnd);
    await settle();
    expect(guest.statuses).toEqual([{ kind: 'connecting' }, { kind: 'join-failed' }]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('closes the connection on both sides when either closes', async () => {
    const fake = fakeConnector();
    const host = page();
    const guest = page();
    const hostSession = hostOnlineGame(PAGES_URL, host.controller, host.onStatus, {
      connector: fake.connector,
    });
    fake.register('abc');
    await settle();
    joinOnlineGame('abc', guest.controller, guest.onStatus, { connector: fake.connector });
    const [hostEnd, guestEnd] = fake.connect();
    await settle();

    hostSession.close();
    await settle();
    expect(hostEnd.isOpen).toBe(false);
    expect(guestEnd.isOpen).toBe(false);
    expect(host.statuses.at(-1)).toEqual({ kind: 'connected' });
    expect(guest.statuses.at(-1)).toEqual({ kind: 'connection-lost' });
    // No ping or timeout is left running on either side.
    expect(vi.getTimerCount()).toBe(0);
  });

  it('closes a channel that opens after the guest closed', async () => {
    const fake = fakeConnector();
    const guest = page();
    joinOnlineGame('abc', guest.controller, guest.onStatus, { connector: fake.connector }).close();
    const [, guestEnd] = fake.connect();
    await settle();
    expect(guestEnd.isOpen).toBe(false);
    expect(guest.statuses).toEqual([{ kind: 'connecting' }]);
  });
});

/** Connects a host page and a guest page and waits until both games have started. */
async function connectPages() {
  const fake = fakeConnector();
  const host = page();
  const guest = page();
  const options = { connector: fake.connector };
  const hostSession = hostOnlineGame(PAGES_URL, host.controller, host.onStatus, options);
  host.attach(hostSession);
  fake.register('abc');
  await settle();
  const guestSession = joinOnlineGame('abc', guest.controller, guest.onStatus, options);
  guest.attach(guestSession);
  const [hostEnd, guestEnd] = fake.connect();
  await settle();
  return { host, guest, hostSession, guestSession, hostEnd, guestEnd };
}

type Page = ReturnType<typeof page>;

/** Clicks `moves` in turn, red on the first page's board and yellow on the second's. */
async function clickMoves(red: Page, yellow: Page, moves: string): Promise<void> {
  for (const [index, column] of [...moves].entries()) {
    (index % 2 === 0 ? red : yellow).click(Number(column));
    await settle();
  }
}

const DRAW_GAME = '231220400060316366502612332554644541451513';

describe('an online game', () => {
  it('lets the host start as red, with the guest as yellow', async () => {
    const { host, guest } = await connectPages();
    expect(host.statusText()).toBe('Your turn');
    expect(guest.statusText()).toBe("Opponent's turn");
    expect(host.newGameEnabled()).toBe(false);
    expect(guest.newGameEnabled()).toBe(false);

    await clickMoves(host, guest, '3');
    expect(host.statusText()).toBe("Opponent's turn");
    expect(guest.statusText()).toBe('Your turn');
    expect(guest.controller.state.history).toEqual([3]);
  });

  it.each([
    ['a win', '0011223', 'You win!', 'Opponent wins!'],
    ['a draw', DRAW_GAME, 'Draw!', 'Draw!'],
  ])('ends %s with the same position on both boards', async (_, moves, hostText, guestText) => {
    const { host, guest } = await connectPages();
    await clickMoves(host, guest, moves);
    expect(host.controller.state.history).toEqual([...moves].map(Number));
    expect(guest.controller.state).toEqual(host.controller.state);
    expect(host.statusText()).toBe(hostText);
    expect(guest.statusText()).toBe(guestText);
  });

  it("sends nothing for clicks during the opponent's turn", async () => {
    const { host, guest, guestEnd } = await connectPages();
    const send = vi.spyOn(guestEnd, 'send');
    guest.click(3);
    await settle();
    expect(send).not.toHaveBeenCalled();
    expect(guest.controller.state.history).toEqual([]);
    expect(host.controller.state.history).toEqual([]);
  });

  it('ignores an exact repeat of the last move', async () => {
    const { host, guest, hostEnd } = await connectPages();
    await clickMoves(host, guest, '3');
    hostEnd.send({ type: 'move', index: 0, column: 3 });
    await settle();
    expect(guest.controller.state.history).toEqual([3]);
    expect(guest.statusText()).toBe('Your turn');
    expect(hostEnd.isOpen).toBe(true);
  });

  it.each<[string, string, JsonValue]>([
    ['a move with a wrong index', '3', { type: 'move', index: 2, column: 4 }],
    ["a move on the host's turn", '', { type: 'move', index: 0, column: 3 }],
    ['a move in a full column', '0000001', { type: 'move', index: 7, column: 0 }],
    ["a repeat of the host's move", '3', { type: 'move', index: 0, column: 3 }],
    ['an unparseable message', '3', 'garbage'],
    ['an unknown message type', '3', { type: 'resign' }],
    ['a rematch request during the game', '3', { type: 'rematch-request' }],
    ['a rematch accept nobody asked for', '0011223', { type: 'rematch-accept' }],
  ])('marks the game out of sync on both sides after %s', async (_, moves, message) => {
    const { host, guest, hostEnd, guestEnd } = await connectPages();
    await clickMoves(host, guest, moves);
    // Sent past the guest's session, as a buggy or tampered page would.
    guestEnd.send(message);
    await settle();
    expect(host.controller.state.history).toEqual([...moves].map(Number));
    for (const side of [host, guest]) {
      expect(side.statuses.at(-1)).toEqual({ kind: 'out-of-sync' });
      expect(side.statusText()).toBe('Game out of sync');
      expect(side.rematch()).toBeUndefined();
    }
    expect(hostEnd.isOpen).toBe(false);
    expect(guestEnd.isOpen).toBe(false);

    guest.click(5);
    host.click(5);
    await wait(30_000);
    expect(host.controller.state.history).toEqual([...moves].map(Number));
    // The closed channel and the silence do not turn it into a lost connection.
    expect(host.statusText()).toBe('Game out of sync');
    expect(guest.statusText()).toBe('Game out of sync');
  });
});

describe('a lost connection', () => {
  it('is not reported while both pages are open, however long a turn takes', async () => {
    const { host, guest } = await connectPages();
    await wait(60_000);
    expect(host.statusText()).toBe('Your turn');
    expect(guest.statusText()).toBe("Opponent's turn");
  });

  it('is reported after about 10 s without any message, and locks the board', async () => {
    const { host, guest, guestEnd } = await connectPages();
    await clickMoves(host, guest, '3');
    // The guest's tab went away without closing the connection.
    vi.spyOn(guestEnd, 'send').mockImplementation(() => {});
    await wait(9_000);
    expect(host.statusText()).toBe("Opponent's turn");
    await wait(1_000);
    expect(host.statuses.at(-1)).toEqual({ kind: 'connection-lost' });
    expect(host.statusText()).toBe('Connection lost');

    // The host's page closed the connection, so the guest learns it too.
    await settle();
    expect(guest.statusText()).toBe('Connection lost');
    guest.click(4);
    await settle();
    expect(guest.controller.state.history).toEqual([3]);
  });

  it('is reported on both sides as soon as the channel closes', async () => {
    const { host, guest, hostEnd } = await connectPages();
    await clickMoves(host, guest, '0011223');
    hostEnd.close();
    await settle();
    for (const side of [host, guest]) {
      expect(side.statusText()).toBe('Connection lost');
      expect(side.rematch()).toBeUndefined();
    }
    host.click(4);
    guest.click(4);
    expect(host.controller.state.history).toHaveLength(7);
    expect(guest.controller.state.history).toHaveLength(7);
  });
});

describe('joining a link', () => {
  it('gives up after about 15 s if the game cannot be reached', async () => {
    const fake = fakeConnector();
    const guest = page();
    joinOnlineGame('made-up', guest.controller, guest.onStatus, { connector: fake.connector });
    await wait(14_000);
    expect(guest.statusText()).toBe('Connecting…');
    await wait(1_000);
    expect(guest.statuses.at(-1)).toEqual({ kind: 'join-failed' });
    expect(guest.statusText()).toBe('Could not join this game. Ask for a new link.');

    // A connection that opens after all is closed right away.
    const [, guestEnd] = fake.connect();
    await settle();
    expect(guestEnd.isOpen).toBe(false);
    expect(guest.statuses.at(-1)).toEqual({ kind: 'join-failed' });
  });

  it('gives up if the connection opens but the game never starts', async () => {
    const fake = fakeConnector();
    const guest = page();
    joinOnlineGame('abc', guest.controller, guest.onStatus, { connector: fake.connector });
    // Nobody answers on the host's end of the channel.
    const [, guestEnd] = fake.connect();
    await wait(15_000);
    expect(guest.statusText()).toBe('Could not join this game. Ask for a new link.');
    expect(guestEnd.isOpen).toBe(false);
  });

  it('reports a link whose game is already full as not joinable', async () => {
    const fake = fakeConnector();
    const guest = page();
    joinOnlineGame('abc', guest.controller, guest.onStatus, { connector: fake.connector });
    // The host turns a second guest away by closing the new connection.
    const [hostEnd] = fake.connect();
    hostEnd.close();
    await settle();
    expect(guest.statusText()).toBe('Could not join this game. Ask for a new link.');
  });
});

describe('a rematch', () => {
  /** Plays a game the host wins, so both pages show the rematch button. */
  async function finishedGame() {
    const pages = await connectPages();
    await clickMoves(pages.host, pages.guest, '0011223');
    return pages;
  }

  it('is offered to both players once the game has ended', async () => {
    const { host, guest } = await connectPages();
    expect(host.rematch()).toBeUndefined();
    await clickMoves(host, guest, '001122');
    expect(guest.rematch()).toBeUndefined();
    await clickMoves(host, guest, '3');
    for (const side of [host, guest]) {
      expect(side.rematch()).toEqual({ text: '', button: 'Rematch', enabled: true });
    }
    expect(host.statusText()).toBe('You win!');
  });

  it('starts once the opponent accepts, with the other player starting as red', async () => {
    const { host, guest } = await finishedGame();
    host.clickRematch();
    await settle();
    expect(host.rematch()).toEqual({
      text: 'Waiting for your opponent to accept…',
      button: 'Rematch',
      enabled: false,
    });
    expect(guest.rematch()).toEqual({
      text: 'Opponent wants a rematch',
      button: 'Accept',
      enabled: true,
    });
    expect(host.statusText()).toBe('You win!');

    guest.clickRematch();
    await settle();
    for (const side of [host, guest]) {
      expect(side.controller.state.history).toEqual([]);
      expect(side.rematch()).toBeUndefined();
    }
    expect(guest.statusText()).toBe('Your turn');
    expect(host.statusText()).toBe("Opponent's turn");

    // The guest now plays red; this time the guest wins.
    await clickMoves(guest, host, '0011223');
    expect(host.controller.state).toEqual(guest.controller.state);
    expect(guest.statusText()).toBe('You win!');
    expect(host.statusText()).toBe('Opponent wins!');

    // The next rematch lets the host start again.
    guest.clickRematch();
    await settle();
    host.clickRematch();
    await settle();
    expect(host.statusText()).toBe('Your turn');
    expect(guest.statusText()).toBe("Opponent's turn");
    await clickMoves(host, guest, '3');
    expect(guest.controller.state.history).toEqual([3]);
  });

  it('does not start from a request alone', async () => {
    const { host, guest } = await finishedGame();
    host.clickRematch();
    await wait(60_000);
    for (const side of [host, guest]) {
      expect(side.controller.state.history).toHaveLength(7);
    }
    expect(host.statusText()).toBe('You win!');
    expect(guest.rematch()?.button).toBe('Accept');
  });

  it('starts once on both sides when both ask at the same time', async () => {
    const { host, guest } = await finishedGame();
    host.clickRematch();
    guest.clickRematch();
    await settle();
    expect(guest.statusText()).toBe('Your turn');
    expect(host.statusText()).toBe("Opponent's turn");
    await clickMoves(guest, host, '34');
    expect(host.controller.state.history).toEqual([3, 4]);
    expect(guest.controller.state.history).toEqual([3, 4]);
    expect(host.statuses.filter((s) => s.kind === 'connected')).toHaveLength(2);
  });

  it('cannot be asked for during a game', async () => {
    const { host, guest, guestSession, guestEnd } = await connectPages();
    await clickMoves(host, guest, '3');
    const send = vi.spyOn(guestEnd, 'send');
    guestSession.rematch();
    expect(send).not.toHaveBeenCalled();
  });
});
