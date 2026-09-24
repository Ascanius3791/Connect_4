import { createBoard, dropDisc, legalColumns, type Board, type Player } from './board';
import { findWin, type Position } from './rules';

export type GameStatus =
  | { readonly kind: 'playing' }
  | { readonly kind: 'won'; readonly winner: Player; readonly cells: readonly Position[] }
  | { readonly kind: 'draw' };

/**
 * A whole game as plain data, so it survives a JSON round-trip unchanged.
 * `history` lists the column of every move in order; replaying it from
 * `newGame()` reproduces the state.
 */
export interface GameState {
  readonly board: Board;
  readonly currentPlayer: Player;
  readonly status: GameStatus;
  readonly history: readonly number[];
}

export function newGame(): GameState {
  return { board: createBoard(), currentPlayer: 1, status: { kind: 'playing' }, history: [] };
}

/** True if `column` is a legal move for the current player right now. */
export function canPlay(state: GameState, column: number): boolean {
  return state.status.kind === 'playing' && legalColumns(state.board).includes(column);
}

/**
 * Drops a disc for the current player and passes the turn. An illegal move
 * (game over, full or invalid column) is rejected by returning `state`
 * itself, so callers can detect it with `next === state`.
 */
export function playMove(state: GameState, column: number): GameState {
  if (!canPlay(state, column)) return state;
  const { board } = dropDisc(state.board, column, state.currentPlayer);
  return {
    board,
    currentPlayer: state.currentPlayer === 1 ? 2 : 1,
    status: statusOf(board),
    history: [...state.history, column],
  };
}

function statusOf(board: Board): GameStatus {
  const win = findWin(board);
  if (win) return { kind: 'won', winner: win.winner, cells: win.cells };
  if (legalColumns(board).length === 0) return { kind: 'draw' };
  return { kind: 'playing' };
}
