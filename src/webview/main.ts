// Wires the layers together: messages from the extension feed the renderer, the renderer
// reports screen positions to the overlays, and clicks on a bubble or a character ask the
// extension for that agent's feed.

import { createOffice } from './render/officeScene';
import { BubbleLayer } from './ui/bubbles';
import { NameTagLayer } from './ui/nameTags';
import { FeedPanel } from './ui/feedPanel';
import type { AgentView, ToExtension, ToWebview } from '../officeTypes';

declare function acquireVsCodeApi(): { postMessage(message: ToExtension): void };

const vscode = acquireVsCodeApi();
const root = document.getElementById('office');
if (!root) {
  throw new Error('office root element missing');
}

let agents: AgentView[] = [];

const feed = new FeedPanel(root, {
  onClose: () => {
    vscode.postMessage({ type: 'closeFeed' });
  },
  onOpenLog: (agentId) => {
    vscode.postMessage({ type: 'openLog', agentId });
  },
  onOpenProject: (agentId) => {
    vscode.postMessage({ type: 'openProject', agentId });
  },
});

function openFeed(agentId: string): void {
  const agent = agents.find((a) => a.id === agentId);
  feed.open(agentId, agent?.name ?? agentId);
  vscode.postMessage({ type: 'openFeed', agentId });
}

const nameTags = new NameTagLayer(root);
const bubbles = new BubbleLayer(root, openFeed);

const scene = createOffice(root, root.dataset.assets ?? '');
scene.onCharacterClick(openFeed);
scene.onCharacterPositions((positions) => {
  nameTags.render(positions);
  bubbles.render(positions);
});

const status = document.createElement('div');
status.className = 'overflow hidden';
root.appendChild(status);

function showStatus(text: string): void {
  status.textContent = text;
  status.classList.toggle('hidden', text === '');
}

window.addEventListener('message', (event: MessageEvent<ToWebview>) => {
  const message = event.data;
  switch (message.type) {
    case 'snapshot':
      agents = message.agents;
      scene.setAgents(message.agents);
      showStatus(message.truncated > 0 ? `+${message.truncated} waiting` : '');
      return;
    case 'feed':
      feed.render(message.agentId, message.entries);
      return;
    case 'monitoringDisabled':
      agents = [];
      scene.setAgents([]);
      showStatus('Monitoring is disabled.');
      return;
  }
});

vscode.postMessage({ type: 'ready' });
