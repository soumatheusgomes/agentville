// Flattens the session tree into the flat cast of characters the office renders.
// Ordering and the visible cap live here (pure) rather than in the webview, so both are
// unit-tested and deterministic — the office must never reshuffle between refreshes.

import type { AgentView } from './officeTypes';
import type { Session, SubAgent } from './types';

export const MAX_VISIBLE_AGENTS = 24;

function subagentViews(session: Session, subagent: SubAgent, parentId: string): AgentView[] {
  const self: AgentView = {
    id: subagent.id,
    kind: 'subagent',
    parentId,
    name: subagent.name,
    model: subagent.model ?? session.model,
    projectName: session.projectName,
    brand: session.type,
    status: subagent.status,
    lastActivityAt: session.lastInteractionTime,
  };
  // Grandchildren are parented to their own launcher, not to the session — nesting is
  // truncated at one level upstream, so this recursion is at most two deep.
  const children = (subagent.children ?? []).flatMap((child) => subagentViews(session, child, subagent.id));
  return [self, ...children];
}

function sessionViews(session: Session): AgentView[] {
  const self: AgentView = {
    id: session.id,
    kind: 'session',
    name: session.sessionTitle ?? session.projectName,
    model: session.model,
    projectName: session.projectName,
    brand: session.type,
    status: session.status,
    lastActivityAt: session.lastInteractionTime,
  };
  return [self, ...session.subagents.flatMap((sub) => subagentViews(session, sub, session.id))];
}

/** Working first, then most recently active — stable, so the cast never oscillates. */
function byRelevance(a: AgentView, b: AgentView): number {
  if (a.status !== b.status) {
    return a.status === 'working' ? -1 : 1;
  }
  return b.lastActivityAt - a.lastActivityAt;
}

export function buildSnapshot(
  sessions: readonly Session[],
  actions: ReadonlyMap<string, string>,
): { agents: AgentView[]; truncated: number } {
  const all = sessions
    .flatMap(sessionViews)
    .map((agent) => (agent.status === 'working' ? { ...agent, action: actions.get(agent.id) } : agent))
    .sort(byRelevance);

  return {
    agents: all.slice(0, MAX_VISIBLE_AGENTS),
    truncated: Math.max(0, all.length - MAX_VISIBLE_AGENTS),
  };
}
