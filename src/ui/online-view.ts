import type { OnlineStatus } from '../app/online';

export interface OnlineView {
  /**
   * Shows the link box while `status` is waiting for a guest, and hides it
   * otherwise, including for `undefined` (not playing online).
   */
  render(status: OnlineStatus | undefined): void;
}

/** The status line text for `status`. */
export function onlineStatusText(status: OnlineStatus): string {
  // No default branch: TypeScript reports a missing return if a new status kind is added.
  switch (status.kind) {
    case 'creating':
      return 'Creating game…';
    case 'waiting':
      return 'Waiting for opponent…';
    case 'connecting':
      return 'Connecting…';
    case 'connected':
      return 'Connected';
    case 'version-mismatch':
      return 'Your opponent is on a different version. Please both reload the page.';
    case 'failed':
      return status.message;
  }
}

/**
 * Builds the box with the link to send to the opponent and its "Copy link"
 * button inside `container`, hidden until a link is rendered.
 */
export function createOnlineView(container: HTMLElement): OnlineView {
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
  container.replaceChildren(box);

  return {
    render(status) {
      const link = status?.kind === 'waiting' ? status.link : undefined;
      box.hidden = link === undefined;
      if (link !== undefined && link !== input.value) {
        input.value = link;
        button.textContent = 'Copy link';
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
