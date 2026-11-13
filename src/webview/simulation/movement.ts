// Position stepping and target selection. Movement carries no meaning yet — characters
// wander. A later sub-project replaces `pickTarget` with furniture-aware selection;
// nothing else needs to change, which is why target choice is isolated here.

import type { Character, Facing } from './population';
import { findPath, walkableTiles } from './world';

const SPEED_PX_PER_MS = 0.03;
export const REST_MS = 1500;

function facingFor(dx: number, dy: number, current: Facing): Facing {
  if (dx === 0 && dy === 0) {
    return current;
  }
  if (Math.abs(dx) > Math.abs(dy)) {
    return dx > 0 ? 'right' : 'left';
  }
  return dy > 0 ? 'down' : 'up';
}

/** Move along the path by `deltaMs` worth of walking, consuming waypoints as they are reached. */
export function step(character: Character, deltaMs: number): Character {
  let { x, y, facing } = character;
  let path = character.path;
  let budget = SPEED_PX_PER_MS * deltaMs;
  while (path.length > 0 && budget > 0) {
    const [next] = path;
    const dx = next.x - x;
    const dy = next.y - y;
    const distance = Math.hypot(dx, dy);
    facing = facingFor(dx, dy, facing);
    if (distance <= budget) {
      ({ x, y } = next);
      budget -= distance;
      path = path.slice(1);
      continue;
    }
    x += (dx / distance) * budget;
    y += (dy / distance) * budget;
    budget = 0;
  }
  return { ...character, x, y, facing, path };
}

/** Choose a new wander destination. `random` is injected so tests stay deterministic. */
export function pickTarget(character: Character, random: () => number): Character {
  // Draw from the walkable set rather than guessing coordinates: the map is furnished, so
  // much of the grid is solid and rejection sampling would stall against desks.
  const tiles = walkableTiles();
  const tile = tiles[Math.min(tiles.length - 1, Math.floor(random() * tiles.length))];
  const path = findPath(character, tile);
  return path.length > 0 ? { ...character, path, state: 'walking' } : { ...character, state: 'idle' };
}

export interface Tick {
  now: number; // scene time, ms
  deltaMs: number;
  random: () => number;
}

/**
 * One simulation tick: walk, and on arrival rest for REST_MS before wandering on.
 * A leaving character only walks — `reconcile` removes it once it reaches the door.
 */
export function advance(character: Character, tick: Tick): Character {
  const { now, random } = tick;
  const moved = step(character, tick.deltaMs);
  if (moved.path.length > 0 || moved.state === 'leaving') {
    return moved;
  }
  if (moved.state === 'walking' || moved.state === 'entering') {
    return { ...moved, state: 'idle', restUntil: now + (moved.state === 'entering' ? 0 : REST_MS) };
  }
  return now < moved.restUntil ? moved : pickTarget(moved, random);
}
