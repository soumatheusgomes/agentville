// Shared bookkeeping for the per-character DOM overlays (name tags, bubbles): one node per
// id, created on first sight, removed when its character is gone, repositioned every frame.

export function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

export class OverlayLayer<TNode extends HTMLElement> {
  private readonly nodes = new Map<string, TNode>();

  constructor(
    private readonly root: HTMLElement,
    private readonly create: (id: string) => TNode,
  ) {}

  /** Drop nodes whose id is not in `keep`. */
  prune(keep: ReadonlySet<string>): void {
    for (const [id, node] of this.nodes) {
      if (!keep.has(id)) {
        node.remove();
        this.nodes.delete(id);
      }
    }
  }

  /** The node for `id`, created on first use; its text and position are updated in place. */
  place(id: string, text: string, transform: string): void {
    let node = this.nodes.get(id);
    if (!node) {
      node = this.create(id);
      this.root.appendChild(node);
      this.nodes.set(id, node);
    }
    if (node.textContent !== text) {
      node.textContent = text;
    }
    node.style.transform = transform;
  }
}
