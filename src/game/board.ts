export const COLUMNS = 7;
export const ROWS = 6;

export type Player = 1 | 2;
export type Cell = Player | 0;

/**
 * Immutable Connect 4 board. Each column lists its discs from the bottom
 * (row 0) up, so a column's length is also the row of its next free cell.
 * Treat the representation as internal and use the functions below.
 */
export interface Board {
  readonly columns: readonly (readonly Player[])[];
}

export interface DropResult {
  readonly board: Board;
  readonly row: number;
}

export function createBoard(): Board {
  return { columns: Array.from({ length: COLUMNS }, () => []) };
}

export function dropDisc(board: Board, column: number, player: Player): DropResult {
  const discs = columnDiscs(board, column);
  if (discs.length >= ROWS) {
    throw new Error(`Column ${column} is full`);
  }
  const columns = board.columns.map((c, i) => (i === column ? [...c, player] : c));
  return { board: { columns }, row: discs.length };
}

export function legalColumns(board: Board): number[] {
  const legal: number[] = [];
  board.columns.forEach((discs, column) => {
    if (discs.length < ROWS) legal.push(column);
  });
  return legal;
}

export function getCell(board: Board, column: number, row: number): Cell {
  const discs = columnDiscs(board, column);
  if (!Number.isInteger(row) || row < 0 || row >= ROWS) {
    throw new RangeError(`Row ${row} is out of range 0-${ROWS - 1}`);
  }
  return discs[row] ?? 0;
}

function columnDiscs(board: Board, column: number): readonly Player[] {
  const discs = Number.isInteger(column) ? board.columns[column] : undefined;
  if (!discs) {
    throw new RangeError(`Column ${column} is out of range 0-${COLUMNS - 1}`);
  }
  return discs;
}
