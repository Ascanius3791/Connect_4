import type { GameState } from '../game/game';
import type { SearchOutcome } from './search';
import {
  answerSearchRequest,
  createSearchRequest,
  type EngineSearchOptions,
  type SearchRequest,
  type SearchResponse,
} from './search-protocol';

export type { EngineSearchOptions } from './search-protocol';

/** The move an engine chose and what its search proved. */
export type SearchAnswer = SearchOutcome;

/**
 * Searches positions away from the caller's code. Each engine runs one
 * search at a time: starting a search cancels the previous one. The bot and
 * the analysis (#22) each use their own engine, so they never cancel each
 * other.
 */
export interface Engine {
  /**
   * Searches `state`, which must be a game still in progress. The promise
   * rejects if the search fails (for a worker: it could not start or it
   * crashed), and never settles if the search is cancelled first.
   */
  search(state: GameState, options?: EngineSearchOptions): Promise<SearchAnswer>;
  /** Drops the running search, if any; its promise never settles. */
  cancel(): void;
}

/**
 * Runs the search on the page itself, one timer tick after the call, with the
 * request and answer copied like `postMessage` does. It blocks the page while
 * it searches, so it is meant for tests and environments without workers.
 */
export function createInProcessEngine(): Engine {
  let current = 0;
  return {
    search(state, options = {}) {
      const id = ++current;
      const request = createSearchRequest(id, state, options);
      return new Promise((resolve, reject) => {
        setTimeout(() => {
          if (id !== current) return;
          const response = structuredClone(answerSearchRequest(structuredClone(request)));
          settle(response, resolve, reject);
        }, 0);
      });
    },
    cancel() {
      current++;
    },
  };
}

/** The part of a `Worker` the engine uses, so tests can pass a fake. */
export interface SearchWorker {
  onmessage: ((event: MessageEvent<SearchResponse>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  onmessageerror: ((event: MessageEvent) => void) | null;
  postMessage(request: SearchRequest): void;
  terminate(): void;
}

function spawnSearchWorker(): SearchWorker {
  // Vite spots this exact pattern, bundles the worker as its own file and
  // points the URL at it under the site's base path.
  return new Worker(new URL('./search.worker.ts', import.meta.url), { type: 'module' });
}

/**
 * Runs the search in a Web Worker, so the page stays responsive. The worker
 * is started on the first search. A search cannot be interrupted, so
 * cancelling a running one stops its worker and the next search starts a
 * fresh one instead of waiting for a stale answer. When the worker fails,
 * the running search rejects and the next search starts a fresh worker.
 */
export function createWorkerEngine(spawn: () => SearchWorker = spawnSearchWorker): Engine {
  let worker: SearchWorker | undefined;
  let nextId = 0;
  let pending:
    | {
        readonly id: number;
        readonly resolve: (answer: SearchAnswer) => void;
        readonly reject: (error: Error) => void;
      }
    | undefined;

  function stopWorker(): void {
    worker?.terminate();
    worker = undefined;
  }

  function fail(error: Error): void {
    const request = pending;
    pending = undefined;
    stopWorker();
    request?.reject(error);
  }

  function startWorker(): SearchWorker {
    const started = spawn();
    started.onmessage = (event) => {
      const response = event.data;
      // An answer to an older request (there should be none, since its
      // worker was stopped) is ignored.
      if (started !== worker || pending === undefined || response.id !== pending.id) return;
      const request = pending;
      pending = undefined;
      settle(response, request.resolve, request.reject);
    };
    started.onerror = (event) => {
      if (started !== worker) return;
      // Handled here; the caller logs the rejection.
      event.preventDefault();
      fail(new Error(`Search worker failed: ${event.message || 'it could not start or crashed'}`));
    };
    started.onmessageerror = () => {
      if (started === worker) fail(new Error('Search worker sent an unreadable answer'));
    };
    return started;
  }

  function cancel(): void {
    if (pending === undefined) return;
    pending = undefined;
    stopWorker();
  }

  return {
    search(state, options = {}) {
      cancel();
      const id = ++nextId;
      return new Promise((resolve, reject) => {
        pending = { id, resolve, reject };
        try {
          worker ??= startWorker();
          worker.postMessage(createSearchRequest(id, state, options));
        } catch (error) {
          fail(error instanceof Error ? error : new Error(String(error)));
        }
      });
    },
    cancel,
  };
}

function settle(
  response: SearchResponse,
  resolve: (answer: SearchAnswer) => void,
  reject: (error: Error) => void,
): void {
  if (response.ok) resolve(response.outcome);
  else reject(new Error(response.error));
}
