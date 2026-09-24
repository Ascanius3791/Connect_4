// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createGameController, DEFAULT_BOT_DELAY_MS, type Seats } from './controller';

const HUMAN_VS_HUMAN: Seats = { 1: 'human', 2: 'human' };
const HUMAN_VS_BOT: Seats = { 1: 'human', 2: 'bot' };
const BOT_VS_HUMAN: Seats = { 1: 'bot', 2: 'human' };

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

/** A controller whose bot always picks the first legal column. */
function start(seats: Seats) {
  return createGameController({ status, board }, { seats, random: () => 0 });
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

  it('lets two humans alternate as before', () => {
    const controller = start(HUMAN_VS_HUMAN);
    clickColumn(3);
    clickColumn(4);
    clickColumn(3);
    expect(controller.state.history).toEqual([3, 4, 3]);
    expect(discCount()).toBe(3);
    expect(statusText()).toBe("Yellow's turn");
    vi.runAllTimers();
    expect(controller.state.history).toEqual([3, 4, 3]);
  });

  it('answers each human move with a bot move after the delay', () => {
    const controller = start(HUMAN_VS_BOT);
    clickColumn(3);
    expect(controller.state.history).toEqual([3]);
    expect(statusText()).toBe('Computer is thinking…');

    vi.advanceTimersByTime(DEFAULT_BOT_DELAY_MS - 1);
    expect(controller.state.history).toEqual([3]);
    vi.advanceTimersByTime(1);
    expect(controller.state.history).toEqual([3, 0]);
    expect(discCount()).toBe(2);
    expect(statusText()).toBe('Your turn');

    clickColumn(5);
    vi.advanceTimersByTime(DEFAULT_BOT_DELAY_MS);
    expect(controller.state.history).toEqual([3, 0, 5, 0]);
  });

  it("ignores clicks during the bot's turn", () => {
    const controller = start(HUMAN_VS_BOT);
    clickColumn(3);
    clickColumn(5);
    clickColumn(6);
    expect(controller.state.history).toEqual([3]);
    vi.advanceTimersByTime(DEFAULT_BOT_DELAY_MS);
    expect(controller.state.history).toEqual([3, 0]);
  });

  it('plays the first move without a click when the bot starts', () => {
    const controller = start(BOT_VS_HUMAN);
    expect(controller.state.history).toEqual([]);
    clickColumn(3);
    expect(controller.state.history).toEqual([]);
    vi.advanceTimersByTime(DEFAULT_BOT_DELAY_MS);
    expect(controller.state.history).toEqual([0]);
    expect(statusText()).toBe('Your turn');
  });

  it('cancels a pending bot move on new game', () => {
    const controller = start(HUMAN_VS_BOT);
    clickColumn(3);
    clickNewGame();
    vi.runAllTimers();
    expect(controller.state.history).toEqual([]);
    expect(discCount()).toBe(0);
    expect(statusText()).toBe('Your turn');
  });

  it('replaces a pending first bot move on new game instead of doubling it', () => {
    const controller = start(BOT_VS_HUMAN);
    vi.advanceTimersByTime(DEFAULT_BOT_DELAY_MS - 1);
    controller.newGame();
    vi.advanceTimersByTime(DEFAULT_BOT_DELAY_MS - 1);
    expect(controller.state.history).toEqual([]);
    vi.runAllTimers();
    expect(controller.state.history).toEqual([0]);
  });

  it('stops the bot once the game is over', () => {
    const controller = start(HUMAN_VS_BOT);
    // The bot always answers in column 0, so red wins in column 3.
    for (let move = 0; move < 4; move++) {
      clickColumn(3);
      vi.runAllTimers();
    }
    expect(controller.state.status).toMatchObject({ kind: 'won', winner: 1 });
    expect(controller.state.history).toEqual([3, 0, 3, 0, 3, 0, 3]);
    expect(statusText()).toBe('You win!');
  });

  it('uses the delay given in the options', () => {
    const controller = createGameController(
      { status, board },
      { seats: BOT_VS_HUMAN, botDelayMs: 50, random: () => 0 },
    );
    vi.advanceTimersByTime(49);
    expect(controller.state.history).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(controller.state.history).toEqual([0]);
  });
  it('speaks to the human in the status line against the computer', () => {
    start(HUMAN_VS_BOT);
    expect(statusText()).toBe('Your turn');
    clickColumn(3);
    expect(statusText()).toBe('Computer is thinking…');
    vi.advanceTimersByTime(DEFAULT_BOT_DELAY_MS);
    expect(statusText()).toBe('Your turn');
  });

  it('keeps the seats on New game', () => {
    const controller = start(BOT_VS_HUMAN);
    vi.runAllTimers();
    clickColumn(3);
    vi.runAllTimers();
    clickNewGame();
    expect(controller.state.history).toEqual([]);
    expect(statusText()).toBe('Computer is thinking…');
    vi.runAllTimers();
    expect(controller.state.history).toEqual([0]);
  });

  it('starts a new game with the seats passed to newGame', () => {
    const controller = start(HUMAN_VS_HUMAN);
    clickColumn(3);
    controller.newGame(BOT_VS_HUMAN);
    expect(controller.state.history).toEqual([]);
    vi.runAllTimers();
    expect(controller.state.history).toEqual([0]);
    expect(statusText()).toBe('Your turn');

    controller.newGame(HUMAN_VS_HUMAN);
    expect(statusText()).toBe("Red's turn");
    clickColumn(3);
    clickColumn(4);
    vi.runAllTimers();
    expect(controller.state.history).toEqual([3, 4]);
  });

  it('cancels a pending bot move when the seats change', () => {
    const controller = start(HUMAN_VS_BOT);
    clickColumn(3);
    controller.newGame(HUMAN_VS_HUMAN);
    vi.runAllTimers();
    expect(controller.state.history).toEqual([]);
  });
});
