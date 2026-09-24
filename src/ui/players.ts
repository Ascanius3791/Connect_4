import type { Player } from '../game/board';

/** Display name of each player, matching the disc colour in style.css. */
export const PLAYER_NAMES: Readonly<Record<Player, string>> = { 1: 'Red', 2: 'Yellow' };

/** CSS class that gives an element `player`'s disc colour. */
export function playerClass(player: Player): string {
  return `player-${player}`;
}
