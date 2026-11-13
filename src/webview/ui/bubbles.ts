// Speech bubbles are DOM, not canvas text: they inherit the VS Code theme, the text can be
// selected, and click handling is native. They float above each working character's head
// and are repositioned every frame from the renderer's reported screen coordinates.

import type { RenderedPosition } from '../render/officeScene';
import { OverlayLayer, truncate } from './overlayLayer';

const MAX_BUBBLE_CHARS = 40;
const GAP_PX = 2;

export class BubbleLayer {
  private readonly layer: OverlayLayer<HTMLButtonElement>;

  constructor(root: HTMLElement, onClick: (agentId: string) => void) {
    this.layer = new OverlayLayer(root, (id) => {
      const node = document.createElement('button');
      node.className = 'bubble';
      node.addEventListener('click', () => {
        onClick(id);
      });
      return node;
    });
  }

  render(positions: readonly RenderedPosition[]): void {
    const speaking = positions.filter((p): p is RenderedPosition & { action: string } => Boolean(p.action));
    this.layer.prune(new Set(speaking.map((p) => p.id)));
    for (const position of speaking) {
      this.layer.place(
        position.id,
        truncate(position.action, MAX_BUBBLE_CHARS),
        `translate(${position.screenX}px, ${position.headY - GAP_PX}px) translate(-50%, -100%)`,
      );
    }
  }
}
