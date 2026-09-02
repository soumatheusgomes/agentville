import { describe, it, expect } from 'vitest';
import { buildSnapshot, MAX_VISIBLE_AGENTS } from '../officeSnapshot';
import type { Session, SubAgent } from '../types';

function subagent(over: Partial<SubAgent> = {}): SubAgent {
  return { id: 'sub-1', name: 'debugger', task: 'find the bug', status: 'working', ...over };
}

function session(over: Partial<Session> = {}): Session {
  return {
    id: 'sess-1',
    projectHash: 'h',
    projectPath: '/p',
    projectName: 'proj',
    gitBranch: 'main',
    status: 'working',
    lastInteractionTime: 1000,
    subagents: [],
    logFilePath: '/p/sess-1.jsonl',
    type: 'claude-code',
    ...over,
  };
}

describe('buildSnapshot', () => {
  it('maps a session to a session-kind agent', () => {
    const { agents } = buildSnapshot([session({ model: 'claude-sonnet-5' })], new Map());
    expect(agents).toHaveLength(1);
    expect(agents[0]).toMatchObject({
      id: 'sess-1',
      kind: 'session',
      projectName: 'proj',
      brand: 'claude-code',
      status: 'working',
      model: 'claude-sonnet-5',
    });
    expect(agents[0].parentId).toBeUndefined();
  });

  it('uses the session title as the name when present, else the project name', () => {
    const titled = buildSnapshot([session({ sessionTitle: 'Fix the parser' })], new Map());
    expect(titled.agents[0].name).toBe('Fix the parser');
    expect(buildSnapshot([session()], new Map()).agents[0].name).toBe('proj');
  });

  it('maps subagents to subagent-kind agents parented to the session', () => {
    const { agents } = buildSnapshot([session({ subagents: [subagent()] })], new Map());
    const sub = agents.find((a) => a.kind === 'subagent');
    expect(sub).toMatchObject({ id: 'sub-1', name: 'debugger', parentId: 'sess-1', projectName: 'proj' });
  });

  it('flattens nested grandchildren one level, parented to their own launcher', () => {
    const parent = subagent({ id: 'sub-1', children: [subagent({ id: 'sub-2', name: 'explorer' })] });
    const { agents } = buildSnapshot([session({ subagents: [parent] })], new Map());
    expect(agents.find((a) => a.id === 'sub-2')?.parentId).toBe('sub-1');
  });

  it('attaches actions by agent id and leaves unknown ids without one', () => {
    const { agents } = buildSnapshot(
      [session({ subagents: [subagent()] })],
      new Map([['sess-1', 'Editing logParser.ts']]),
    );
    expect(agents.find((a) => a.id === 'sess-1')?.action).toBe('Editing logParser.ts');
    expect(agents.find((a) => a.id === 'sub-1')?.action).toBeUndefined();
  });

  it('never attaches an action to a stopped agent', () => {
    const { agents } = buildSnapshot([session({ status: 'stopped' })], new Map([['sess-1', 'Editing x.ts']]));
    expect(agents[0].action).toBeUndefined();
  });

  it('inherits the session model when a subagent has none', () => {
    const { agents } = buildSnapshot([session({ model: 'claude-opus-5', subagents: [subagent()] })], new Map());
    expect(agents.find((a) => a.id === 'sub-1')?.model).toBe('claude-opus-5');
  });

  it('orders working agents before stopped ones, then by recency', () => {
    const sessions = [
      session({ id: 'old-idle', status: 'stopped', lastInteractionTime: 10 }),
      session({ id: 'new-idle', status: 'stopped', lastInteractionTime: 90 }),
      session({ id: 'busy', status: 'working', lastInteractionTime: 20 }),
    ];
    const { agents } = buildSnapshot(sessions, new Map());
    expect(agents.map((a) => a.id)).toEqual(['busy', 'new-idle', 'old-idle']);
  });

  it(`caps the list at ${MAX_VISIBLE_AGENTS} and reports the remainder`, () => {
    const sessions = Array.from({ length: MAX_VISIBLE_AGENTS + 7 }, (_, i) =>
      session({ id: `s-${i}`, lastInteractionTime: i }),
    );
    const { agents, truncated } = buildSnapshot(sessions, new Map());
    expect(agents).toHaveLength(MAX_VISIBLE_AGENTS);
    expect(truncated).toBe(7);
  });

  it('reports zero truncated when everything fits', () => {
    expect(buildSnapshot([session()], new Map()).truncated).toBe(0);
  });

  it('returns an empty snapshot for no sessions', () => {
    expect(buildSnapshot([], new Map())).toEqual({ agents: [], truncated: 0 });
  });
});
