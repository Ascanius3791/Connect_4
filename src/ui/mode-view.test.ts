// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createModeView, DEFAULT_MODE_SETTINGS, type ModeSettings } from './mode-view';

let container: HTMLElement;

beforeEach(() => {
  container = document.createElement('div');
  // Radio buttons only fire change events while connected to the document.
  document.body.replaceChildren(container);
});

function radio(name: string, value: string): HTMLInputElement {
  const input = container.querySelector<HTMLInputElement>(
    `input[name="${name}"][value="${value}"]`,
  );
  if (!input) throw new Error(`Missing radio ${name}=${value}`);
  return input;
}

/** Selects a radio button the way a click or arrow key does. */
function select(name: string, value: string): void {
  radio(name, value).click();
}

function starterGroup(): HTMLFieldSetElement | null {
  return container.querySelector('fieldset.starter-choice');
}

function labels(name: string): (string | undefined)[] {
  return [...container.querySelectorAll(`input[name="${name}"]`)].map((input) =>
    input.closest('label')?.textContent?.trim(),
  );
}

describe('createModeView', () => {
  it('offers both modes and both starters as radio buttons with the defaults selected', () => {
    createModeView(container, DEFAULT_MODE_SETTINGS, () => {});
    expect(labels('mode')).toEqual(['Two players', 'Against the computer']);
    expect(labels('starter')).toEqual(['You start', 'Computer starts']);
    expect(radio('mode', 'two-players').checked).toBe(true);
    expect(radio('starter', 'human').checked).toBe(true);
    expect(container.querySelectorAll('input[type="radio"]')).toHaveLength(4);
  });

  it('shows the start choice only in computer mode', () => {
    createModeView(container, DEFAULT_MODE_SETTINGS, () => {});
    expect(starterGroup()?.hidden).toBe(true);
    select('mode', 'computer');
    expect(starterGroup()?.hidden).toBe(false);
    select('mode', 'two-players');
    expect(starterGroup()?.hidden).toBe(true);
  });

  it('reports the full settings when the mode changes', () => {
    const onChange = vi.fn<(settings: ModeSettings) => void>();
    createModeView(container, DEFAULT_MODE_SETTINGS, onChange);
    select('mode', 'computer');
    expect(onChange).toHaveBeenLastCalledWith({ mode: 'computer', starter: 'human' });
    select('mode', 'two-players');
    expect(onChange).toHaveBeenLastCalledWith({ mode: 'two-players', starter: 'human' });
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it('reports the full settings when the starter changes', () => {
    const onChange = vi.fn<(settings: ModeSettings) => void>();
    createModeView(container, { mode: 'computer', starter: 'human' }, onChange);
    select('starter', 'computer');
    expect(onChange).toHaveBeenLastCalledWith({ mode: 'computer', starter: 'computer' });
    select('starter', 'human');
    expect(onChange).toHaveBeenLastCalledWith({ mode: 'computer', starter: 'human' });
  });

  it('does not report selecting the option that is already selected', () => {
    const onChange = vi.fn();
    createModeView(container, DEFAULT_MODE_SETTINGS, onChange);
    select('mode', 'two-players');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('keeps the chosen starter when switching modes back and forth', () => {
    const onChange = vi.fn<(settings: ModeSettings) => void>();
    createModeView(container, DEFAULT_MODE_SETTINGS, onChange);
    select('mode', 'computer');
    select('starter', 'computer');
    select('mode', 'two-players');
    select('mode', 'computer');
    expect(onChange).toHaveBeenLastCalledWith({ mode: 'computer', starter: 'computer' });
    expect(radio('starter', 'computer').checked).toBe(true);
  });

  it('starts from the given settings', () => {
    createModeView(container, { mode: 'computer', starter: 'computer' }, () => {});
    expect(radio('mode', 'computer').checked).toBe(true);
    expect(radio('starter', 'computer').checked).toBe(true);
    expect(starterGroup()?.hidden).toBe(false);
  });
});
