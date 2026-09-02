// Reconciles a snapshot against the current cast. Pure: takes the old cast plus the new
// agent list, returns a brand-new cast. Never mutates its input — the renderer holds a
// reference to the previous array while this runs.

import type { AgentView } from '../../officeTypes';
import { DOOR } from './world';

export const SPRITE_VARIANTS = 4;

export type CharacterState = 'entering' | 'walking' | 'idle' | 'leaving';

export interface Character {
  id: string;
  sprite: number;
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  state: CharacterState;
  agent: AgentView;
}

/** Stable per-name sprite choice, so the same agent is always the same person. */
export function spriteVariantFor(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % SPRITE_VARIANTS;
}

function spawn(agent: AgentView): Character {
  return {
    id: agent.id,
    sprite: spriteVariantFor(agent.name),
    x: DOOR.x,
    y: DOOR.y,
    targetX: DOOR.x,
    targetY: DOOR.y,
    state: 'entering',
    agent,
  };
}

const AT_DOOR_EPSILON = 1;

function hasReachedDoor(character: Character): boolean {
  return Math.abs(character.x - DOOR.x) <= AT_DOOR_EPSILON && Math.abs(character.y - DOOR.y) <= AT_DOOR_EPSILON;
}

export function reconcile(cast: readonly Character[], agents: readonly AgentView[]): Character[] {
  const byId = new Map(agents.map((agent): [string, AgentView] => [agent.id, agent]));
  const seen = new Set<string>();

  const kept: Character[] = [];
  for (const character of cast) {
    const agent = byId.get(character.id);
    if (agent) {
      seen.add(character.id);
      kept.push({ ...character, agent });
      continue;
    }
    if (character.state === 'leaving' && hasReachedDoor(character)) {
      continue; // walked out — drop it
    }
    kept.push({ ...character, state: 'leaving', targetX: DOOR.x, targetY: DOOR.y });
  }

  const spawned = agents.filter((agent) => !seen.has(agent.id)).map(spawn);
  return [...kept, ...spawned];
}
