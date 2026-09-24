// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Engine, EngineSearchOptions } from '../bot/engine';
import type { SearchResult } from '../bot/search';
import { legalColumns } from '../game/board';
import { canPlay, newGame, playMove, type GameState } from '../game/game';
import {
  BOT_TIME_LIMIT_MS,
  createGameController,
  DEFAULT_BOT_DELAY_MS,
  type Seats,
} from './controller';

const HUMAN_VS_HUMAN: Seats = { 1: 'human', 2: 'human' };
const HUMAN_VS_BOT: Seats = { 1: 'human', 2: 'bot' };
const BOT_VS_HUMAN: Seats = { 1: 'bot', 2: 'human' };
const HUMAN_VS_REMOTE: Seats = { 1: 'human', 2: 'remote' };
const REMOTE_VS_HUMAN: Seats = { 1: 'remote', 2: 'human' };

let status: HTMLElement;
let board: HTMLElement;

beforeEach(() => {
  vi.useFakeTimers();
  status = document.createElement('div');
  board = document.createElement('div');
});

afterEach(() => {
  vi.useRealTimers();
});

/** An engine that answers every search at once with the first legal column. */
function firstLegalEngine(): Engine {
  return {
    search: (state) => Promise.resolve({ column: firstLegal(state), result: UNKNOWN }),
    cancel: () => {},
  };
}

function firstLegal(state: GameState): number {
  const column = legalColumns(state.board)[0];
  if (column === undefined) throw new Error('No legal column');
  return column;
}

const UNKNOWN: SearchResult = { kind: 'unknown', depth: 1 };

interface PendingSearch {
  readonly state: GameState;
  readonly options: EngineSearchOptions | undefined;
  answer(column: number): Promise<void>;
  fail(error: Error): Promise<void>;
}

/**
 * An engine that answers only when a test tells it to, through the searches
 * it records. Cancelled searches can still be answered, to check that the
 * controller itself ignores stale answers.
 */
function manualEngine() {
  const searches: PendingSearch[] = [];
  let cancels = 0;
  const engine: Engine = {
    search(state, options) {
      return new Promise((resolve, reject) => {
        searches.push({
          state,
          options,
          answer: (column) => {
            resolve({ column, result: UNKNOWN });
            return settle();
          },
          fail: (error) => {
            reject(error);
            return settle();
          },
        });
      });
    },
    cancel: () => {
      cancels++;
    },
  };
  return {
    engine,
    searches,
    get cancels() {
      return cancels;
    },
  };
}

/** Lets pending promise callbacks run without moving the fake clock. */
const settle = async (): Promise<void> => {
  await vi.advanceTimersByTimeAsync(0);
};

/** A controller whose bot always picks the first legal column. */
function start(seats: Seats) {
  return createGameController({ status, board }, { seats, engine: firstLegalEngine() });
}

function startManual(seats: Seats) {
  const manual = manualEngine();
  const controller = createGameController(
    { status, board },
    { seats, engine: manual.engine, random: () => 0 },
  );
  // Keeps the `cancels` getter live.
  return Object.assign(manual, { controller });
}

function clickColumn(column: number): void {
  board.querySelectorAll<HTMLButtonElement>('.column')[column]?.click();
}

function clickNewGame(): void {
  status.querySelector<HTMLButtonElement>('.new-game')?.click();
}

function statusText(): string | null | undefined {
  return status.querySelector('.status')?.textContent;
}

function discCount(): number {
  return board.querySelectorAll('.player-1, .player-2').length;
}

