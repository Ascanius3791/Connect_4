import type { Seat, Seats } from '../app/controller';
import type { Player } from '../game/board';

/** Display name of each player, matching the disc colour in style.css. */
export const PLAYER_NAMES: Readonly<Record<Player, string>> = { 1: 'Red', 2: 'Yellow' };

/** CSS class that gives an element `player`'s disc colour. */
export function playerClass(player: Player): string {
  return `player-${player}`;
}

/** Who a human on this page plays against. */
export type Opponent = Exclude<Seat, 'human'>;

/** The other seat if exactly one seat is a human, so the texts can speak to them. */
export function opponentOf(seats: Seats): Opponent | undefined {
  if (seats[1] === 'human') return seats[2] === 'human' ? undefined : seats[2];
  return seats[2] === 'human' ? seats[1] : undefined;
}
