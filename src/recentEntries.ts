// Bounded, in-memory activity buffer feeding the office side panel. Deliberately a sliding
// window rather than the whole transcript: transcripts reach tens of MB, and the panel
// answers "what is it doing now" — full history is already served by "Open Log File".

import type { FeedEntry } from './officeTypes';

export const MAX_ENTRIES = 20;
export const MAX_ENTRY_CHARS = 2000;
export const MAX_AGENTS = 50;

function truncate(text: string): string {
  return text.length > MAX_ENTRY_CHARS ? `${text.slice(0, MAX_ENTRY_CHARS)}…` : text;
}

export class RecentEntryStore {
  // Map preserves insertion order, and re-inserting on write makes the first key the
  // least-recently-written agent — which is what the MAX_AGENTS eviction drops.
  private readonly buffers = new Map<string, FeedEntry[]>();

  push(agentId: string, entry: FeedEntry): void {
    const existing = this.buffers.get(agentId) ?? [];
    this.buffers.delete(agentId);

    const next = [...existing, { ...entry, text: truncate(entry.text) }];
    this.buffers.set(agentId, next.length > MAX_ENTRIES ? next.slice(next.length - MAX_ENTRIES) : next);

    if (this.buffers.size > MAX_AGENTS) {
      const oldest = this.buffers.keys().next();
      if (!oldest.done) {
        this.buffers.delete(oldest.value);
      }
    }
  }

  get(agentId: string): FeedEntry[] {
    return this.buffers.get(agentId) ?? [];
  }

  /** Drop buffers for agents that are no longer in the snapshot. */
  retain(agentIds: readonly string[]): void {
    const keep = new Set(agentIds);
    for (const id of [...this.buffers.keys()]) {
      if (!keep.has(id)) {
        this.buffers.delete(id);
      }
    }
  }
}
