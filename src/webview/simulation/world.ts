// Map geometry AND layout. Pure data and predicates — no Phaser, no DOM (enforced by
// ESLint), so the whole office plan is unit-testable.
//
// The office is authored as ASCII art: 24 rows of 40 characters, one per tile. This is
// deliberate — a furnished, zoned map is what makes the space read as an office rather
// than a floor with people on it, and the floor can be rearranged here without touching a
// line of rendering code.

export const TILE_SIZE = 16;
export const MAP_TILES_X = 40;
export const MAP_TILES_Y = 24;

export const WORLD_WIDTH = MAP_TILES_X * TILE_SIZE;
export const WORLD_HEIGHT = MAP_TILES_Y * TILE_SIZE;

export interface Point {
  x: number;
  y: number;
}

// # wall   . floor   , rug   D desk   C chair   T meeting table
// P plant  S sofa    K coffee counter  R bookshelf   _ door
export const OFFICE_MAP: readonly string[] = [
  '########################################',
  '#..........#..........#................#',
  '#.DDDD.DDDD#.DDDD.DDDD#...TTTTTTTT.....#',
  '#.CCCC.CCCC#.CCCC.CCCC#...CCCCCCCC.....#',
  '#..........#..........#...............P#',
  '#.DDDD.DDDD#.DDDD.DDDD#................#',
  '#.CCCC.CCCC#.CCCC.CCCC#..P.......P.....#',
  '#..........#..........#................#',
  '#.........................#####........#',
  '#P....................................P#',
  '#......................................#',
  '#####.############.#############.#######',
  '#..........,,,,,,,.....................#',
  '#.KKKK.....,,,,,,,.................RRRR#',
  '#..........,,,,,,,.....................#',
  '#.SSSS.....,,,,,,,.................RRRR#',
  '#..........,,,,,,,.....................#',
  '#P.....................................#',
  '#......................................#',
  '#........P..................P..........#',
  '#.....................................P#',
  '#......................................#',
  '#..................__.................P#',
  '########################################',
];

const WALKABLE = new Set(['.', ',', '_']);

export type TileKind = string;

export function tileAt(tx: number, ty: number): TileKind {
  return OFFICE_MAP[ty]?.[tx] ?? '#';
}

export function isWalkableTile(tx: number, ty: number): boolean {
  return WALKABLE.has(tileAt(tx, ty));
}

/** World-pixel coordinates → can a character stand here? Furniture is solid. */
export function isWalkable(x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= WORLD_WIDTH || y >= WORLD_HEIGHT) {
    return false;
  }
  return isWalkableTile(Math.floor(x / TILE_SIZE), Math.floor(y / TILE_SIZE));
}

function tileCentre(tx: number, ty: number): Point {
  return { x: tx * TILE_SIZE + TILE_SIZE / 2, y: ty * TILE_SIZE + TILE_SIZE / 2 };
}

/** Every standable tile, as world-pixel centres. Computed once — the map never changes. */
const WALKABLE_TILES: readonly Point[] = OFFICE_MAP.flatMap((row, ty) =>
  Array.from(row, (tile, tx) => (WALKABLE.has(tile) ? tileCentre(tx, ty) : undefined)).filter(
    (tile): tile is Point => tile !== undefined,
  ),
);

export function walkableTiles(): readonly Point[] {
  return WALKABLE_TILES;
}

/** Where characters enter and leave — the first '_' door tile on the bottom row. */
const DOOR_ROW = OFFICE_MAP.findIndex((row) => row.includes('_'));
export const DOOR: Point = tileCentre(OFFICE_MAP[DOOR_ROW].indexOf('_'), DOOR_ROW);

/** Lower on screen draws in front. */
export function byDepth(a: { y: number }, b: { y: number }): number {
  return a.y - b.y;
}

const NEIGHBOURS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

function tileKey(tx: number, ty: number): number {
  return ty * MAP_TILES_X + tx;
}

/** Walk the BFS parent links back from `goal`, returning tile centres start-exclusive. */
function unwind(parents: Map<number, number>, goal: number): Point[] {
  const path: Point[] = [];
  for (let key: number | undefined = goal; key !== undefined && key !== -1; key = parents.get(key)) {
    path.push(tileCentre(key % MAP_TILES_X, Math.floor(key / MAP_TILES_X)));
  }
  path.pop(); // the start tile — the character is already on it
  return path.reverse();
}

/**
 * Shortest walkable route between two world points, as tile-centre waypoints ending at
 * `to`'s tile. 4-connected BFS: the map is 960 tiles, so this is microseconds. Empty when
 * either end is solid or unreachable — the caller then stays put.
 */
export function findPath(from: Point, to: Point): Point[] {
  const start = { tx: Math.floor(from.x / TILE_SIZE), ty: Math.floor(from.y / TILE_SIZE) };
  const goal = tileKey(Math.floor(to.x / TILE_SIZE), Math.floor(to.y / TILE_SIZE));
  if (!isWalkableTile(start.tx, start.ty) || !isWalkable(to.x, to.y)) {
    return [];
  }
  const parents = new Map<number, number>([[tileKey(start.tx, start.ty), -1]]);
  const queue = [tileKey(start.tx, start.ty)];
  for (let head = 0; head < queue.length && !parents.has(goal); head++) {
    const key = queue[head];
    const tx = key % MAP_TILES_X;
    const ty = Math.floor(key / MAP_TILES_X);
    for (const [dx, dy] of NEIGHBOURS) {
      const next = tileKey(tx + dx, ty + dy);
      if (isWalkableTile(tx + dx, ty + dy) && !parents.has(next)) {
        parents.set(next, key);
        queue.push(next);
      }
    }
  }
  return parents.has(goal) ? unwind(parents, goal) : [];
}
