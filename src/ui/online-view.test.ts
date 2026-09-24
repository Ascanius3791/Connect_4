// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { OnlineStatus, RematchState } from '../app/online';
import { createOnlineView, onlineStatusText } from './online-view';

const LINK = 'https://ascanius3791.github.io/Connect_4/#join=abc';
const WAITING: OnlineStatus = { kind: 'waiting', link: LINK };

/** Waits until the copy handler's promise has settled. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

let container: HTMLElement;

beforeEach(() => {
  container = document.createElement('div');
  document.body.replaceChildren(container);
});

afterEach(() => {
  Reflect.deleteProperty(navigator, 'clipboard');
});

function box(): HTMLElement | null {
  return container.querySelector('.online-link');
}

function input(): HTMLInputElement | null {
  return container.querySelector('.online-link input');
}

function copyButton(): HTMLButtonElement | null {
  return container.querySelector('button.copy-link');
}

function stubClipboard(writeText: (text: string) => Promise<void>): void {
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
}

describe('createOnlineView', () => {
  it('starts hidden', () => {
    createOnlineView(container, () => {});
    expect(box()?.hidden).toBe(true);
  });

  it('shows the link with a Copy link button while waiting', () => {
    createOnlineView(container, () => {}).render(WAITING);
    expect(box()?.hidden).toBe(false);
    expect(input()?.value).toBe(LINK);
    expect(input()?.readOnly).toBe(true);
    expect(copyButton()?.textContent).toBe('Copy link');
  });

  it.each<OnlineStatus | undefined>([
    undefined,
    { kind: 'creating' },
    { kind: 'connecting' },
    { kind: 'connected' },
    { kind: 'version-mismatch' },
    { kind: 'out-of-sync' },
    { kind: 'connection-lost' },
    { kind: 'game-over', rematch: 'none' },
    { kind: 'failed', message: 'x' },
  ])('hides the link for %o', (status) => {
    const view = createOnlineView(container, () => {});
    view.render(WAITING);
    view.render(status);
    expect(box()?.hidden).toBe(true);
  });

  it('copies the link to the clipboard', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    stubClipboard(writeText);
    createOnlineView(container, () => {}).render(WAITING);
    copyButton()?.click();
    await settle();
    expect(writeText).toHaveBeenCalledWith(LINK);
    expect(copyButton()?.textContent).toBe('Copied!');
  });

  it('resets the button for a new link', async () => {
    stubClipboard(() => Promise.resolve());
    const view = createOnlineView(container, () => {});
    view.render(WAITING);
    copyButton()?.click();
    await settle();
    view.render({ kind: 'waiting', link: `${LINK}2` });
    expect(copyButton()?.textContent).toBe('Copy link');
  });

  it.each([
    ['is refused', () => stubClipboard(() => Promise.reject(new Error('denied')))],
    ['is unavailable', () => {}],
  ])('selects the link when the clipboard %s', async (_, setup) => {
    setup();
    createOnlineView(container, () => {}).render(WAITING);
    copyButton()?.click();
    await settle();
    const field = input();
    expect(document.activeElement).toBe(field);
    expect(field?.selectionStart).toBe(0);
    expect(field?.selectionEnd).toBe(LINK.length);
    expect(copyButton()?.textContent).toBe('Copy link');
  });
});

describe('the rematch box', () => {
  function rematchBox(): HTMLElement | null {
    return container.querySelector('.online-rematch');
  }

  function rematchButton(): HTMLButtonElement | null {
    return container.querySelector('button.rematch');
  }

  it.each<OnlineStatus | undefined>([
    undefined,
    WAITING,
    { kind: 'connected' },
    { kind: 'connection-lost' },
    { kind: 'out-of-sync' },
  ])('is hidden for %o', (status) => {
    const view = createOnlineView(container, () => {});
    view.render({ kind: 'game-over', rematch: 'none' });
    view.render(status);
    expect(rematchBox()?.hidden).toBe(true);
  });

  it.each<[RematchState, string, string, boolean]>([
    ['none', '', 'Rematch', false],
    ['requested', 'Waiting for your opponent to accept…', 'Rematch', true],
    ['offered', 'Opponent wants a rematch', 'Accept', false],
  ])('shows the %s state after a game', (rematch, text, label, disabled) => {
    createOnlineView(container, () => {}).render({ kind: 'game-over', rematch });
    expect(rematchBox()?.hidden).toBe(false);
    expect(rematchBox()?.querySelector('span')?.textContent).toBe(text);
    expect(rematchButton()?.textContent).toBe(label);
    expect(rematchButton()?.disabled).toBe(disabled);
  });

  it('reports clicks on its button', () => {
    const onRematch = vi.fn();
    createOnlineView(container, onRematch).render({ kind: 'game-over', rematch: 'none' });
    rematchButton()?.click();
    expect(onRematch).toHaveBeenCalledOnce();
  });
});

describe('onlineStatusText', () => {
  it.each<[OnlineStatus, string]>([
    [{ kind: 'creating' }, 'Creating game…'],
    [WAITING, 'Waiting for opponent…'],
    [{ kind: 'connecting' }, 'Connecting…'],
  ])('describes %o as progress', (status, text) => {
    expect(onlineStatusText(status)).toEqual({ text, tone: 'progress' });
  });

  it.each<[OnlineStatus, string]>([
    [{ kind: 'connection-lost' }, 'Connection lost'],
    [{ kind: 'join-failed' }, 'Could not join this game. Ask for a new link.'],
    [
      { kind: 'version-mismatch' },
      'Your opponent is on a different version. Please both reload the page.',
    ],
    [{ kind: 'out-of-sync' }, 'Game out of sync'],
    [{ kind: 'failed', message: 'No game found' }, 'No game found'],
  ])('describes %o as an error', (status, text) => {
    expect(onlineStatusText(status)).toEqual({ text, tone: 'error' });
  });

  it.each<OnlineStatus>([{ kind: 'connected' }, { kind: 'game-over', rematch: 'offered' }])(
    'gives no notice for %o',
    (status) => {
      expect(onlineStatusText(status)).toBeUndefined();
    },
  );
});
