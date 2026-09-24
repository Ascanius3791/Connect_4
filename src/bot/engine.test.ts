import { describe, expect, it } from 'vitest';
import { legalColumns } from '../game/board';
import { newGame, playMove, type GameState } from '../game/game';
import {
  createInProcessEngine,
  createWorkerEngine,
  type Engine,
  type SearchAnswer,
  type SearchWorker,
} from './engine';
import {
  answerSearchRequest,
  createSearchRequest,
  type SearchRequest,
  type SearchResponse,
} from './search-protocol';

/** Plays a string of column digits from the empty board. */
function play(moves: string): GameState {
  return [...moves].reduce((s, c) => {
    const next = playMove(s, Number(c));
    if (next === s) throw new Error(`Move ${c} was rejected`);
    return next;
  }, newGame());
}

/** Resolves with 'pending' if `promise` has not settled after a few timer ticks. */
async function settledWithin<T>(promise: Promise<T>): Promise<T | 'pending'> {
  const pending = new Promise<'pending'>((resolve) => setTimeout(() => resolve('pending'), 50));
  return Promise.race([promise, pending]);
}

// Red has three in column 0 and moves: column 0 wins at once.
const RED_WINS_AT_ONCE = play('010101');

describe('search protocol', () => {
  it('sends only plain data, dropping a random function', () => {
    const options = { maxDepth: 3, timeLimitMs: 500, noiseMargin: 4, random: () => 0 };
    const request = createSearchRequest(7, play('33'), options);
    expect(request).toEqual({
      id: 7,
      history: [3, 3],
      options: { maxDepth: 3, timeLimitMs: 500, noiseMargin: 4 },
    });
    expect(structuredClone(request)).toEqual(request);
  });

  it('answers a request with the search outcome and its id', () => {
    const response = answerSearchRequest(createSearchRequest(4, RED_WINS_AT_ONCE, { maxDepth: 4 }));
    expect(response).toEqual({
      id: 4,
      ok: true,
      outcome: { column: 0, result: { kind: 'win', player: 1, moves: 1, exact: true } },
    });
  });

  it('answers with an error for an illegal history or a finished game', () => {
    const illegal: SearchRequest = { id: 1, history: [0, 0, 0, 0, 0, 0, 0], options: {} };
    expect(answerSearchRequest(illegal)).toMatchObject({ id: 1, ok: false });
    const finished = createSearchRequest(2, play('0101010'), { maxDepth: 2 });
    expect(answerSearchRequest(finished)).toMatchObject({ id: 2, ok: false });
  });
});

describe('createInProcessEngine', () => {
  it('answers with a legal move', async () => {
    const state = play('3342');
    const answer = await createInProcessEngine().search(state, { maxDepth: 4 });
    expect(legalColumns(state.board)).toContain(answer.column);
    expect(answer.result).toEqual({ kind: 'unknown', depth: 4 });
  });

  it('takes an immediate win', async () => {
    const answer = await createInProcessEngine().search(RED_WINS_AT_ONCE, { maxDepth: 6 });
    expect(answer.column).toBe(0);
  });

  it('rejects for a finished game', async () => {
    await expect(createInProcessEngine().search(play('0101010'))).rejects.toThrow('game is over');
  });

  it('never settles a cancelled search', async () => {
    const engine = createInProcessEngine();
    const search = engine.search(newGame(), { maxDepth: 2 });
    engine.cancel();
    expect(await settledWithin(search)).toBe('pending');
  });

  it('never settles a search replaced by a newer one', async () => {
    const engine = createInProcessEngine();
    const old = engine.search(newGame(), { maxDepth: 2 });
    const current = engine.search(RED_WINS_AT_ONCE, { maxDepth: 2 });
    expect((await current).column).toBe(0);
    expect(await settledWithin(old)).toBe('pending');
  });

  it('works again after a cancel', async () => {
    const engine = createInProcessEngine();
    void engine.search(newGame(), { maxDepth: 2 });
    engine.cancel();
    expect((await engine.search(RED_WINS_AT_ONCE, { maxDepth: 2 })).column).toBe(0);
  });
});

/**
 * A stand-in for a Web Worker that runs the same message handling as
 * `search.worker.ts` on the next timer tick, and lets tests fake crashes
 * and stray messages.
 */
