// A small label under every character. Always visible, unlike the action bubble: an idle
// agent still needs to be identifiable. The tag says who; the bubble says what.

import type { RenderedPosition } from '../render/officeScene';
import { OverlayLayer, truncate } from './overlayLayer';

const MAX_NAME_CHARS = 18;
const GAP_PX = 1;

export class NameTagLayer {
  private readonly layer: OverlayLayer<HTMLDivElement>;

  constructor(root: HTMLElement) {
    this.layer = new OverlayLayer(root, () => {
      const node = document.createElement('div');
      node.className = 'name-tag';
      return node;
    });
  }

  render(positions: readonly RenderedPosition[]): void {
    this.layer.prune(new Set(positions.map((p) => p.id)));
    for (const position of positions) {
      this.layer.place(
        position.id,
        truncate(position.name, MAX_NAME_CHARS),
        `translate(${position.screenX}px, ${position.feetY + GAP_PX}px) translateX(-50%)`,
      );
    }
  }
}
