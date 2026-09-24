import { DEFAULT_LEVEL, type Level } from '../bot/levels';

export type Mode = 'two-players' | 'computer' | 'online';

/** Who moves first in computer mode; the starter plays red. */
export type Starter = 'human' | 'computer';

export interface ModeSettings {
  readonly mode: Mode;
  /** Only used in computer mode. */
  readonly starter: Starter;
  /** The computer's strength; only used in computer mode. */
  readonly level: Level;
}

export const DEFAULT_MODE_SETTINGS: ModeSettings = {
  mode: 'two-players',
  starter: 'human',
  level: DEFAULT_LEVEL,
};

const MODE_OPTIONS: readonly (readonly [Mode, string])[] = [
  ['two-players', 'Two players'],
  ['computer', 'Against the computer'],
  ['online', 'Play online'],
];

const STARTER_OPTIONS: readonly (readonly [Starter, string])[] = [
  ['human', 'You start'],
  ['computer', 'Computer starts'],
];

const LEVEL_OPTIONS: readonly (readonly [Level, string])[] = [
  ['beginner', 'Beginner'],
  ['easy', 'Easy'],
  ['medium', 'Medium'],
  ['hard', 'Hard'],
  ['expert', 'Expert'],
];

/**
 * Builds the mode, start and level choices inside `container` as native
 * radio groups and reports the full settings to `onChange` whenever one of
 * them changes. The start and level choices are only shown in computer mode.
 */
export function createModeView(
  container: HTMLElement,
  initial: ModeSettings,
  onChange: (settings: ModeSettings) => void,
): void {
  let settings = initial;

  const modeGroup = radioGroup('Mode', 'mode', MODE_OPTIONS, settings.mode, (mode) =>
    update({ ...settings, mode }),
  );
  const starterGroup = radioGroup(
    'Who starts',
    'starter',
    STARTER_OPTIONS,
    settings.starter,
    (starter) => update({ ...settings, starter }),
  );
  const levelGroup = radioGroup('Level', 'level', LEVEL_OPTIONS, settings.level, (level) =>
    update({ ...settings, level }),
  );
  showComputerChoices();

  container.replaceChildren(modeGroup, starterGroup, levelGroup);

  function update(next: ModeSettings): void {
    settings = next;
    showComputerChoices();
    onChange(settings);
  }

  function showComputerChoices(): void {
    starterGroup.hidden = settings.mode !== 'computer';
    levelGroup.hidden = settings.mode !== 'computer';
  }
}

/** A fieldset of radio buttons named `name`, one per option, with `checked` selected. */
function radioGroup<T extends string>(
  legendText: string,
  name: string,
  options: readonly (readonly [T, string])[],
  checked: T,
  onSelect: (value: T) => void,
): HTMLFieldSetElement {
  const fieldset = document.createElement('fieldset');
  fieldset.className = `choice ${name}-choice`;
  const legend = document.createElement('legend');
  legend.textContent = legendText;
  fieldset.append(legend);

  for (const [value, text] of options) {
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = name;
    input.value = value;
    input.checked = value === checked;
    input.addEventListener('change', () => onSelect(value));

    const label = document.createElement('label');
    label.append(input, ` ${text}`);
    fieldset.append(label);
  }
  return fieldset;
}