class FakeWorker implements SearchWorker {
  onmessage: ((event: MessageEvent<SearchResponse>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  onmessageerror: ((event: MessageEvent) => void) | null = null;
  readonly received: SearchRequest[] = [];
  terminated = false;
  /** When false, requests are recorded but not answered. */
  answers = true;

  postMessage(request: SearchRequest): void {
    const copy = structuredClone(request);
    this.received.push(copy);
    if (!this.answers) return;
    setTimeout(() => {
      if (!this.terminated) this.send(answerSearchRequest(copy));
    }, 0);
  }

  terminate(): void {
    this.terminated = true;
  }

  send(response: SearchResponse): void {
    this.onmessage?.({ data: structuredClone(response) } as MessageEvent<SearchResponse>);
  }

  crash(message: string): void {
    this.onerror?.({ message, preventDefault: () => {} } as ErrorEvent);
  }
}

function fakeWorkers() {
  const workers: FakeWorker[] = [];
  const engine: Engine = createWorkerEngine(() => {
    const worker = new FakeWorker();
    workers.push(worker);
    return worker;
  });
  return { engine, workers };
}

describe('createWorkerEngine', () => {
  it('starts one worker lazily and answers through it', async () => {
    const { engine, workers } = fakeWorkers();
    expect(workers).toHaveLength(0);
    const first = await engine.search(RED_WINS_AT_ONCE, { maxDepth: 3 });
    const second = await engine.search(play('3'), { maxDepth: 2 });
    expect(first.column).toBe(0);
    expect(legalColumns(play('3').board)).toContain(second.column);
    expect(workers).toHaveLength(1);
    expect(workers[0]?.received.map((r) => r.history)).toEqual([[0, 1, 0, 1, 0, 1], [3]]);
  });

  it('stops a busy worker on cancel and uses a fresh one next', async () => {
    const { engine, workers } = fakeWorkers();
    const cancelled = engine.search(newGame(), { maxDepth: 2 });
    engine.cancel();
    expect(workers[0]?.terminated).toBe(true);
    const next = await engine.search(RED_WINS_AT_ONCE, { maxDepth: 2 });
    expect(next.column).toBe(0);
    expect(workers).toHaveLength(2);
    expect(await settledWithin(cancelled)).toBe('pending');
  });

  it('replaces a busy worker when a new search starts', async () => {
    const { engine, workers } = fakeWorkers();
    const old = engine.search(newGame(), { maxDepth: 2 });
    const current = engine.search(RED_WINS_AT_ONCE, { maxDepth: 2 });
    expect(workers[0]?.terminated).toBe(true);
    expect((await current).column).toBe(0);
    expect(await settledWithin(old)).toBe('pending');
  });

  it('keeps an idle worker on cancel', async () => {
    const { engine, workers } = fakeWorkers();
    await engine.search(newGame(), { maxDepth: 1 });
    engine.cancel();
    await engine.search(newGame(), { maxDepth: 1 });
    expect(workers).toHaveLength(1);
    expect(workers[0]?.terminated).toBe(false);
  });

  it('ignores answers with another id or from a stopped worker', async () => {
    const { engine, workers } = fakeWorkers();
    const search = engine.search(RED_WINS_AT_ONCE, { maxDepth: 2 });
    const worker = workers[0];
    if (!worker) throw new Error('No worker');
    const id = worker.received[0]?.id ?? 0;
    const stray = { column: 6, result: { kind: 'draw' } } as const;
    worker.send({ id: id - 1, ok: true, outcome: stray });
    worker.send({ id: id + 1, ok: true, outcome: stray });
    const answer: SearchAnswer = await search;
    expect(answer.column).toBe(0);

    worker.answers = false;
    const cancelled = engine.search(newGame(), { maxDepth: 2 });
    engine.cancel();
    worker.send({ id: worker.received[1]?.id ?? 0, ok: true, outcome: stray });
    expect(await settledWithin(cancelled)).toBe('pending');
  });

  it('rejects the running search when the worker crashes, then starts a new one', async () => {
    const { engine, workers } = fakeWorkers();
    const failing = engine.search(newGame(), { maxDepth: 2 });
    workers[0]?.crash('out of memory');
    await expect(failing).rejects.toThrow('out of memory');
    expect(workers[0]?.terminated).toBe(true);
    expect((await engine.search(RED_WINS_AT_ONCE, { maxDepth: 2 })).column).toBe(0);
    expect(workers).toHaveLength(2);
  });

  it('rejects when the worker reports a failed search', async () => {
    const { engine } = fakeWorkers();
    await expect(engine.search(play('0101010'))).rejects.toThrow('game is over');
  });

  it('rejects when no worker can be started', async () => {
    const engine = createWorkerEngine(() => {
      throw new Error('Workers are not supported');
    });
    await expect(engine.search(newGame())).rejects.toThrow('not supported');
  });

  it('rejects when the worker cannot read a message', async () => {
    const { engine, workers } = fakeWorkers();
    const search = engine.search(newGame(), { maxDepth: 2 });
    workers[0]?.onmessageerror?.({} as MessageEvent);
    await expect(search).rejects.toThrow('unreadable');
  });
});
