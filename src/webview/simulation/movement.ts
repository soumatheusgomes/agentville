// Position stepping and target selection. Movement is meaningless in this sub-project —
// characters wander. Sub-project 2 replaces `pickTarget` with furniture-aware selection;
// nothing else needs to change, which is why target choice is isolated here.

import type { Character } from './population';
import { walkableTiles } from './world';

const SPEED_PX_PER_MS = 0.02;

export function step(character: Character, deltaMs: number): Character {
  const dx = character.targetX - character.x;
  const dy = character.targetY - character.y;
  const distance = Math.hypot(dx, dy);
  if (distance === 0) {
    return character;
  }
  const travel = Math.min(distance, SPEED_PX_PER_MS * deltaMs);
  return {
    ...character,
    x: character.x + (dx / distance) * travel,
    y: character.y + (dy / distance) * travel,
  };
}

/** Choose a new wander destination. `random` is injected so tests stay deterministic. */
export function pickTarget(character: Character, random: () => number): Character {
  // Draw from the walkable set rather than guessing coordinates: the map is furnished, so
  // most of the grid is solid and rejection sampling would stall against desks.
  const tiles = walkableTiles();
  if (tiles.length === 0) {
    return { ...character, state: 'idle' };
  }
  const tile = tiles[Math.min(tiles.length - 1, Math.floor(random() * tiles.length))];
  return { ...character, targetX: tile.x, targetY: tile.y, state: 'walking' };
}
