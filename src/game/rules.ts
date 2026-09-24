import { COLUMNS, ROWS, getCell, legalColumns, type Board, type Cell, type Player } from './board';

export const WIN_LENGTH = 4;

export interface Position {
  readonly column: number;
  readonly row: number;
}

export interface Win {
  readonly winner: Player;
  /** Every disc of every winning line, each listed once. */
  readonly cells: readonly Position[];
}

/** Horizontal, vertical, rising diagonal, falling diagonal. */
const DIRECTIONS = [
  [1, 0],
  [0, 1],
  [1, 1],
  [1, -1],
] as const;

/**
 * Finds connected lines of at least four discs. If one move completes
 * several lines at once, the cells of all of them are returned. If both
 * players have a line (impossible in a legal game), the first one found wins.
 */
export function findWin(board: Board): Win | null {
  let win: { winner: Player; cells: Position[] } | null = null;
  for (let column = 0; column < COLUMNS; column++) {
    for (let row = 0; row < ROWS; row++) {
      const player = getCell(board, column, row);
      if (player === 0) continue;
      for (const [dc, dr] of DIRECTIONS) {
        // Only walk a line from its first disc, so each line is seen once.
        if (cellAt(board, column - dc, row - dr) === player) continue;
        const line: Position[] = [];
        for (let c = column, r = row; cellAt(board, c, r) === player; c += dc, r += dr) {
          line.push({ column: c, row: r });
        }
        if (line.length < WIN_LENGTH) continue;
        if (!win) {
          win = { winner: player, cells: line };
        } else if (win.winner === player) {
          const known = win.cells;
          win.cells.push(
            ...line.filter((p) => !known.some((k) => k.column === p.column && k.row === p.row)),
          );
        }
      }
    }
  }
  return win;
}

export function isDraw(board: Board): boolean {
  return legalColumns(board).length === 0 && findWin(board) === null;
}

function cellAt(board: Board, column: number, row: number): Cell {
  if (column < 0 || column >= COLUMNS || row < 0 || row >= ROWS) return 0;
  return getCell(board, column, row);
}
