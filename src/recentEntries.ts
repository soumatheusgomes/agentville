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

/** Per-agent ring buffer of recent feed entries, capped in both entry count (`MAX_ENTRIES`)
 * and number of agents tracked (`MAX_AGENTS`). `push` never mutates the caller's entry;
 * `retain` drops buffers for agents no longer present in the latest snapshot. */
export class RecentEntryStore {
  // Map preserves insertion order, and deleting + re-setting a key on every write keeps the
  // first key in iteration order the least-recently-written agent — exactly what capacity
  // eviction below should drop.
  private readonly buffers = new Map<string, FeedEntry[]>();

  push(agentId: string, entry: FeedEntry): void {
    const bounded: FeedEntry = { ...entry, text: truncate(entry.text) };
    const existing = this.buffers.get(agentId) ?? [];
    // Negative `slice` clamps to the start of the array, so this is a no-op while `existing`
    // is still under the cap and trims from the front (oldest) once it isn't.
    const next = [...existing, bounded].slice(-MAX_ENTRIES);

    this.buffers.delete(agentId);
    this.buffers.set(agentId, next);
    this.evictLeastRecentlyWrittenOverCapacity();
  }

  /** Oldest first. */
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

  private evictLeastRecentlyWrittenOverCapacity(): void {
    if (this.buffers.size <= MAX_AGENTS) {
      return;
    }
    const oldestKey = this.buffers.keys().next().value;
    if (oldestKey !== undefined) {
      this.buffers.delete(oldestKey);
    }
  }
}
