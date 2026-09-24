import type { SearchResult } from '../bot/search';
import { PLAYER_NAMES } from './players';

/** What the analysis line shows: what the search proved, or that it is still running. */
export type AnalysisLine = SearchResult | 'analysing';

export interface AnalysisView {
  /**
   * Shows the "Analysis" button, pressed while `on`, and while it is on the
   * analysis line for `line` (empty without one). With `available` false
   * (e.g. in an online game) the button is hidden and the line empty.
   */
  render(available: boolean, on: boolean, line?: AnalysisLine): void;
}

/**
 * Builds the analysis line and the "Analysis" button inside `container`
 * once and returns a view that updates them in place. The button reports
 * clicks to `onToggle`; the caller owns the on/off state. The line is an
 * `aria-live` region like the status line, so screen readers announce it.
 */
export function createAnalysisView(container: HTMLElement, onToggle: () => void): AnalysisView {
  const line = document.createElement('p');
  line.className = 'analysis';
  line.setAttribute('aria-live', 'polite');

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'analysis-toggle';
  button.textContent = 'Analysis';
  button.setAttribute('aria-pressed', 'false');
  button.addEventListener('click', onToggle);

  container.replaceChildren(line, button);

  return {
    render(available, on, analysis) {
      button.hidden = !available;
      button.setAttribute('aria-pressed', String(on));
      if (!available || !on || analysis === undefined) line.textContent = '';
      else line.textContent = analysis === 'analysing' ? 'Analysing…' : describeAnalysis(analysis);
    },
  };
}

/**
 * The analysis line for a search result. Wins count the winning player's
 * own moves including the winning disc; "at most" marks a win that is not
 * proven to be the quickest. Without a proven result, it says how many
 * moves (of either player) the search looked ahead.
 */
export function describeAnalysis(result: SearchResult): string {
  // No default branch: TypeScript reports a missing return if a new result kind is added.
  switch (result.kind) {
    case 'win': {
      const bound = result.exact ? '' : 'at most ';
      return `${PLAYER_NAMES[result.player]} wins in ${bound}${countMoves(result.moves)}`;
    }
    case 'draw':
      return 'Draw with best play';
    case 'unknown':
      return `No forced win within the next ${countMoves(result.depth)}`;
  }
}

function countMoves(count: number): string {
  return count === 1 ? '1 move' : `${count} moves`;
}
