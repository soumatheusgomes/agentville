// Which tiles.png frame paints each map cell. Pure, so the autotiling is unit-tested.
// The frame layout here IS the asset contract documented in resources/ASSETS.md — a
// premium tileset must use the same indices.

import { tileAt } from './world';

export const TILESET_COLUMNS = 8;

export const FRAME = {
  floorA: 0,
  floorB: 1,
  rug: 2,
  wallTop: 3,
  wallFace: 4,
  door: 5,
  deskLeft: 6,
  deskMid: 7,
  deskRight: 8,
  chair: 9,
  tableLeft: 10,
  tableMid: 11,
  tableRight: 12,
  plant: 13,
  sofaLeft: 14,
  sofaMid: 15,
  sofaRight: 16,
  counterLeft: 17,
  counterMid: 18, // the coffee machine
  counterRight: 19,
  shelfA: 20,
  shelfB: 21,
} as const;

export const TILESET_FRAMES = Object.keys(FRAME).length;

/** Furniture drawn as joined runs: [left end, middle, right end]. A lone tile uses the middle. */
const SEGMENTED: Record<string, readonly [number, number, number]> = {
  D: [FRAME.deskLeft, FRAME.deskMid, FRAME.deskRight],
  T: [FRAME.tableLeft, FRAME.tableMid, FRAME.tableRight],
  S: [FRAME.sofaLeft, FRAME.sofaMid, FRAME.sofaRight],
  K: [FRAME.counterLeft, FRAME.counterMid, FRAME.counterRight],
};

export interface TileFrames {
  floor: number;
  overlay?: number; // drawn on top of the floor
}

function segmentFrame(kind: string, tx: number, ty: number): number | undefined {
  if (!Object.prototype.hasOwnProperty.call(SEGMENTED, kind)) {
    return undefined;
  }
  const [left, mid, right] = SEGMENTED[kind];
  const joinsLeft = tileAt(tx - 1, ty) === kind;
  const joinsRight = tileAt(tx + 1, ty) === kind;
  if (joinsLeft === joinsRight) {
    return mid;
  }
  return joinsRight ? left : right;
}

/** A wall shows its face when floor lies below it (the 3/4 view), else its top. */
function wallFrame(tx: number, ty: number): number {
  return tileAt(tx, ty + 1) === '#' ? FRAME.wallTop : FRAME.wallFace;
}

function overlayFrame(kind: string, tx: number, ty: number): number | undefined {
  switch (kind) {
    case '#':
      return wallFrame(tx, ty);
    case '_':
      return FRAME.door;
    case 'C':
      return FRAME.chair;
    case 'P':
      return FRAME.plant;
    case 'R':
      return tx % 2 === 0 ? FRAME.shelfA : FRAME.shelfB;
    default:
      return segmentFrame(kind, tx, ty);
  }
}

export function tileFrames(tx: number, ty: number): TileFrames {
  const kind = tileAt(tx, ty);
  // A subtle checkerboard keeps a large floor from reading as one flat colour.
  const floor = kind === ',' ? FRAME.rug : (tx + ty) % 2 === 0 ? FRAME.floorA : FRAME.floorB;
  return { floor, overlay: overlayFrame(kind, tx, ty) };
}
