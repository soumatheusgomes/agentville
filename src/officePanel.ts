// The office webview: a single editor-tab panel that mirrors the provider's session state
// into a 2D world. It creates no scanner, watcher or timer of its own — everything is
// driven by the provider's existing refresh cycle, so a closed office costs nothing.

import * as vscode from 'vscode';
import { randomBytes } from 'crypto';
import { buildSnapshot } from './officeSnapshot';
import { RecentEntryStore } from './recentEntries';
import { SubagentTranscriptReader, subagentTranscriptPath } from './subagentTranscriptReader';
import { logDebug } from './logger';
import { officeHtml } from './officeHtml';
import type { SessionTreeDataProvider } from './sessionTreeDataProvider';
import type { ToExtension, ToWebview } from './officeTypes';
import type { Session } from './types';

export class OfficePanel {
  private static current: OfficePanel | undefined;

  private readonly disposables: vscode.Disposable[] = [];
  private readonly entries = new RecentEntryStore();
  private readonly reader = new SubagentTranscriptReader();
  private actions = new Map<string, string>();
  private openFeedAgentId: string | undefined;
  private webviewReady = false;

  static show(context: vscode.ExtensionContext, provider: SessionTreeDataProvider): void {
    if (OfficePanel.current) {
      OfficePanel.current.panel.reveal(vscode.ViewColumn.Active);
      return;
    }
    const panel = vscode.window.createWebviewPanel('agentville.office', 'AgentVille', vscode.ViewColumn.Active, {
      enableScripts: true,
      // Torn down when backgrounded: a hidden office does no rendering at all. The
      // webview re-sends `ready` when it comes back and receives a fresh snapshot.
      retainContextWhenHidden: false,
      localResourceRoots: [
        vscode.Uri.joinPath(context.extensionUri, 'dist'),
        vscode.Uri.joinPath(context.extensionUri, 'resources', 'office'),
      ],
    });
    OfficePanel.current = new OfficePanel(panel, context.extensionUri, provider);
  }

  private constructor(
    private readonly panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    private readonly provider: SessionTreeDataProvider,
  ) {
    const webview = panel.webview;
    webview.html = officeHtml({
      cspSource: webview.cspSource,
      scriptUri: webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'dist', 'webview.js')).toString(),
      assetsUri: webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'resources', 'office')).toString(),
      nonce: randomBytes(16).toString('base64'),
    });

    this.disposables.push(
      panel.onDidDispose(() => {
        this.dispose();
      }),
      webview.onDidReceiveMessage((message: ToExtension) => {
        this.onMessage(message);
      }),
      provider.onDidChangeTreeData(() => {
        this.push();
      }),
    );
  }

  private onMessage(message: ToExtension): void {
    switch (message.type) {
      case 'ready':
        this.webviewReady = true;
        this.push();
        return;
      case 'openFeed':
        this.openFeedAgentId = message.agentId;
        this.pushFeed();
        return;
      case 'closeFeed':
        this.openFeedAgentId = undefined;
        return;
      case 'openLog':
        void vscode.commands.executeCommand('agentville.openSessionLog', this.itemFor(message.agentId));
        return;
      case 'openProject':
        void vscode.commands.executeCommand('agentville.openProject', this.itemFor(message.agentId));
        return;
    }
  }

  /** The session that owns an agent (itself, or the launcher of a subagent), shaped like a tree item. */
  private itemFor(agentId: string): { session: Session } | undefined {
    const session = this.provider
      .getSessions()
      .find((s) => s.id === agentId || s.subagents.some((sub) => sub.id === agentId));
    return session ? { session } : undefined;
  }

  private post(message: ToWebview): void {
    void this.panel.webview.postMessage(message);
  }

  /** Refresh actions from live transcripts, then post a full snapshot. */
  private push(): void {
    if (!this.webviewReady) {
      return;
    }
    if (!this.provider.isMonitoringEnabled()) {
      this.post({ type: 'monitoringDisabled' });
      return;
    }
    try {
      const sessions = this.provider.getSessions();
      this.refreshActions(sessions);
      const { agents, truncated } = buildSnapshot(sessions, this.actions);
      const present = agents.map((a) => a.id);
      this.entries.retain(present);
      this.actions = new Map([...this.actions].filter(([id]) => present.includes(id)));
      this.post({ type: 'snapshot', agents, truncated });
      this.pushFeed();
    } catch (error) {
      logDebug(`OfficePanel.push failed: ${String(error)}`);
    }
  }

  private refreshActions(sessions: readonly Session[]): void {
    for (const session of sessions) {
      // Only working agents: a finished one cannot produce a new action, and reading
      // every completed transcript would multiply I/O by the session's whole history.
      if (session.status === 'working') {
        this.absorb(session.id, session.logFilePath);
      }
      for (const subagent of session.subagents) {
        if (subagent.status === 'working') {
          const agentId = subagent.agentId ?? subagent.id;
          this.absorb(subagent.id, subagentTranscriptPath(session.logFilePath, agentId));
        }
      }
    }
  }

  private absorb(agentId: string, transcriptPath: string): void {
    const result = this.reader.read(transcriptPath);
    if (result.action) {
      this.actions.set(agentId, result.action);
    }
    for (const entry of result.entries) {
      this.entries.push(agentId, entry);
    }
  }

  private pushFeed(): void {
    const agentId = this.openFeedAgentId;
    if (agentId) {
      this.post({ type: 'feed', agentId, entries: this.entries.get(agentId) });
    }
  }

  private dispose(): void {
    OfficePanel.current = undefined;
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
  }
}