describe('createGameController', () => {
  it('renders the initial state', () => {
    start(HUMAN_VS_HUMAN);
    expect(board.querySelectorAll('.column')).toHaveLength(7);
    expect(discCount()).toBe(0);
    expect(statusText()).toBe("Red's turn");
  });

  it('lets two humans alternate as before', async () => {
    const controller = start(HUMAN_VS_HUMAN);
    clickColumn(3);
    clickColumn(4);
    clickColumn(3);
    expect(controller.state.history).toEqual([3, 4, 3]);
    expect(discCount()).toBe(3);
    expect(statusText()).toBe("Yellow's turn");
    await vi.runAllTimersAsync();
    expect(controller.state.history).toEqual([3, 4, 3]);
  });

  it('answers each human move with a bot move after the delay', async () => {
    const controller = start(HUMAN_VS_BOT);
    clickColumn(3);
    expect(controller.state.history).toEqual([3]);
    expect(statusText()).toBe('Computer is thinking…');

    await vi.advanceTimersByTimeAsync(DEFAULT_BOT_DELAY_MS - 1);
    expect(controller.state.history).toEqual([3]);
    await vi.advanceTimersByTimeAsync(1);
    expect(controller.state.history).toEqual([3, 0]);
    expect(discCount()).toBe(2);
    expect(statusText()).toBe('Your turn');

    clickColumn(5);
    await vi.advanceTimersByTimeAsync(DEFAULT_BOT_DELAY_MS);
    expect(controller.state.history).toEqual([3, 0, 5, 0]);
  });

  it("ignores clicks during the bot's turn", async () => {
    const controller = start(HUMAN_VS_BOT);
    clickColumn(3);
    clickColumn(5);
    clickColumn(6);
    expect(controller.state.history).toEqual([3]);
    await vi.advanceTimersByTimeAsync(DEFAULT_BOT_DELAY_MS);
    expect(controller.state.history).toEqual([3, 0]);
  });

  it('plays the first move without a click when the bot starts', async () => {
    const controller = start(BOT_VS_HUMAN);
    expect(controller.state.history).toEqual([]);
    clickColumn(3);
    expect(controller.state.history).toEqual([]);
    await vi.advanceTimersByTimeAsync(DEFAULT_BOT_DELAY_MS);
    expect(controller.state.history).toEqual([0]);
    expect(statusText()).toBe('Your turn');
  });

  it('cancels a pending bot move on new game', async () => {
    const controller = start(HUMAN_VS_BOT);
    clickColumn(3);
    clickNewGame();
    await vi.runAllTimersAsync();
    expect(controller.state.history).toEqual([]);
    expect(discCount()).toBe(0);
    expect(statusText()).toBe('Your turn');
  });

  it('replaces a pending first bot move on new game instead of doubling it', async () => {
    const controller = start(BOT_VS_HUMAN);
    await vi.advanceTimersByTimeAsync(DEFAULT_BOT_DELAY_MS - 1);
    controller.newGame();
    await vi.advanceTimersByTimeAsync(DEFAULT_BOT_DELAY_MS - 1);
    expect(controller.state.history).toEqual([]);
    await vi.runAllTimersAsync();
    expect(controller.state.history).toEqual([0]);
  });

  it('stops the bot once the game is over', async () => {
    const controller = start(HUMAN_VS_BOT);
    // The bot always answers in column 0, so red wins in column 3.
    for (let move = 0; move < 4; move++) {
      clickColumn(3);
      await vi.runAllTimersAsync();
    }
    expect(controller.state.status).toMatchObject({ kind: 'won', winner: 1 });
    expect(controller.state.history).toEqual([3, 0, 3, 0, 3, 0, 3]);
    expect(statusText()).toBe('You win!');
  });

  it('uses the delay given in the options', async () => {
    const controller = createGameController(
      { status, board },
      { seats: BOT_VS_HUMAN, engine: firstLegalEngine(), botDelayMs: 50 },
    );
    await vi.advanceTimersByTimeAsync(49);
    expect(controller.state.history).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(controller.state.history).toEqual([0]);
  });
  it('speaks to the human in the status line against the computer', async () => {
    start(HUMAN_VS_BOT);
    expect(statusText()).toBe('Your turn');
    clickColumn(3);
    expect(statusText()).toBe('Computer is thinking…');
    await vi.advanceTimersByTimeAsync(DEFAULT_BOT_DELAY_MS);
    expect(statusText()).toBe('Your turn');
  });

  it('keeps the seats on New game', async () => {
    const controller = start(BOT_VS_HUMAN);
    await vi.runAllTimersAsync();
    clickColumn(3);
    await vi.runAllTimersAsync();
    clickNewGame();
    expect(controller.state.history).toEqual([]);
    expect(statusText()).toBe('Computer is thinking…');
    await vi.runAllTimersAsync();
    expect(controller.state.history).toEqual([0]);
  });

  it('starts a new game with the seats passed to newGame', async () => {
    const controller = start(HUMAN_VS_HUMAN);
    clickColumn(3);
    controller.newGame(BOT_VS_HUMAN);
    expect(controller.state.history).toEqual([]);
    await vi.runAllTimersAsync();
    expect(controller.state.history).toEqual([0]);
    expect(statusText()).toBe('Your turn');

    controller.newGame(HUMAN_VS_HUMAN);
    expect(statusText()).toBe("Red's turn");
    clickColumn(3);
    clickColumn(4);
    await vi.runAllTimersAsync();
    expect(controller.state.history).toEqual([3, 4]);
  });

  it('shows a notice and ignores clicks and New game until it is cleared', () => {
    const controller = start(HUMAN_VS_HUMAN);
    clickColumn(3);
    controller.setNotice('Connected');
    expect(statusText()).toBe('Connected');
    expect(board.querySelectorAll<HTMLButtonElement>('.column:enabled')).toHaveLength(0);
    clickColumn(4);
    clickNewGame();
    expect(controller.state.history).toEqual([3]);

    controller.newGame();
    expect(statusText()).toBe('Connected');

    controller.setNotice(undefined);
    expect(statusText()).toBe("Red's turn");
    clickColumn(4);
    expect(controller.state.history).toEqual([4]);
  });

  it('does not schedule another bot move when the notice changes', async () => {
    const controller = start(BOT_VS_HUMAN);
    controller.setNotice('Hello');
    controller.setNotice(undefined);
    await vi.runAllTimersAsync();
    expect(controller.state.history).toEqual([0]);
  });

  it('reports each clicked move with its index', () => {
    const onHumanMove = vi.fn();
    createGameController(
      { status, board },
      { seats: HUMAN_VS_HUMAN, engine: firstLegalEngine(), onHumanMove },
    );
    clickColumn(3);
    clickColumn(3);
    expect(onHumanMove.mock.calls).toEqual([
      [0, 3],
      [1, 3],
    ]);
  });

  it('does not report illegal clicks or bot moves', async () => {
    const onHumanMove = vi.fn();
    const controller = createGameController(
      { status, board },
      { seats: BOT_VS_HUMAN, engine: firstLegalEngine(), onHumanMove },
    );
    await vi.runAllTimersAsync();
    expect(controller.state.history).toEqual([0]);
    expect(onHumanMove).not.toHaveBeenCalled();

    controller.newGame(HUMAN_VS_HUMAN);
    for (let move = 0; move < 6; move++) clickColumn(0);
    expect(onHumanMove).toHaveBeenCalledTimes(6);
    clickColumn(0);
    expect(onHumanMove).toHaveBeenCalledTimes(6);
  });

  it('waits for the remote player instead of taking clicks on their turn', async () => {
    const onHumanMove = vi.fn();
    const controller = createGameController(
      { status, board },
      { seats: REMOTE_VS_HUMAN, engine: firstLegalEngine(), onHumanMove },
    );
    expect(statusText()).toBe("Opponent's turn");
    clickColumn(3);
    await vi.runAllTimersAsync();
    expect(controller.state.history).toEqual([]);
    expect(onHumanMove).not.toHaveBeenCalled();

    expect(controller.playRemoteMove(3)).toBe(true);
    expect(statusText()).toBe('Your turn');
    clickColumn(4);
    expect(controller.state.history).toEqual([3, 4]);
    expect(onHumanMove).toHaveBeenCalledWith(1, 4);
  });

  it("plays remote moves only on the remote player's turn and only if legal", () => {
    const controller = start(HUMAN_VS_REMOTE);
    expect(controller.playRemoteMove(3)).toBe(false);
    clickColumn(0);
    expect(controller.playRemoteMove(7)).toBe(false);
    expect(controller.playRemoteMove(0)).toBe(true);
    expect(controller.state.history).toEqual([0, 0]);
    expect(discCount()).toBe(2);
  });

  it('disables New game in an online game', () => {
    const controller = start(HUMAN_VS_REMOTE);
    clickColumn(3);
    clickNewGame();
    expect(controller.state.history).toEqual([3]);
  });

  it('enables the columns only on the turn of a human on this page', async () => {
    const enabled = () =>
      [...board.querySelectorAll<HTMLButtonElement>('.column')].some((c) => !c.disabled);

    const controller = start(HUMAN_VS_REMOTE);
    expect(enabled()).toBe(true);
    clickColumn(3);
    expect(enabled()).toBe(false);
    controller.playRemoteMove(4);
    expect(enabled()).toBe(true);

    controller.newGame(BOT_VS_HUMAN);
    expect(enabled()).toBe(false);
    await vi.advanceTimersByTimeAsync(DEFAULT_BOT_DELAY_MS);
    expect(enabled()).toBe(true);
  });

  it('cancels a pending bot move when the seats change', async () => {
    const controller = start(HUMAN_VS_BOT);
    clickColumn(3);
    controller.newGame(HUMAN_VS_HUMAN);
    await vi.runAllTimersAsync();
    expect(controller.state.history).toEqual([]);
  });

  describe('with a search engine', () => {
    it('asks the engine about the position with the time limit', () => {
      const { searches } = startManual(HUMAN_VS_BOT);
      expect(searches).toHaveLength(0);
      clickColumn(3);
      expect(searches).toHaveLength(1);
      expect(searches[0]?.state.history).toEqual([3]);
      expect(searches[0]?.options).toEqual({ timeLimitMs: BOT_TIME_LIMIT_MS });
    });

    it('plays an early answer only once the pause is over', async () => {
      const { controller, searches } = startManual(HUMAN_VS_BOT);
      clickColumn(3);
      await searches[0]?.answer(2);
      expect(controller.state.history).toEqual([3]);
      await vi.advanceTimersByTimeAsync(DEFAULT_BOT_DELAY_MS - 1);
      expect(controller.state.history).toEqual([3]);
      await vi.advanceTimersByTimeAsync(1);
      expect(controller.state.history).toEqual([3, 2]);
      expect(statusText()).toBe('Your turn');
    });

    it('plays a late answer as soon as it arrives after the pause', async () => {
      const { controller, searches } = startManual(HUMAN_VS_BOT);
      clickColumn(3);
      await vi.advanceTimersByTimeAsync(5000);
      expect(controller.state.history).toEqual([3]);
      expect(statusText()).toBe('Computer is thinking…');
      await searches[0]?.answer(4);
      expect(controller.state.history).toEqual([3, 4]);
    });

    it('drops the answer for a game replaced by New game', async () => {
      const manual = startManual(HUMAN_VS_BOT);
      const { controller, searches } = manual;
      clickColumn(3);
      clickNewGame();
      expect(manual.cancels).toBe(1);
      await searches[0]?.answer(2);
      await vi.runAllTimersAsync();
      expect(controller.state.history).toEqual([]);
      expect(discCount()).toBe(0);
      expect(searches).toHaveLength(1);

      clickColumn(5);
      await searches[1]?.answer(1);
      await vi.runAllTimersAsync();
      expect(controller.state.history).toEqual([5, 1]);
    });

    it('lets the computer start the new game once when the starter changes', async () => {
      const manual = startManual(HUMAN_VS_BOT);
      const { controller, searches } = manual;
      clickColumn(3);
      controller.newGame(BOT_VS_HUMAN);
      expect(manual.cancels).toBe(1);
      expect(searches).toHaveLength(2);
      expect(searches[1]?.state.history).toEqual([]);

      await searches[0]?.answer(2);
      await searches[1]?.answer(3);
      await vi.runAllTimersAsync();
      expect(controller.state.history).toEqual([3]);
      expect(statusText()).toBe('Your turn');
      expect(searches).toHaveLength(2);
    });

    it('lets a bot that starts again play one first move after New game', async () => {
      const { controller, searches } = startManual(BOT_VS_HUMAN);
      await vi.advanceTimersByTimeAsync(DEFAULT_BOT_DELAY_MS);
      controller.newGame();
      await searches[0]?.answer(6);
      await searches[1]?.answer(3);
      await vi.runAllTimersAsync();
      expect(controller.state.history).toEqual([3]);
    });

    it('falls back to a legal move and logs the error when the engine fails', async () => {
      const error = vi.spyOn(console, 'error').mockImplementation(() => {});
      try {
        const { controller, searches } = startManual(HUMAN_VS_BOT);
        clickColumn(3);
        const failure = new Error('worker crashed');
        await searches[0]?.fail(failure);
        await vi.advanceTimersByTimeAsync(DEFAULT_BOT_DELAY_MS);
        expect(controller.state.history).toHaveLength(2);
        expect(error).toHaveBeenCalledWith(expect.any(String), failure);
        expect(statusText()).toBe('Your turn');
      } finally {
        error.mockRestore();
      }
    });

    it('falls back to a search that blocks a threat when the engine fails', async () => {
      const error = vi.spyOn(console, 'error').mockImplementation(() => {});
      try {
        const { controller, searches } = startManual(HUMAN_VS_BOT);
        // Red stacks three discs in column 3 while the engine answers in column 0.
        for (let move = 0; move < 2; move++) {
          clickColumn(3);
          await searches[move]?.answer(0);
          await vi.advanceTimersByTimeAsync(DEFAULT_BOT_DELAY_MS);
        }
        clickColumn(3);
        await searches[2]?.fail(new Error('no worker'));
        await vi.advanceTimersByTimeAsync(DEFAULT_BOT_DELAY_MS);
        expect(controller.state.history).toEqual([3, 0, 3, 0, 3, 3]);
      } finally {
        error.mockRestore();
      }
    });

    it('treats an illegal answer as a failure', async () => {
      const error = vi.spyOn(console, 'error').mockImplementation(() => {});
      try {
        const { controller, searches } = startManual(HUMAN_VS_BOT);
        clickColumn(3);
        await searches[0]?.answer(7);
        await vi.advanceTimersByTimeAsync(DEFAULT_BOT_DELAY_MS);
        const [human, bot] = controller.state.history;
        expect(human).toBe(3);
        expect(bot).toBeDefined();
        expect(canPlay(playMove(newGame(), 3), bot ?? -1)).toBe(true);
        expect(error).toHaveBeenCalledOnce();
      } finally {
        error.mockRestore();
      }
    });

    it('ignores a failure of a search for a replaced game', async () => {
      const error = vi.spyOn(console, 'error').mockImplementation(() => {});
      try {
        const { controller, searches } = startManual(HUMAN_VS_BOT);
        clickColumn(3);
        clickNewGame();
        await searches[0]?.fail(new Error('too late'));
        await vi.runAllTimersAsync();
        expect(controller.state.history).toEqual([]);
        expect(error).not.toHaveBeenCalled();
      } finally {
        error.mockRestore();
      }
    });

    it('never asks the engine in two-player or online games', async () => {
      const { controller, searches } = startManual(HUMAN_VS_HUMAN);
      clickColumn(3);
      clickColumn(4);
      controller.newGame(HUMAN_VS_REMOTE);
      clickColumn(3);
      controller.playRemoteMove(3);
      await vi.runAllTimersAsync();
      expect(searches).toHaveLength(0);
    });
  });
});
