import type { OnlineStatus, RematchState } from '../app/online';

export interface OnlineView {
  /**
   * Shows the link box while `status` is waiting for a guest, and the rematch
   * box after a finished game. Hides both otherwise, including for
   * `undefined` (not playing online).
   */
  render(status: OnlineStatus | undefined): void;
}

/** The rematch box's text and button label for each rematch state. */
const REMATCH_TEXTS: Readonly<Record<RematchState, { text: string; button: string }>> = {
  none: { text: '', button: 'Rematch' },
  requested: { text: 'Waiting for your opponent to accept…', button: 'Rematch' },
  offered: { text: 'Opponent wants a rematch', button: 'Accept' },
};

/**
 * The status line text for `status`, or `undefined` once connected, when the
 * line shows the game's own status instead.
 */
export function onlineStatusText(status: OnlineStatus): string | undefined {
  // No default branch: TypeScript reports a missing return if a new status kind is added.
  switch (status.kind) {
    case 'creating':
      return 'Creating game…';
    case 'waiting':
      return 'Waiting for opponent…';
    case 'connecting':
      return 'Connecting…';
    case 'connected':
    case 'game-over':
      return undefined;
    case 'version-mismatch':
      return 'Your opponent is on a different version. Please both reload the page.';
    case 'out-of-sync':
      return 'Game out of sync';
    case 'connection-lost':
      return 'Connection lost';
    case 'join-failed':
      return 'Could not join this game. Ask for a new link.';
    case 'failed':
      return status.message;
  }
}

/**
 * Builds two boxes inside `container`, both hidden at first: the link to send
 * to the opponent with its "Copy link" button, and the rematch offer whose
 * button calls `onRematch`.
 */
export function createOnlineView(container: HTMLElement, onRematch: () => void): OnlineView {
  const box = document.createElement('div');
  box.className = 'online-link';
  box.hidden = true;

  const label = document.createElement('label');
  const input = document.createElement('input');
  input.type = 'text';
  input.readOnly = true;
  label.append('Send this link to your opponent: ', input);

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'copy-link';
  button.textContent = 'Copy link';
  button.addEventListener('click', () => void copyLink(input, button));

  box.append(label, button);

  const rematchBox = document.createElement('div');
  rematchBox.className = 'online-rematch';
  rematchBox.hidden = true;
  const rematchText = document.createElement('span');
  rematchText.setAttribute('aria-live', 'polite');
  const rematchButton = document.createElement('button');
  rematchButton.type = 'button';
  rematchButton.className = 'rematch';
  rematchButton.addEventListener('click', onRematch);
  rematchBox.append(rematchText, rematchButton);

  container.replaceChildren(box, rematchBox);

  return {
    render(status) {
      const link = status?.kind === 'waiting' ? status.link : undefined;
      box.hidden = link === undefined;
      if (link !== undefined && link !== input.value) {
        input.value = link;
        button.textContent = 'Copy link';
      }

      const rematch = status?.kind === 'game-over' ? status.rematch : undefined;
      rematchBox.hidden = rematch === undefined;
      if (rematch !== undefined) {
        rematchText.textContent = REMATCH_TEXTS[rematch].text;
        rematchButton.textContent = REMATCH_TEXTS[rematch].button;
        rematchButton.disabled = rematch === 'requested';
      }
    },
  };
}

/**
 * Copies the link to the clipboard. Where the clipboard is unavailable (e.g.
 * on plain http) or refused, selects the text so the user can copy it.
 */
async function copyLink(input: HTMLInputElement, button: HTMLButtonElement): Promise<void> {
  try {
    await navigator.clipboard.writeText(input.value);
    button.textContent = 'Copied!';
  } catch {
    input.focus();
    input.select();
  }
}
