// Reconciles a snapshot against the current cast. Pure: takes the old cast plus the new
// agent list, returns a brand-new cast. Never mutates its input — the renderer holds a
// reference to the previous array while this runs.

import type { AgentView } from '../../officeTypes';
import { DOOR, findPath, type Point } from './world';

/** Character sets per kind in characters.png; sessions use sets 0..3, subagents 4..7. */
export const SPRITE_VARIANTS = 4;

export type CharacterState = 'entering' | 'walking' | 'idle' | 'leaving';
export type Facing = 'down' | 'left' | 'right' | 'up';

export interface Character {
  id: string;
  sprite: number; // character-set row in characters.png
  x: number;
  y: number;
  path: readonly Point[]; // remaining waypoints; empty means "arrived"
  facing: Facing;
  state: CharacterState;
  restUntil: number; // scene time (ms) before which an arrived character stays put
  agent: AgentView;
}

/** Stable per-name variant, so the same agent is always the same person. */
export function spriteVariantFor(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % SPRITE_VARIANTS;
}

/** Sessions and subagents draw from distinct character sets. */
export function spriteFor(agent: AgentView): number {
  return (agent.kind === 'subagent' ? SPRITE_VARIANTS : 0) + spriteVariantFor(agent.name);
}

function spawn(agent: AgentView): Character {
  return {
    id: agent.id,
    sprite: spriteFor(agent),
    x: DOOR.x,
    y: DOOR.y,
    path: [],
    facing: 'up',
    state: 'entering',
    restUntil: 0,
    agent,
  };
}

const AT_DOOR_EPSILON = 1;

function hasReachedDoor(character: Character): boolean {
  return Math.abs(character.x - DOOR.x) <= AT_DOOR_EPSILON && Math.abs(character.y - DOOR.y) <= AT_DOOR_EPSILON;
}

function stillPresent(character: Character, agent: AgentView): Character {
  // An agent that reappears while walking out turns around; clearing the path makes the
  // movement step pick a fresh destination on its next tick.
  if (character.state === 'leaving') {
    return { ...character, agent, state: 'walking', path: [], restUntil: 0 };
  }
  return { ...character, agent };
}

export function reconcile(cast: readonly Character[], agents: readonly AgentView[]): Character[] {
  const byId = new Map(agents.map((agent) => [agent.id, agent]));
  const kept: Character[] = [];
  for (const character of cast) {
    const agent = byId.get(character.id);
    if (agent) {
      kept.push(stillPresent(character, agent));
      continue;
    }
    if (character.state === 'leaving') {
      if (!hasReachedDoor(character)) {
        kept.push(character); // still on its way out
      }
      continue;
    }
    kept.push({ ...character, state: 'leaving', path: findPath(character, DOOR) });
  }
  const present = new Set(cast.map((character) => character.id));
  const spawned = agents.filter((agent) => !present.has(agent.id)).map(spawn);
  return [...kept, ...spawned];
}
