// Phaser draws; it does not decide. Every position and state transition comes from
// `simulation/`, which is unit-tested without a browser. This file owns only textures,
// sprites, animations and the frame loop.

import Phaser from 'phaser';
import type { AgentView } from '../../officeTypes';
import { reconcile, type Character, type Facing } from '../simulation/population';
import { advance } from '../simulation/movement';
import { MAP_TILES_X, MAP_TILES_Y, TILE_SIZE, WORLD_HEIGHT, WORLD_WIDTH } from '../simulation/world';
import { tileFrames } from '../simulation/tiles';

const CHARACTER_FRAME = { frameWidth: 16, frameHeight: 24 };
const CHARACTER_SETS = 8;
const DIRECTIONS: readonly Facing[] = ['down', 'left', 'right', 'up'];
const FRAMES_PER_DIRECTION = 4;
const FRAMES_PER_SET = DIRECTIONS.length * FRAMES_PER_DIRECTION;
// Sprites stand on their feet: drawn bottom-centre, a little below the tile centre.
const FEET_OFFSET_Y = 6;
// A hidden-then-shown tab reports one huge delta; clamp so nobody teleports.
const MAX_DELTA_MS = 100;
const ANTIGRAVITY_TINT = 0xc8d8ff;

export interface RenderedPosition {
  id: string;
  name: string;
  screenX: number; // overlay-root pixels, horizontally centred on the character
  headY: number; // overlay-root pixels, top of the sprite
  feetY: number; // overlay-root pixels, bottom of the sprite
  action?: string; // only for working agents
}

function walkKey(set: number, facing: Facing): string {
  return `walk-${set}-${facing}`;
}

function standingFrame(set: number, facing: Facing): number {
  return set * FRAMES_PER_SET + DIRECTIONS.indexOf(facing) * FRAMES_PER_DIRECTION;
}

export class OfficeScene extends Phaser.Scene {
  private cast: Character[] = [];
  private agents: AgentView[] = [];
  private readonly sprites = new Map<string, Phaser.GameObjects.Sprite>();
  private positionListener?: (positions: RenderedPosition[]) => void;
  private clickListener?: (agentId: string) => void;

  constructor(
    private readonly assetsBaseUri: string,
    private readonly overlayRoot: HTMLElement,
  ) {
    super('office');
  }

  preload(): void {
    this.load.spritesheet('tiles', `${this.assetsBaseUri}/tiles.png`, {
      frameWidth: TILE_SIZE,
      frameHeight: TILE_SIZE,
    });
    this.load.spritesheet('characters', `${this.assetsBaseUri}/characters.png`, CHARACTER_FRAME);
  }

  create(): void {
    this.drawMap();
    this.createAnimations();
  }

  /**
   * Paints the authored office once. Static: the map never changes at runtime, so only
   * characters move. Furniture depth is its tile's bottom edge, the same Y-sort characters
   * use, so a character standing below a chair or wall draws in front of it.
   */
  private drawMap(): void {
    for (let ty = 0; ty < MAP_TILES_Y; ty++) {
      for (let tx = 0; tx < MAP_TILES_X; tx++) {
        const { floor, overlay } = tileFrames(tx, ty);
        const x = tx * TILE_SIZE;
        const y = ty * TILE_SIZE;
        this.add.image(x, y, 'tiles', floor).setOrigin(0, 0).setDepth(-1);
        if (overlay !== undefined) {
          this.add
            .image(x, y, 'tiles', overlay)
            .setOrigin(0, 0)
            .setDepth(y + TILE_SIZE);
        }
      }
    }
  }

  private createAnimations(): void {
    for (let set = 0; set < CHARACTER_SETS; set++) {
      for (const facing of DIRECTIONS) {
        const start = standingFrame(set, facing);
        this.anims.create({
          key: walkKey(set, facing),
          frames: this.anims.generateFrameNumbers('characters', { start, end: start + FRAMES_PER_DIRECTION - 1 }),
          frameRate: 8,
          repeat: -1,
        });
      }
    }
  }

  setAgents(agents: readonly AgentView[]): void {
    this.agents = [...agents];
  }

  onCharacterPositions(callback: (positions: RenderedPosition[]) => void): void {
    this.positionListener = callback;
  }

  onCharacterClick(callback: (agentId: string) => void): void {
    this.clickListener = callback;
  }

  update(time: number, delta: number): void {
    const tick = { now: time, deltaMs: Math.min(delta, MAX_DELTA_MS), random: Math.random };
    this.cast = reconcile(this.cast, this.agents).map((character) => advance(character, tick));
    this.syncSprites();
    this.emitPositions();
  }

  private spriteFor(character: Character): Phaser.GameObjects.Sprite {
    const existing = this.sprites.get(character.id);
    if (existing) {
      return existing;
    }
    const sprite = this.add.sprite(character.x, character.y, 'characters', standingFrame(character.sprite, 'up'));
    sprite.setOrigin(0.5, 1).setInteractive({ useHandCursor: true });
    sprite.on('pointerdown', () => this.clickListener?.(character.id));
    this.sprites.set(character.id, sprite);
    return sprite;
  }

  private syncSprites(): void {
    const alive = new Set(this.cast.map((c) => c.id));
    for (const [id, sprite] of this.sprites) {
      if (!alive.has(id)) {
        sprite.destroy();
        this.sprites.delete(id);
      }
    }
    for (const character of this.cast) {
      const sprite = this.spriteFor(character);
      sprite.setPosition(character.x, character.y + FEET_OFFSET_Y).setDepth(character.y + FEET_OFFSET_Y);
      if (character.path.length > 0) {
        sprite.play(walkKey(character.sprite, character.facing), true);
      } else {
        sprite.stop().setFrame(standingFrame(character.sprite, character.facing));
      }
      // A subagent is drawn slightly smaller than the session that launched it.
      sprite.setScale(character.agent.kind === 'subagent' ? 0.85 : 1);
      sprite.setAlpha(character.agent.status === 'working' ? 1 : 0.55);
      if (character.agent.brand === 'antigravity') {
        sprite.setTint(ANTIGRAVITY_TINT);
      } else {
        sprite.clearTint();
      }
    }
  }

  /**
   * World → overlay-root coordinates. FIT scaling resizes and centres the canvas with CSS,
   * so the canvas's on-page box — not the camera — is what maps the world onto the DOM.
   */
  private emitPositions(): void {
    if (!this.positionListener) {
      return;
    }
    const canvas = this.game.canvas.getBoundingClientRect();
    const root = this.overlayRoot.getBoundingClientRect();
    const scale = canvas.width / WORLD_WIDTH;
    const headY = CHARACTER_FRAME.frameHeight - FEET_OFFSET_Y;
    this.positionListener(
      this.cast.map((character) => ({
        id: character.id,
        name: character.agent.name,
        screenX: canvas.left - root.left + character.x * scale,
        headY: canvas.top - root.top + (character.y - headY) * scale,
        feetY: canvas.top - root.top + (character.y + FEET_OFFSET_Y) * scale,
        action: character.agent.status === 'working' ? character.agent.action : undefined,
      })),
    );
  }
}

export function createOffice(parent: HTMLElement, assetsBaseUri: string): OfficeScene {
  const scene = new OfficeScene(assetsBaseUri, parent);
  new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: WORLD_WIDTH,
    height: WORLD_HEIGHT,
    pixelArt: true,
    banner: false,
    backgroundColor: '#1e1e1e',
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    scene,
  });
  return scene;
}
