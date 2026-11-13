// Side panel showing one agent's recent activity. Content arrives as a bounded window from
// the extension; this file only renders it. All text goes in via textContent — transcript
// content is untrusted and must never be parsed as HTML.

import type { FeedEntry } from '../../officeTypes';

export interface FeedPanelActions {
  onClose: () => void;
  onOpenLog: (agentId: string) => void;
  onOpenProject: (agentId: string) => void;
}

function button(label: string, onClick: () => void): HTMLButtonElement {
  const node = document.createElement('button');
  node.textContent = label;
  node.addEventListener('click', onClick);
  return node;
}

function entryNode(entry: FeedEntry): HTMLElement {
  const item = document.createElement('article');
  item.className = `feed-entry feed-entry--${entry.role}`;
  const meta = document.createElement('span');
  meta.className = 'feed-meta';
  const time = new Date(entry.at).toLocaleTimeString();
  meta.textContent = `${entry.tool ?? entry.role} · ${time}`;
  const body = document.createElement('pre');
  body.textContent = entry.text;
  item.append(meta, body);
  return item;
}

export class FeedPanel {
  private readonly element: HTMLElement;
  private readonly list: HTMLElement;
  private readonly title: HTMLElement;
  private agentId: string | undefined;

  constructor(
    root: HTMLElement,
    private readonly actions: FeedPanelActions,
  ) {
    this.element = document.createElement('aside');
    this.element.className = 'feed hidden';
    this.title = document.createElement('h2');
    this.list = document.createElement('div');
    this.list.className = 'feed-list';

    const header = document.createElement('div');
    header.className = 'feed-header';
    const buttons = document.createElement('div');
    buttons.className = 'feed-actions';
    buttons.append(
      button('Open Log', () => {
        if (this.agentId) actions.onOpenLog(this.agentId);
      }),
      button('Open Project', () => {
        if (this.agentId) actions.onOpenProject(this.agentId);
      }),
      button('Close', () => {
        this.close();
      }),
    );
    header.append(this.title, buttons);
    this.element.append(header, this.list);
    root.appendChild(this.element);
  }

  open(agentId: string, name: string): void {
    this.agentId = agentId;
    this.title.textContent = name;
    this.title.title = name;
    this.renderEntries([]);
    this.element.classList.remove('hidden');
  }

  close(): void {
    this.agentId = undefined;
    this.element.classList.add('hidden');
    this.actions.onClose();
  }

  get openAgentId(): string | undefined {
    return this.agentId;
  }

  render(agentId: string, entries: readonly FeedEntry[]): void {
    if (agentId === this.agentId) {
      this.renderEntries(entries);
    }
  }

  private renderEntries(entries: readonly FeedEntry[]): void {
    if (entries.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'feed-empty';
      empty.textContent = 'No recent activity yet. Entries appear here while the agent works.';
      this.list.replaceChildren(empty);
      return;
    }
    this.list.replaceChildren(...entries.map(entryNode));
    this.element.scrollTop = this.element.scrollHeight;
  }
}
