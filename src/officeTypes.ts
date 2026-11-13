// Wire format between the extension and the office webview. Shared by both bundles, so it
// must stay dependency-free — no `vscode`, no Phaser, no DOM.

export interface AgentView {
  id: string;
  kind: 'session' | 'subagent';
  parentId?: string;
  name: string;
  model?: string;
  projectName: string;
  brand: 'claude-code' | 'antigravity';
  status: 'working' | 'stopped';
  action?: string; // absent when stopped
  lastActivityAt: number;
}

export interface FeedEntry {
  role: 'assistant' | 'user';
  text: string; // truncated to MAX_ENTRY_CHARS
  tool?: string;
  at: number;
}

export type ToWebview =
  | { type: 'snapshot'; agents: AgentView[]; truncated: number }
  | { type: 'feed'; agentId: string; entries: FeedEntry[] }
  | { type: 'monitoringDisabled' };

export type ToExtension =
  | { type: 'ready' }
  | { type: 'openFeed'; agentId: string }
  | { type: 'closeFeed' }
  | { type: 'openLog'; agentId: string }
  | { type: 'openProject'; agentId: string };
