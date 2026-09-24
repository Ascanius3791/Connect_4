// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createInProcessEngine, type Engine, type EngineSearchOptions } from '../bot/engine';
import { LEVEL_PLAY, type Level } from '../bot/levels';
import type { SearchResult } from '../bot/search';
import { legalColumns } from '../game/board';
import { canPlay, newGame, playMove, type GameState } from '../game/game';
import {
  ANALYSIS_OPTIONS,
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
let analysis: HTMLElement;

beforeEach(() => {
  vi.useFakeTimers();
  status = document.createElement('div');
  board = document.createElement('div');
  analysis = document.createElement('div');
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

const UNKNOWN: SearchResult = { kind: 'unknown', depth: 2 };

interface PendingSearch {
  readonly state: GameState;
  readonly options: EngineSearchOptions | undefined;
  answer(column: number, result?: SearchResult): Promise<void>;
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
          answer: (column, result = UNKNOWN) => {
            resolve({ column, result });
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

/** The search options of a level that searches. */
function searchOptions(level: Level): EngineSearchOptions {
  const play = LEVEL_PLAY[level];
  if (play.kind !== 'search') throw new Error(`${level} does not search`);
  return play.options;
}

/** Lets pending promise callbacks run without moving the fake clock. */
const settle = async (): Promise<void> => {
  await vi.advanceTimersByTimeAsync(0);
};

/** A controller whose bot always picks the first legal column. */
function start(seats: Seats) {
  return createGameController({ status, board }, { seats, engine: firstLegalEngine() });
}

function startManual(seats: Seats, level?: Level) {
  const manual = manualEngine();
  const controller = createGameController(
    { status, board },
    { seats, level, engine: manual.engine, random: () => 0 },
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
    controller.setNotice({ text: 'Connected', tone: 'progress' });
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
    controller.setNotice({ text: 'Hello', tone: 'progress' });
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
    it("asks the engine about the position with Medium's options by default", () => {
      const { searches } = startManual(HUMAN_VS_BOT);
      expect(searches).toHaveLength(0);
      clickColumn(3);
      expect(searches).toHaveLength(1);
      expect(searches[0]?.state.history).toEqual([3]);
      expect(searches[0]?.options).toEqual(searchOptions('medium'));
    });

    it.each(['medium', 'hard', 'expert'] as const)(
      "passes the %s level's search options to the engine",
      (level) => {
        const { searches } = startManual(BOT_VS_HUMAN, level);
        expect(searches).toHaveLength(1);
        expect(searches[0]?.options).toEqual(searchOptions(level));
      },
    );

    it('starts a new game with the level passed to newGame and keeps it on New game', async () => {
      const manual = startManual(HUMAN_VS_BOT, 'hard');
      const { controller, searches } = manual;
      clickColumn(3);
      controller.newGame(BOT_VS_HUMAN, 'expert');
      expect(manual.cancels).toBe(1);
      expect(controller.state.history).toEqual([]);
      expect(searches).toHaveLength(2);
      expect(searches[1]?.options).toEqual(searchOptions('expert'));

      // The old game's answer is dropped.
      await searches[0]?.answer(2);
      await vi.runAllTimersAsync();
      expect(controller.state.history).toEqual([]);

      clickNewGame();
      expect(searches[2]?.options).toEqual(searchOptions('expert'));
      controller.newGame(HUMAN_VS_BOT);
      clickColumn(3);
      expect(searches[3]?.options).toEqual(searchOptions('expert'));
    });

    it.each(['beginner', 'easy'] as const)(
      'plays %s moves on the page after the pause, without the engine',
      async (level) => {
        const { controller, searches } = startManual(HUMAN_VS_BOT, level);
        clickColumn(3);
        await vi.advanceTimersByTimeAsync(DEFAULT_BOT_DELAY_MS - 1);
        expect(controller.state.history).toEqual([3]);
        expect(statusText()).toBe('Computer is thinking…');
        await vi.advanceTimersByTimeAsync(1);
        // `random` is 0, so a random move is the leftmost legal column.
        expect(controller.state.history).toEqual([3, 0]);
        expect(statusText()).toBe('Your turn');
        expect(searches).toHaveLength(0);
      },
    );

    it('lets Easy block a threat', async () => {
      const { controller } = startManual(HUMAN_VS_BOT, 'easy');
      for (const column of [1, 2, 3]) {
        clickColumn(column);
        await vi.advanceTimersByTimeAsync(DEFAULT_BOT_DELAY_MS);
      }
      // With `random` at 0, Easy's random moves go to column 0, which also
      // closes the left end of Red's row; now it must block column 4.
      expect(controller.state.history).toEqual([1, 0, 2, 0, 3, 4]);
    });

    it('cancels a pending Beginner move when the level changes', async () => {
      const { controller } = startManual(HUMAN_VS_BOT, 'beginner');
      clickColumn(3);
      controller.newGame(HUMAN_VS_BOT, 'easy');
      await vi.runAllTimersAsync();
      expect(controller.state.history).toEqual([]);
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

  describe('with the analysis', () => {
    const WIN_IN_2: SearchResult = { kind: 'win', player: 1, moves: 2, exact: true };

    /** A controller with a manual engine for the bot and another for the analysis. */
    function startAnalysis(seats: Seats, level?: Level) {
      const bot = manualEngine();
      const analyser = manualEngine();
      const controller = createGameController(
        { status, board },
        {
          seats,
          level,
          engine: bot.engine,
          random: () => 0,
          analysis: { container: analysis, engine: analyser.engine },
        },
      );
      return { controller, bot, analyser };
    }

    function analysisButton(): HTMLButtonElement | null {
      return analysis.querySelector<HTMLButtonElement>('.analysis-toggle');
    }

    function toggleAnalysis(): void {
      analysisButton()?.click();
    }

    function analysisText(): string | null | undefined {
      return analysis.querySelector('.analysis')?.textContent;
    }

    /** The column and row of every outlined cell. */
    function outlined(): [number, number][] {
      const result: [number, number][] = [];
      board.querySelectorAll('.column').forEach((column, c) => {
        column.querySelectorAll('.cell').forEach((cell, r) => {
          if (cell.classList.contains('best-move')) result.push([c, r]);
        });
      });
      return result;
    }

    it('is off by default and analyses nothing', async () => {
      const { analyser } = startAnalysis(HUMAN_VS_HUMAN);
      clickColumn(3);
      await vi.runAllTimersAsync();
      expect(analysisButton()?.getAttribute('aria-pressed')).toBe('false');
      expect(analyser.searches).toHaveLength(0);
      expect(analysisText()).toBe('');
      expect(outlined()).toEqual([]);
    });

    it('analyses the current position once switched on and then shows the answer', async () => {
      const { controller, analyser } = startAnalysis(HUMAN_VS_HUMAN);
      clickColumn(3);
      toggleAnalysis();
      expect(analysisButton()?.getAttribute('aria-pressed')).toBe('true');
      expect(analyser.searches).toHaveLength(1);
      expect(analyser.searches[0]?.state).toBe(controller.state);
      expect(analyser.searches[0]?.options).toEqual(ANALYSIS_OPTIONS);
      expect(analysisText()).toBe('Analysing…');
      expect(outlined()).toEqual([]);

      await analyser.searches[0]?.answer(3, WIN_IN_2);
      expect(analysisText()).toBe('Red wins in 2 moves');
      expect(outlined()).toEqual([[3, 1]]);
    });

    it('analyses again after every move and New game', async () => {
      const { controller, analyser } = startAnalysis(HUMAN_VS_HUMAN);
      toggleAnalysis();
      await analyser.searches[0]?.answer(3, UNKNOWN);
      clickColumn(3);
      expect(analyser.searches).toHaveLength(2);
      expect(analyser.searches[1]?.state).toBe(controller.state);
      expect(analysisText()).toBe('Analysing…');
      expect(outlined()).toEqual([]);

      clickNewGame();
      expect(analyser.searches).toHaveLength(3);
      expect(analyser.searches[2]?.state).toBe(controller.state);
      controller.newGame(HUMAN_VS_BOT);
      expect(analyser.searches).toHaveLength(4);
      expect(analyser.searches[3]?.state).toBe(controller.state);
    });

    it('never shows the answer for an older position', async () => {
      const { analyser } = startAnalysis(HUMAN_VS_HUMAN);
      toggleAnalysis();
      clickColumn(3);
      await analyser.searches[0]?.answer(3, WIN_IN_2);
      expect(analysisText()).toBe('Analysing…');
      expect(outlined()).toEqual([]);

      await analyser.searches[1]?.answer(4, UNKNOWN);
      expect(analysisText()).toBe('No forced win within the next 1 move');
      expect(outlined()).toEqual([[4, 0]]);
    });

    it('removes the outline and the line at once and stops the analysis when switched off', async () => {
      const { analyser } = startAnalysis(HUMAN_VS_HUMAN);
      toggleAnalysis();
      await analyser.searches[0]?.answer(3, WIN_IN_2);
      clickColumn(3);
      const cancels = analyser.cancels;

      toggleAnalysis();
      expect(analysisButton()?.getAttribute('aria-pressed')).toBe('false');
      expect(analyser.cancels).toBe(cancels + 1);
      expect(analysisText()).toBe('');
      expect(outlined()).toEqual([]);

      await analyser.searches[1]?.answer(3, WIN_IN_2);
      expect(analysisText()).toBe('');
      expect(outlined()).toEqual([]);
      clickColumn(3);
      expect(analyser.searches).toHaveLength(2);
    });

    it('hides the outline and the line once the game is over', async () => {
      const { analyser } = startAnalysis(HUMAN_VS_HUMAN);
      toggleAnalysis();
      for (const column of [0, 1, 0, 1, 0, 1]) clickColumn(column);
      await analyser.searches[6]?.answer(0, { kind: 'win', player: 1, moves: 1, exact: true });
      expect(outlined()).toEqual([[0, 3]]);

      clickColumn(0);
      expect(statusText()).toBe('Red wins!');
      expect(analyser.searches).toHaveLength(7);
      expect(analysisText()).toBe('');
      expect(outlined()).toEqual([]);
      expect(analysisButton()?.getAttribute('aria-pressed')).toBe('true');
    });

    it('hides the line if the analysis fails and logs the error', async () => {
      const error = vi.spyOn(console, 'error').mockImplementation(() => {});
      try {
        const { analyser } = startAnalysis(HUMAN_VS_HUMAN);
        toggleAnalysis();
        await analyser.searches[0]?.fail(new Error('worker crashed'));
        expect(analysisText()).toBe('');
        expect(outlined()).toEqual([]);
        expect(error).toHaveBeenCalledOnce();

        clickColumn(3);
        expect(analyser.searches).toHaveLength(2);
        expect(analysisText()).toBe('Analysing…');
      } finally {
        error.mockRestore();
      }
    });

    it('is not offered in online games or while a notice is shown', async () => {
      const { controller, analyser } = startAnalysis(HUMAN_VS_HUMAN);
      toggleAnalysis();
      await analyser.searches[0]?.answer(3, WIN_IN_2);

      controller.setNotice({ text: 'Waiting for your friend…', tone: 'progress' });
      expect(analysisButton()?.hidden).toBe(true);
      expect(analysisText()).toBe('');
      expect(outlined()).toEqual([]);
      controller.newGame(HUMAN_VS_REMOTE);
      controller.setNotice(undefined);
      controller.playRemoteMove(3);
      clickColumn(3);
      expect(analysisButton()?.hidden).toBe(true);
      expect(analyser.searches).toHaveLength(1);

      controller.newGame(HUMAN_VS_HUMAN);
      expect(analysisButton()?.hidden).toBe(false);
      expect(analyser.searches).toHaveLength(2);
      expect(analysisText()).toBe('Analysing…');
    });

    it("analyses on the computer's turn without changing the bot's move", async () => {
      const { controller, bot, analyser } = startAnalysis(HUMAN_VS_BOT, 'hard');
      toggleAnalysis();
      clickColumn(3);
      const position = controller.state;
      expect(analyser.searches[1]?.state).toBe(position);
      expect(bot.searches).toHaveLength(1);
      expect(bot.searches[0]?.state).toBe(position);
      expect(bot.searches[0]?.options).toEqual(searchOptions('hard'));

      await analyser.searches[1]?.answer(4, WIN_IN_2);
      expect(outlined()).toEqual([[4, 0]]);
      await bot.searches[0]?.answer(2);
      await vi.advanceTimersByTimeAsync(DEFAULT_BOT_DELAY_MS);
      expect(controller.state.history).toEqual([3, 2]);
      expect(analyser.searches).toHaveLength(3);
      expect(analyser.cancels).toBe(0);
      expect(bot.cancels).toBe(0);
    });

    describe('with the real search', () => {
      /** The in-process search, kept shallow so the tests stay fast. */
      function shallowEngine(): Engine {
        const inner = createInProcessEngine();
        return {
          search: (state, options) => inner.search(state, { ...options, maxDepth: 4 }),
          cancel: () => inner.cancel(),
        };
      }

      function analyse(moves: readonly number[]) {
        const controller = createGameController(
          { status, board },
          {
            seats: HUMAN_VS_HUMAN,
            engine: firstLegalEngine(),
            analysis: { container: analysis, engine: shallowEngine() },
          },
        );
        for (const column of moves) clickColumn(column);
        toggleAnalysis();
        return controller;
      }

      it('finds the win with an open three', async () => {
        // Red on the bottom of columns 1 to 3, Yellow on top; column 4 wins.
        analyse([0, 0, 1, 1, 2, 2]);
        await settle();
        expect(analysisText()).toBe('Red wins in 1 move');
        expect(outlined()).toEqual([[3, 0]]);
      });

      it("outlines Yellow's only block", async () => {
        analyse([0, 6, 1, 6, 2]);
        await settle();
        expect(outlined()).toEqual([[3, 0]]);
        expect(analysisText()).not.toBe('Analysing…');
      });
    });
  });
});
