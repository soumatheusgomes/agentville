import { describe, it, expect } from 'vitest';
import { RecentEntryStore, MAX_ENTRIES, MAX_ENTRY_CHARS, MAX_AGENTS } from '../recentEntries';
import type { FeedEntry } from '../officeTypes';

function entry(text: string, at = 1): FeedEntry {
  return { role: 'assistant', text, at };
}

describe('RecentEntryStore', () => {
  it('returns an empty array for an unknown agent', () => {
    expect(new RecentEntryStore().get('nope')).toEqual([]);
  });

  it('keeps entries oldest first', () => {
    const store = new RecentEntryStore();
    store.push('a', entry('first', 1));
    store.push('a', entry('second', 2));
    expect(store.get('a').map((e) => e.text)).toEqual(['first', 'second']);
  });

  it(`evicts the oldest beyond ${MAX_ENTRIES} entries`, () => {
    const store = new RecentEntryStore();
    for (let i = 0; i < MAX_ENTRIES + 5; i++) {
      store.push('a', entry(`e${i}`, i));
    }
    const texts = store.get('a').map((e) => e.text);
    expect(texts).toHaveLength(MAX_ENTRIES);
    expect(texts[0]).toBe('e5');
    expect(texts[texts.length - 1]).toBe(`e${MAX_ENTRIES + 4}`);
  });

  it(`truncates text longer than ${MAX_ENTRY_CHARS} characters and marks it`, () => {
    const store = new RecentEntryStore();
    store.push('a', entry('x'.repeat(MAX_ENTRY_CHARS + 100)));
    const [stored] = store.get('a');
    expect(stored.text).toHaveLength(MAX_ENTRY_CHARS + 1);
    expect(stored.text.endsWith('…')).toBe(true);
  });

  it('leaves text at exactly the limit untouched', () => {
    const store = new RecentEntryStore();
    store.push('a', entry('x'.repeat(MAX_ENTRY_CHARS)));
    expect(store.get('a')[0].text.endsWith('…')).toBe(false);
  });

  it('drops buffers for agents not in the retain list', () => {
    const store = new RecentEntryStore();
    store.push('a', entry('keep'));
    store.push('b', entry('drop'));
    store.retain(['a']);
    expect(store.get('a')).toHaveLength(1);
    expect(store.get('b')).toEqual([]);
  });

  it(`tracks at most ${MAX_AGENTS} agents, evicting the least recently written`, () => {
    const store = new RecentEntryStore();
    for (let i = 0; i < MAX_AGENTS + 3; i++) {
      store.push(`agent-${i}`, entry('x', i));
    }
    expect(store.get('agent-0')).toEqual([]);
    expect(store.get('agent-2')).toEqual([]);
    expect(store.get(`agent-${MAX_AGENTS + 2}`)).toHaveLength(1);
  });

  it("does not mutate the caller's entry object", () => {
    const store = new RecentEntryStore();
    const original = entry('y'.repeat(MAX_ENTRY_CHARS + 10));
    store.push('a', original);
    expect(original.text).toHaveLength(MAX_ENTRY_CHARS + 10);
  });
});
