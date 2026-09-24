// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAnalysisView, describeAnalysis } from './analysis-view';

describe('describeAnalysis', () => {
  it('names the winner and the length of a shortest forced win', () => {
    expect(describeAnalysis({ kind: 'win', player: 1, moves: 4, exact: true })).toBe(
      'Red wins in 4 moves',
    );
    expect(describeAnalysis({ kind: 'win', player: 2, moves: 2, exact: true })).toBe(
      'Yellow wins in 2 moves',
    );
  });

  it('uses the singular for a win with the next disc', () => {
    expect(describeAnalysis({ kind: 'win', player: 1, moves: 1, exact: true })).toBe(
      'Red wins in 1 move',
    );
    expect(describeAnalysis({ kind: 'win', player: 2, moves: 1, exact: true })).toBe(
      'Yellow wins in 1 move',
    );
  });

  it('gives a win not proven to be the shortest as a bound', () => {
    expect(describeAnalysis({ kind: 'win', player: 1, moves: 7, exact: false })).toBe(
      'Red wins in at most 7 moves',
    );
    expect(describeAnalysis({ kind: 'win', player: 2, moves: 1, exact: false })).toBe(
      'Yellow wins in at most 1 move',
    );
  });

  it('reports a proven draw', () => {
    expect(describeAnalysis({ kind: 'draw' })).toBe('Draw with best play');
  });

  it('says how far the search looked when nothing is proven', () => {
    expect(describeAnalysis({ kind: 'unknown', depth: 12 })).toBe(
      'No forced win within the next 12 moves',
    );
    expect(describeAnalysis({ kind: 'unknown', depth: 1 })).toBe(
      'No forced win within the next 1 move',
    );
  });
});

describe('createAnalysisView', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
  });

  const button = () => container.querySelector<HTMLButtonElement>('.analysis-toggle');
  const line = () => container.querySelector('.analysis');

  it('builds an Analysis button that is off and an empty live line', () => {
    createAnalysisView(container, () => {}).render(true, false);
    expect(button()?.textContent).toBe('Analysis');
    expect(button()?.type).toBe('button');
    expect(button()?.hidden).toBe(false);
    expect(button()?.getAttribute('aria-pressed')).toBe('false');
    expect(line()?.getAttribute('aria-live')).toBe('polite');
    expect(line()?.textContent).toBe('');
  });

  it('reports clicks without changing its own state', () => {
    const onToggle = vi.fn();
    createAnalysisView(container, onToggle).render(true, false);
    button()?.click();
    expect(onToggle).toHaveBeenCalledOnce();
    expect(button()?.getAttribute('aria-pressed')).toBe('false');
  });

  it('follows the on/off state in aria-pressed', () => {
    const view = createAnalysisView(container, () => {});
    view.render(true, true);
    expect(button()?.getAttribute('aria-pressed')).toBe('true');
    view.render(true, false);
    expect(button()?.getAttribute('aria-pressed')).toBe('false');
  });

  it('shows the running analysis and then its result while on', () => {
    const view = createAnalysisView(container, () => {});
    view.render(true, true, 'analysing');
    expect(line()?.textContent).toBe('Analysing…');
    view.render(true, true, { kind: 'win', player: 1, moves: 1, exact: true });
    expect(line()?.textContent).toBe('Red wins in 1 move');
  });

  it('empties the line when switched off or without a result', () => {
    const view = createAnalysisView(container, () => {});
    view.render(true, true, { kind: 'draw' });
    view.render(true, false, { kind: 'draw' });
    expect(line()?.textContent).toBe('');
    view.render(true, true, { kind: 'draw' });
    view.render(true, true);
    expect(line()?.textContent).toBe('');
  });

  it('hides the button and the line when the analysis is not available', () => {
    const view = createAnalysisView(container, () => {});
    view.render(false, true, { kind: 'draw' });
    expect(button()?.hidden).toBe(true);
    expect(line()?.textContent).toBe('');
  });
});
