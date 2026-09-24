import { COLUMNS, ROWS, getCell } from '../game/board';
import { canPlay, type GameState } from '../game/game';
import { playerClass } from './players';

export interface BoardView {
  /** Shows `state`: its discs, and which columns can be clicked. */
  render(state: GameState): void;
}

/**
 * Builds the board inside `container` once and returns a view that updates
 * it in place. Each column is a button that reports its index to
 * `onColumnClick`; the view never changes the game itself, so a local player,
 * a bot or a remote player can all drive the same state.
 */
export function createBoardView(
  container: HTMLElement,
  onColumnClick: (column: number) => void,
): BoardView {
  const board = document.createElement('div');
  board.className = 'board';

  const cells: HTMLElement[][] = [];
  const buttons: HTMLButtonElement[] = [];
  for (let column = 0; column < COLUMNS; column++) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'column';
    button.setAttribute('aria-label', `Column ${column + 1}`);
    button.addEventListener('click', () => onColumnClick(column));

    // Row 0 is the bottom row; the column is laid out bottom-up in CSS.
    const columnCells: HTMLElement[] = [];
    for (let row = 0; row < ROWS; row++) {
      const cell = document.createElement('span');
      cell.className = 'cell';
      button.append(cell);
      columnCells.push(cell);
    }
    cells.push(columnCells);
    buttons.push(button);
    board.append(button);
  }
  container.replaceChildren(board);

  return {
    render(state) {
      buttons.forEach((button, column) => {
        button.disabled = !canPlay(state, column);
      });
      cells.forEach((columnCells, column) => {
        columnCells.forEach((cell, row) => {
          const player = getCell(state.board, column, row);
          cell.className = player === 0 ? 'cell' : `cell ${playerClass(player)}`;
        });
      });
    },
  };
}
