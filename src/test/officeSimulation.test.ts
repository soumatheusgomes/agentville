import { describe, it, expect } from 'vitest';
import {
  TILE_SIZE,
  MAP_TILES_X,
  MAP_TILES_Y,
  DOOR,
  OFFICE_MAP,
  tileAt,
  isWalkable,
  walkableTiles,
  byDepth,
} from '../webview/simulation/world';
import { reconcile, spriteVariantFor, type Character } from '../webview/simulation/population';
import { step, pickTarget } from '../webview/simulation/movement';
import type { AgentView } from '../officeTypes';

function agent(over: Partial<AgentView> = {}): AgentView {
  return {
    id: 'a1',
    kind: 'session',
    name: 'proj',
    projectName: 'proj',
    brand: 'claude-code',
    status: 'working',
    lastActivityAt: 1,
    ...over,
  };
}

describe('world', () => {
  it('is a rectangular map of the declared size', () => {
    expect(OFFICE_MAP).toHaveLength(MAP_TILES_Y);
    for (const row of OFFICE_MAP) {
      expect(row).toHaveLength(MAP_TILES_X);
    }
  });

  it('places the door on a walkable tile inside the map', () => {
    expect(isWalkable(DOOR.x, DOOR.y)).toBe(true);
    expect(DOOR.x).toBeLessThan(MAP_TILES_X * TILE_SIZE);
    expect(DOOR.y).toBeLessThan(MAP_TILES_Y * TILE_SIZE);
  });

  it('rejects points outside the map', () => {
    expect(isWalkable(-1, 10)).toBe(false);
    expect(isWalkable(10, -1)).toBe(false);
    expect(isWalkable(MAP_TILES_X * TILE_SIZE + 1, 10)).toBe(false);
  });

  it('treats furniture as solid and floor as walkable', () => {
    const desk = OFFICE_MAP.findIndex((row) => row.includes('D'));
    expect(desk).toBeGreaterThanOrEqual(0);
    const deskX = OFFICE_MAP[desk].indexOf('D');
    expect(isWalkable(deskX * TILE_SIZE + 1, desk * TILE_SIZE + 1)).toBe(false);
    expect(tileAt(0, 0)).toBe('#');
    expect(isWalkable(1, 1)).toBe(false);
  });

  it('exposes every walkable tile, and only walkable ones', () => {
    const tiles = walkableTiles();
    expect(tiles.length).toBeGreaterThan(100);
    for (const tile of tiles) {
      expect(isWalkable(tile.x, tile.y)).toBe(true);
    }
  });

  it('sorts by Y so lower characters draw in front', () => {
    expect(byDepth({ y: 10 }, { y: 20 })).toBeLessThan(0);
    expect(byDepth({ y: 30 }, { y: 20 })).toBeGreaterThan(0);
  });
});

describe('spriteVariantFor', () => {
  it('is stable for the same name', () => {
    expect(spriteVariantFor('debugger')).toBe(spriteVariantFor('debugger'));
  });

  it('spreads different names across variants', () => {
    const variants = new Set(['debugger', 'explorer-agent', 'test-engineer', 'code-reviewer'].map(spriteVariantFor));
    expect(variants.size).toBeGreaterThan(1);
  });
});

describe('reconcile', () => {
  it('spawns a character at the door for a new agent', () => {
    const [character] = reconcile([], [agent()]);
    expect(character.id).toBe('a1');
    expect(character.x).toBe(DOOR.x);
    expect(character.y).toBe(DOOR.y);
    expect(character.state).toBe('entering');
  });

  it('keeps position and state for an agent that is still present', () => {
    const existing: Character = { ...reconcile([], [agent()])[0], x: 100, y: 50, state: 'walking' };
    const [next] = reconcile([existing], [agent({ action: 'Editing x.ts' })]);
    expect(next.x).toBe(100);
    expect(next.y).toBe(50);
    expect(next.state).toBe('walking');
    expect(next.agent.action).toBe('Editing x.ts');
  });

  it('marks a character leaving when its agent disappears', () => {
    const existing = reconcile([], [agent()])[0];
    const [next] = reconcile([existing], []);
    expect(next.state).toBe('leaving');
    expect(next.targetX).toBe(DOOR.x);
  });

  it('removes a leaving character once it reaches the door', () => {
    const leaving: Character = { ...reconcile([], [agent()])[0], state: 'leaving', x: DOOR.x, y: DOOR.y };
    expect(reconcile([leaving], [])).toHaveLength(0);
  });

  it('does not mutate the cast it is given', () => {
    const cast = reconcile([], [agent()]);
    const snapshot = JSON.stringify(cast);
    reconcile(cast, []);
    expect(JSON.stringify(cast)).toBe(snapshot);
  });
});

describe('movement', () => {
  it('moves a character toward its target', () => {
    const base = reconcile([], [agent()])[0];
    const character: Character = { ...base, x: 0, y: 0, targetX: 100, targetY: 0 };
    expect(step(character, 100).x).toBeGreaterThan(0);
  });

  it('never overshoots the target', () => {
    const base = reconcile([], [agent()])[0];
    const character: Character = { ...base, x: 99, y: 0, targetX: 100, targetY: 0 };
    expect(step(character, 5000).x).toBe(100);
  });

  it('picks a walkable target, never inside furniture', () => {
    const base = reconcile([], [agent()])[0];
    for (const r of [0, 0.25, 0.5, 0.75, 0.999]) {
      const picked = pickTarget(base, () => r);
      expect(isWalkable(picked.targetX, picked.targetY)).toBe(true);
      expect(picked.state).toBe('walking');
    }
  });

  it('is deterministic for a given random source', () => {
    const base = reconcile([], [agent()])[0];
    expect(pickTarget(base, () => 0.5)).toEqual(pickTarget(base, () => 0.5));
  });
});
