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
  findPath,
  type Point,
} from '../webview/simulation/world';
import {
  reconcile,
  spriteFor,
  spriteVariantFor,
  SPRITE_VARIANTS,
  type Character,
} from '../webview/simulation/population';
import { advance, step, pickTarget, REST_MS } from '../webview/simulation/movement';
import { FRAME, TILESET_FRAMES, tileFrames } from '../webview/simulation/tiles';
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

function character(over: Partial<Character> = {}): Character {
  return { ...reconcile([], [agent()])[0], ...over };
}

/** Run the simulation until `done` holds, failing instead of looping forever. */
function runUntil(start: Character, done: (c: Character) => boolean): Character {
  let current = start;
  for (let tick = 0; tick < 10_000; tick++) {
    if (done(current)) {
      return current;
    }
    current = advance(current, { now: tick * 50, deltaMs: 50, random: () => 0.5 });
  }
  throw new Error('simulation did not converge');
}

function isAdjacentStep(a: Point, b: Point): boolean {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y) === TILE_SIZE;
}

describe('world', () => {
  it('is a rectangular map of the declared size, walled all round', () => {
    expect(OFFICE_MAP).toHaveLength(MAP_TILES_Y);
    for (const row of OFFICE_MAP) {
      expect(row).toHaveLength(MAP_TILES_X);
      expect(row[0]).toBe('#');
      expect(row[MAP_TILES_X - 1]).toBe('#');
    }
    expect(OFFICE_MAP[0]).toBe('#'.repeat(MAP_TILES_X));
    expect(OFFICE_MAP[MAP_TILES_Y - 1]).toBe('#'.repeat(MAP_TILES_X));
  });

  it('uses only known tile characters', () => {
    expect(OFFICE_MAP.join('')).toMatch(/^[#.,DCTPSKR_]+$/);
  });

  it('places the door on a walkable tile inside the map', () => {
    expect(isWalkable(DOOR.x, DOOR.y)).toBe(true);
    expect(tileAt(Math.floor(DOOR.x / TILE_SIZE), Math.floor(DOOR.y / TILE_SIZE))).toBe('_');
  });

  it('rejects points outside the map', () => {
    expect(isWalkable(-1, 10)).toBe(false);
    expect(isWalkable(10, -1)).toBe(false);
    expect(isWalkable(MAP_TILES_X * TILE_SIZE + 1, 10)).toBe(false);
    expect(tileAt(-1, -1)).toBe('#');
  });

  it('treats furniture and walls as solid and floor as walkable', () => {
    const deskRow = OFFICE_MAP.findIndex((row) => row.includes('D'));
    const deskX = OFFICE_MAP[deskRow].indexOf('D');
    expect(isWalkable(deskX * TILE_SIZE + 1, deskRow * TILE_SIZE + 1)).toBe(false);
    expect(isWalkable(1, 1)).toBe(false);
    expect(isWalkable(TILE_SIZE + 1, TILE_SIZE + 1)).toBe(true);
  });

  it('exposes every walkable tile, and only walkable ones', () => {
    const tiles = walkableTiles();
    expect(tiles.length).toBeGreaterThan(100);
    for (const tile of tiles) {
      expect(isWalkable(tile.x, tile.y)).toBe(true);
    }
  });

  it('can reach every walkable tile from the door — no sealed rooms', () => {
    for (const tile of walkableTiles()) {
      if (tile.x === DOOR.x && tile.y === DOOR.y) {
        continue;
      }
      expect(findPath(DOOR, tile).length, `unreachable tile at ${tile.x},${tile.y}`).toBeGreaterThan(0);
    }
  });

  it('sorts by Y so lower characters draw in front', () => {
    expect(byDepth({ y: 10 }, { y: 20 })).toBeLessThan(0);
    expect(byDepth({ y: 30 }, { y: 20 })).toBeGreaterThan(0);
  });
});

describe('findPath', () => {
  const topLeft = walkableTiles()[0];

  it('returns contiguous walkable steps ending on the goal tile', () => {
    const path = findPath(DOOR, topLeft);
    expect(path[path.length - 1]).toEqual(topLeft);
    let previous: Point = DOOR;
    for (const waypoint of path) {
      expect(isWalkable(waypoint.x, waypoint.y)).toBe(true);
      expect(isAdjacentStep(previous, waypoint)).toBe(true);
      previous = waypoint;
    }
  });

  it('is empty when already on the goal tile', () => {
    expect(findPath(DOOR, DOOR)).toEqual([]);
  });

  it('is empty when either end is solid', () => {
    expect(findPath(DOOR, { x: 1, y: 1 })).toEqual([]);
    expect(findPath({ x: 1, y: 1 }, DOOR)).toEqual([]);
  });
});

describe('sprites', () => {
  it('is stable for the same name', () => {
    expect(spriteVariantFor('debugger')).toBe(spriteVariantFor('debugger'));
  });

  it('spreads different names across variants', () => {
    const variants = new Set(['debugger', 'explorer-agent', 'test-engineer', 'code-reviewer'].map(spriteVariantFor));
    expect(variants.size).toBeGreaterThan(1);
  });

  it('draws sessions and subagents from distinct character sets', () => {
    expect(spriteFor(agent({ kind: 'session' }))).toBeLessThan(SPRITE_VARIANTS);
    expect(spriteFor(agent({ kind: 'subagent' }))).toBeGreaterThanOrEqual(SPRITE_VARIANTS);
  });
});

describe('reconcile', () => {
  it('spawns a character at the door for a new agent', () => {
    const [spawned] = reconcile([], [agent()]);
    expect(spawned).toMatchObject({ id: 'a1', x: DOOR.x, y: DOOR.y, state: 'entering' });
  });

  it('keeps position and state for an agent that is still present', () => {
    const existing = character({ x: 100, y: 50, state: 'walking' });
    const [next] = reconcile([existing], [agent({ action: 'Editing x.ts' })]);
    expect(next).toMatchObject({ x: 100, y: 50, state: 'walking' });
    expect(next.agent.action).toBe('Editing x.ts');
  });

  it('routes a character to the door when its agent disappears', () => {
    const inside = character({ ...walkableTiles()[0] });
    const [next] = reconcile([inside], []);
    expect(next.state).toBe('leaving');
    expect(next.path[next.path.length - 1]).toEqual(DOOR);
  });

  it('keeps a leaving character until it reaches the door, then removes it', () => {
    const leaving = reconcile([character({ ...walkableTiles()[0] })], []);
    expect(reconcile(leaving, [])).toHaveLength(1);
    const arrived = runUntil(leaving[0], (c) => c.path.length === 0);
    expect(reconcile([arrived], [])).toHaveLength(0);
  });

  it('turns a leaving character around when its agent comes back', () => {
    const leaving = character({ state: 'leaving', x: DOOR.x, y: DOOR.y });
    const [next] = reconcile([leaving], [agent()]);
    expect(next.state).toBe('walking');
    expect(next.path).toEqual([]);
  });

  it('does not mutate the cast it is given', () => {
    const cast = reconcile([], [agent()]);
    const before = JSON.stringify(cast);
    reconcile(cast, []);
    expect(JSON.stringify(cast)).toBe(before);
  });
});

describe('movement', () => {
  it('moves a character along its path and faces the way it walks', () => {
    const start = character({ x: DOOR.x, y: DOOR.y, path: [{ x: DOOR.x, y: DOOR.y - TILE_SIZE }] });
    const moved = step(start, 100);
    expect(moved.y).toBeLessThan(DOOR.y);
    expect(moved.facing).toBe('up');
  });

  it('never overshoots the last waypoint and consumes it on arrival', () => {
    const target = { x: DOOR.x + TILE_SIZE, y: DOOR.y };
    const moved = step(character({ path: [target] }), 60_000);
    expect(moved).toMatchObject(target);
    expect(moved.path).toEqual([]);
    expect(moved.facing).toBe('right');
  });

  it('picks a reachable walkable target, never inside furniture', () => {
    for (const r of [0, 0.25, 0.5, 0.75, 0.999]) {
      const picked = pickTarget(character(), () => r);
      const goal = picked.path[picked.path.length - 1];
      expect(isWalkable(goal.x, goal.y)).toBe(true);
      expect(picked.state).toBe('walking');
    }
  });

  it('goes idle when the picked target is the tile it stands on', () => {
    const tiles = walkableTiles();
    const index = tiles.findIndex((t) => t.x === DOOR.x && t.y === DOOR.y);
    expect(pickTarget(character(), () => index / tiles.length).state).toBe('idle');
  });

  it('is deterministic for a given random source', () => {
    expect(pickTarget(character(), () => 0.5)).toEqual(pickTarget(character(), () => 0.5));
  });

  it('rests on arrival before wandering on', () => {
    const arriving = character({ state: 'walking', path: [] });
    const resting = advance(arriving, { now: 1000, deltaMs: 16, random: () => 0.5 });
    expect(resting).toMatchObject({ state: 'idle', restUntil: 1000 + REST_MS });
    expect(advance(resting, { now: 1000 + REST_MS - 1, deltaMs: 16, random: () => 0.5 }).state).toBe('idle');
    expect(advance(resting, { now: 1000 + REST_MS, deltaMs: 16, random: () => 0.5 }).state).toBe('walking');
  });

  it('starts wandering straight after entering', () => {
    const entered = advance(character(), { now: 0, deltaMs: 16, random: () => 0.5 });
    expect(advance(entered, { now: 0, deltaMs: 16, random: () => 0.5 }).state).toBe('walking');
  });

  it('keeps a leaving character leaving even after it stops', () => {
    const leaving = character({ state: 'leaving', path: [] });
    expect(advance(leaving, { now: 0, deltaMs: 16, random: () => 0.5 }).state).toBe('leaving');
  });
});

describe('tileFrames', () => {
  function framesAt(kind: string): ReturnType<typeof tileFrames>[] {
    return OFFICE_MAP.flatMap((row, ty) =>
      Array.from(row).flatMap((tile, tx) => (tile === kind ? [tileFrames(tx, ty)] : [])),
    );
  }

  it('paints every cell with frames inside the tileset', () => {
    for (let ty = 0; ty < MAP_TILES_Y; ty++) {
      for (let tx = 0; tx < MAP_TILES_X; tx++) {
        const { floor, overlay } = tileFrames(tx, ty);
        expect(floor).toBeLessThan(TILESET_FRAMES);
        expect(overlay ?? 0).toBeLessThan(TILESET_FRAMES);
      }
    }
  });

  it('joins a desk run into left end, middle and right end', () => {
    const row = OFFICE_MAP.findIndex((r) => r.includes('DDDD'));
    const x = OFFICE_MAP[row].indexOf('DDDD');
    expect([0, 1, 2, 3].map((i) => tileFrames(x + i, row).overlay)).toEqual([
      FRAME.deskLeft,
      FRAME.deskMid,
      FRAME.deskMid,
      FRAME.deskRight,
    ]);
  });

  it('shows a wall face above floor and a wall top elsewhere', () => {
    expect(tileFrames(5, 0).overlay).toBe(FRAME.wallFace);
    expect(tileFrames(0, 5).overlay).toBe(FRAME.wallTop);
  });

  it('lays rug under rug cells and plain floor under everything else', () => {
    expect(framesAt(',').every((f) => f.floor === FRAME.rug && f.overlay === undefined)).toBe(true);
    expect(framesAt('.').every((f) => f.overlay === undefined && f.floor !== FRAME.rug)).toBe(true);
    expect(framesAt('_').every((f) => f.overlay === FRAME.door)).toBe(true);
  });
});
