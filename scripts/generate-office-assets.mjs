// Generates the office's baseline pixel art: resources/office/tiles.png and
// resources/office/characters.png. The art is original to this repository and dedicated
// to the public domain (CC0 1.0) — see resources/ASSETS.md — so the public repo and the
// packaged .vsix carry no third-party asset licence at all.
//
// Dependency-free on purpose (a tiny PNG encoder over node:zlib), so regenerating the art
// never adds a package. The frame layout written here is the contract in
// src/webview/simulation/tiles.ts (FRAME) and src/webview/render/officeScene.ts.
//
//   node scripts/generate-office-assets.mjs

import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'resources', 'office');

// ── PNG encoding ────────────────────────────────────────────────────────────────────────

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(bytes) {
  let c = 0xffffffff;
  for (const byte of bytes) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

function encodePng({ width, height, pixels }) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 6, 0, 0, 0], 8); // 8-bit RGBA, no interlace
  const rows = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    pixels.copy(rows, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(rows, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ── Drawing ─────────────────────────────────────────────────────────────────────────────

function createImage(width, height) {
  return { width, height, pixels: Buffer.alloc(width * height * 4) };
}

/** `#rrggbb` or `#rrggbbaa` → [r, g, b, a]. */
function hex(color) {
  const v = parseInt(color.slice(1, 7), 16);
  const alpha = color.length === 9 ? parseInt(color.slice(7), 16) : 255;
  return [(v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff, alpha];
}

/** Source-over blend of `color` onto the pixel at byte offset `at`. */
function blend(pixels, at, [r, g, b, a]) {
  const src = a / 255;
  const dst = (pixels[at + 3] / 255) * (1 - src);
  const out = src + dst;
  if (out === 0) return;
  pixels[at] = Math.round((r * src + pixels[at] * dst) / out);
  pixels[at + 1] = Math.round((g * src + pixels[at + 1] * dst) / out);
  pixels[at + 2] = Math.round((b * src + pixels[at + 2] * dst) / out);
  pixels[at + 3] = Math.round(out * 255);
}

/** A drawing context clipped to one frame of a sheet. */
function frame(image, ox, oy, w, h) {
  const px = (x, y, color) => {
    if (x < 0 || y < 0 || x >= w || y >= h || !color) return;
    blend(image.pixels, ((oy + y) * image.width + ox + x) * 4, hex(color));
  };
  const rect = (x, y, rw, rh, color) => {
    for (let j = 0; j < rh; j++) for (let i = 0; i < rw; i++) px(x + i, y + j, color);
  };
  return { px, rect };
}

// ── Tiles: 16×16, 8 per row. Order = FRAME in src/webview/simulation/tiles.ts ─────────────

const T = 16;
const WOOD = { base: '#c9a47c', seam: '#b38b62', light: '#d6b58f' };

function floor(g, offset) {
  g.rect(0, 0, T, T, WOOD.base);
  for (let y = 3; y < T; y += 4) g.rect(0, y, T, 1, WOOD.seam);
  for (let row = 0; row < 4; row++) {
    const x = (row * 5 + offset) % T;
    g.rect(x, row * 4, 1, 3, WOOD.seam);
    g.px((x + 7) % T, row * 4 + 1, WOOD.light);
  }
}

function rug(g) {
  g.rect(0, 0, T, T, '#3d7c89');
  for (let y = 1; y < T; y += 4) for (let x = (y >> 2) % 2 ? 1 : 3; x < T; x += 4) g.px(x, y, '#5aa0ad');
}

function wallTop(g) {
  g.rect(0, 0, T, T, '#3a3f4b');
  g.rect(0, 0, T, 1, '#4a5060');
}

function wallFace(g) {
  g.rect(0, 0, T, 4, '#3a3f4b');
  g.rect(0, 4, T, 10, '#e4dccd');
  g.rect(0, 4, T, 1, '#f2ece1');
  g.rect(0, 14, T, 2, '#8c7b67');
}

function door(g) {
  floor(g, 0);
  g.rect(1, 3, 14, 11, '#4b4b52');
  for (let y = 4; y < 13; y += 2) g.rect(2, y, 12, 1, '#5d5d66');
}

function deskPiece(g, part) {
  g.rect(0, 5, T, 8, '#8a5a2e');
  g.rect(0, 5, T, 1, '#a06c3a');
  g.rect(0, 13, T, 3, '#64401f');
  if (part === 'left') g.rect(0, 5, 1, 11, '#64401f');
  if (part === 'right') g.rect(T - 1, 5, 1, 11, '#64401f');
  // monitor + stand
  g.rect(3, 0, 10, 7, '#23262e');
  g.rect(4, 1, 8, 5, '#6cc0f0');
  g.rect(5, 2, 3, 1, '#b8e4ff');
  g.rect(7, 7, 2, 2, '#23262e');
  g.rect(5, 10, 6, 1, '#3c3f47'); // keyboard
}

function chair(g) {
  g.rect(3, 2, 10, 5, '#3f4552');
  g.rect(4, 3, 8, 3, '#525a6b');
  g.rect(2, 7, 12, 6, '#2f343e');
  g.rect(3, 8, 10, 4, '#444b59');
  g.rect(7, 13, 2, 2, '#23262e');
}

function tablePiece(g, part) {
  g.rect(0, 2, T, 12, '#a7743f');
  g.rect(0, 2, T, 1, '#bd8a52');
  g.rect(0, 13, T, 2, '#7a5229');
  if (part === 'left') g.rect(0, 2, 1, 13, '#7a5229');
  if (part === 'right') g.rect(T - 1, 2, 1, 13, '#7a5229');
  if (part === 'mid') g.rect(5, 6, 6, 4, '#f0ece2'); // papers
}

function plant(g) {
  for (const [x, y] of [
    [7, 1], [4, 3], [10, 3], [6, 5], [9, 6], [3, 7], [12, 7],
  ]) {
    g.rect(x - 2, y - 1, 5, 4, '#2f7d3a');
    g.rect(x - 1, y - 1, 2, 2, '#4caf50');
  }
  g.rect(4, 10, 8, 5, '#b4643a');
  g.rect(4, 10, 8, 1, '#cf7d4f');
  g.rect(5, 15, 6, 1, '#8a4a2a');
}

function sofaPiece(g, part) {
  g.rect(0, 2, T, 5, '#6b4596');
  g.rect(0, 7, T, 7, '#8259b0');
  g.rect(0, 14, T, 1, '#4e3270');
  if (part !== 'right') g.rect(T - 1, 8, 1, 5, '#6b4596');
  if (part === 'left') g.rect(0, 2, 3, 13, '#5b3a82');
  if (part === 'right') g.rect(T - 3, 2, 3, 13, '#5b3a82');
}

function counterPiece(g, part) {
  g.rect(0, 4, T, 6, '#a3a9b0');
  g.rect(0, 4, T, 1, '#c3c8ce');
  g.rect(0, 10, T, 6, '#6c727a');
  if (part === 'left') {
    g.rect(3, 2, 3, 4, '#f0ece2'); // mugs
    g.rect(8, 2, 3, 4, '#e57373');
  } else if (part === 'mid') {
    g.rect(4, 0, 8, 8, '#26282d'); // coffee machine
    g.rect(5, 1, 6, 2, '#3c3f47');
    g.px(10, 4, '#ff5252');
    g.rect(7, 6, 2, 2, '#f0ece2');
  } else {
    g.rect(5, 1, 6, 5, '#5c4033'); // bean jar
    g.rect(6, 2, 4, 3, '#7b5644');
  }
}

function shelf(g, palette) {
  g.rect(0, 0, T, T, '#6a4527');
  for (const shelfY of [1, 8]) {
    g.rect(1, shelfY, 14, 6, '#4a2f1a');
    palette.forEach((color, i) => g.rect(1 + i * 3, shelfY + (i % 2), 2, 6 - (i % 2), color));
  }
  g.rect(0, 15, T, 1, '#4a2f1a');
}

const TILE_PAINTERS = [
  (g) => floor(g, 0),
  (g) => floor(g, 9),
  rug,
  wallTop,
  wallFace,
  door,
  (g) => deskPiece(g, 'left'),
  (g) => deskPiece(g, 'mid'),
  (g) => deskPiece(g, 'right'),
  chair,
  (g) => tablePiece(g, 'left'),
  (g) => tablePiece(g, 'mid'),
  (g) => tablePiece(g, 'right'),
  plant,
  (g) => sofaPiece(g, 'left'),
  (g) => sofaPiece(g, 'mid'),
  (g) => sofaPiece(g, 'right'),
  (g) => counterPiece(g, 'left'),
  (g) => counterPiece(g, 'mid'),
  (g) => counterPiece(g, 'right'),
  (g) => shelf(g, ['#c0392b', '#2e86c1', '#f1c40f', '#27ae60', '#8e44ad']),
  (g) => shelf(g, ['#16a085', '#e67e22', '#2c3e50', '#d35400', '#7f8c8d']),
];

const TILE_COLUMNS = 8;

function drawTiles() {
  const rows = Math.ceil(TILE_PAINTERS.length / TILE_COLUMNS);
  const image = createImage(TILE_COLUMNS * T, rows * T);
  TILE_PAINTERS.forEach((paint, i) => paint(frame(image, (i % TILE_COLUMNS) * T, Math.floor(i / TILE_COLUMNS) * T, T, T)));
  return image;
}

// ── Characters: 16×24 frames; per row 4 directions × 4 walk frames ──────────────────────
// Row order: sessions 0..3, then subagents 4..7 (subagents wear a cap and a headset).
// Column order within a row: down 0-3, left 4-7, right 8-11, up 12-15.

const CW = 16;
const CH = 24;
const DIRECTIONS = ['down', 'left', 'right', 'up'];

const PEOPLE = [
  { skin: '#f1c7a5', hair: '#3b2a1e', shirt: '#2f6fb5', pants: '#2b2f3a', accent: '#c0392b' },
  { skin: '#c68863', hair: '#1c1c1c', shirt: '#2e8b57', pants: '#3a3a3a', accent: '#f1c40f' },
  { skin: '#8d5a3b', hair: '#0f0f0f', shirt: '#b5472f', pants: '#2b2f3a', accent: '#ecf0f1' },
  { skin: '#f5d5b8', hair: '#c8913e', shirt: '#7d4fb0', pants: '#33363f', accent: '#f39c12' },
  { skin: '#e8b48f', hair: '#5a3825', shirt: '#e67e22', pants: '#2d3436', accent: '#2d3436', agent: true },
  { skin: '#a8714f', hair: '#1a1a1a', shirt: '#16a085', pants: '#2d3436', accent: '#2d3436', agent: true },
  { skin: '#f0c9a8', hair: '#8e3b2a', shirt: '#d63384', pants: '#2d3436', accent: '#2d3436', agent: true },
  { skin: '#7a4b31', hair: '#222222', shirt: '#6c7a89', pants: '#2d3436', accent: '#2d3436', agent: true },
];

const OUTLINE = '#1d1f24';

function head(g, p, dir, bob) {
  const y = 2 + bob;
  g.rect(4, y, 8, 8, OUTLINE);
  g.rect(5, y + 1, 6, 6, p.skin);
  if (dir === 'up') {
    g.rect(5, y + 1, 6, 6, p.hair);
  } else {
    g.rect(5, y + 1, 6, 2, p.hair);
    if (dir === 'left') g.rect(9, y + 1, 2, 5, p.hair);
    if (dir === 'right') g.rect(5, y + 1, 2, 5, p.hair);
    const eyes = dir === 'down' ? [6, 9] : dir === 'left' ? [6] : [9];
    for (const x of eyes) g.px(x, y + 4, OUTLINE);
  }
  if (p.agent) {
    // cap with a brim facing the walking direction, plus a headset mic
    g.rect(4, y, 8, 3, p.shirt);
    const brim = { down: [5, y + 3, 6, 1], left: [2, y + 2, 3, 1], right: [11, y + 2, 3, 1], up: [5, y - 1, 6, 1] }[dir];
    g.rect(...brim, p.shirt);
    if (dir !== 'up') g.px(dir === 'right' ? 6 : 10, y + 6, '#9aa0a6');
  }
}

function body(g, p, dir, bob) {
  const y = 10 + bob;
  g.rect(3, y, 10, 8, OUTLINE);
  g.rect(4, y + 1, 8, 6, p.shirt);
  if (dir === 'down' && !p.agent) g.rect(7, y + 1, 2, 4, p.accent); // tie
  if (dir === 'down' && p.agent) g.rect(5, y + 4, 6, 2, '#00000038'); // hoodie pocket
  // arms with hands
  if (dir === 'down' || dir === 'up') {
    g.rect(3, y + 1, 1, 5, p.shirt);
    g.rect(12, y + 1, 1, 5, p.shirt);
    g.px(3, y + 6, p.skin);
    g.px(12, y + 6, p.skin);
  } else {
    g.rect(7, y + 2, 2, 4, p.shirt);
    g.px(dir === 'left' ? 7 : 8, y + 6, p.skin);
  }
}

function legs(g, p, dir, step) {
  // step: 0 stand, 1 left foot forward, 2 stand, 3 right foot forward
  const stride = step === 1 ? 1 : step === 3 ? -1 : 0;
  if (dir === 'down' || dir === 'up') {
    g.rect(5, 18, 2, 4 + Math.max(0, stride), p.pants);
    g.rect(9, 18, 2, 4 + Math.max(0, -stride), p.pants);
    g.rect(5, 21 + Math.max(0, stride), 2, 1, OUTLINE);
    g.rect(9, 21 + Math.max(0, -stride), 2, 1, OUTLINE);
    return;
  }
  const forward = dir === 'left' ? -1 : 1;
  g.rect(6 + stride * forward, 18, 2, 4, p.pants);
  g.rect(8 - stride * forward, 18, 2, 4, p.pants);
  g.rect(6 + stride * forward, 21, 2, 1, OUTLINE);
  g.rect(8 - stride * forward, 21, 2, 1, OUTLINE);
}

function shadow(g) {
  g.rect(3, 20, 10, 3, '#00000040');
  g.rect(4, 23, 8, 1, '#00000028');
}

function drawCharacters() {
  const image = createImage(CW * DIRECTIONS.length * 4, CH * PEOPLE.length);
  PEOPLE.forEach((person, row) => {
    DIRECTIONS.forEach((dir, d) => {
      for (let step = 0; step < 4; step++) {
        const g = frame(image, (d * 4 + step) * CW, row * CH, CW, CH);
        const bob = step % 2 === 1 ? 1 : 0;
        shadow(g);
        legs(g, person, dir, step);
        body(g, person, dir, bob);
        head(g, person, dir, bob);
      }
    });
  });
  return image;
}

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(join(OUT_DIR, 'tiles.png'), encodePng(drawTiles()));
writeFileSync(join(OUT_DIR, 'characters.png'), encodePng(drawCharacters()));
console.log(`Wrote tiles.png and characters.png to ${OUT_DIR}`);
