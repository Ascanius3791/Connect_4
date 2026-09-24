import { newGame, playMove, type GameState } from '../game/game';
import { searchMove, type SearchOptions, type SearchOutcome } from './search';

/**
 * The search options that can cross `postMessage`: everything but
 * `random`, which is a function. The engine picks among tied best moves
 * with `Math.random`.
 */
export type EngineSearchOptions = Omit<SearchOptions, 'random'>;

/** What the page sends to a search worker; plain data only. */
export interface SearchRequest {
  /** Tags the answer, so the page can ignore answers to older requests. */
  readonly id: number;
  /** The game's moves; replaying them from a new game gives the position. */
  readonly history: readonly number[];
  readonly options: EngineSearchOptions;
}

/** What a search worker sends back for the request with the same `id`. */
export type SearchResponse =
  | { readonly id: number; readonly ok: true; readonly outcome: SearchOutcome }
  | { readonly id: number; readonly ok: false; readonly error: string };

export function createSearchRequest(
  id: number,
  state: GameState,
  options: EngineSearchOptions,
): SearchRequest {
  // Copies the fields one by one, so nothing that cannot be cloned (such
  // as a `random` function from a caller's wider options object) slips in.
  const { maxDepth, timeLimitMs, noiseMargin } = options;
  return { id, history: [...state.history], options: { maxDepth, timeLimitMs, noiseMargin } };
}

/**
 * Answers one request: rebuilds the position from its history and searches
 * it. Never throws; a bad request or a failed search becomes an error
 * response. This is all the worker does, and the in-process engine calls it
 * directly.
 */
export function answerSearchRequest(request: SearchRequest): SearchResponse {
  try {
    const outcome = searchMove(replay(request.history), request.options);
    return { id: request.id, ok: true, outcome };
  } catch (error) {
    return { id: request.id, ok: false, error: String(error) };
  }
}

function replay(history: readonly number[]): GameState {
  let state = newGame();
  for (const column of history) {
    const next = playMove(state, column);
    if (next === state) throw new Error(`Illegal move ${column} in the game's history`);
    state = next;
  }
  return state;
}
