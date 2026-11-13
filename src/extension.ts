import * as vscode from 'vscode';
import * as fs from 'fs';
import { SessionTreeDataProvider } from './sessionTreeDataProvider';
import { SessionTreeItem } from './treeItems';
import { logDebug } from './logger';
import { OfficePanel } from './officePanel';

// Delay before the first log scan, giving Claude Code / Antigravity time to boot
// and read their own files before we start competing for them.
const STARTUP_DELAY_MS = 10000;

const CONFIG_SECTION = 'agentville';
const ENABLED_KEY = 'enabled';

function isMonitoringEnabled(): boolean {
  return vscode.workspace.getConfiguration(CONFIG_SECTION).get<boolean>(ENABLED_KEY, true);
}

function setMonitoringEnabled(value: boolean): void {
  // Application scope → persisted in user settings and shared across every window/instance.
  void vscode.workspace.getConfiguration(CONFIG_SECTION).update(ENABLED_KEY, value, vscode.ConfigurationTarget.Global);
}

export function activate(context: vscode.ExtensionContext) {
  logDebug('activate(): Extension activation process started');

  // Instantiate the provider synchronously (no I/O here)
  const provider = new SessionTreeDataProvider();
  logDebug('activate(): SessionTreeDataProvider instantiated');

  // Register tree provider synchronously so the sidebar renders immediately.
  // createTreeView (over registerTreeDataProvider) lets us set a header message during loading.
  const treeView = vscode.window.createTreeView('agentville.world', { treeDataProvider: provider });
  context.subscriptions.push(treeView, provider);

  // Register all commands synchronously — zero I/O cost
  registerCommands(context, provider);

  // React to the global enable/disable setting. This fires in every window when the
  // (application-scoped) setting changes, so toggling in one instance stops them all.
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (!e.affectsConfiguration(`${CONFIG_SECTION}.${ENABLED_KEY}`)) {
        return;
      }
      treeView.message = undefined;
      if (isMonitoringEnabled()) {
        void provider.activateMonitoring();
      } else {
        provider.deactivateMonitoring();
      }
    }),
  );

  if (!isMonitoringEnabled()) {
    logDebug('activate(): monitoring disabled via config — showing placeholder only');
    provider.deactivateMonitoring();
    return;
  }

  // Hold off on the heavy I/O (scanning + parsing hundreds of log files) for a few seconds
  // so Claude Code / Antigravity can finish booting and reading their own log files without
  // us competing for them. A progress bar renders in the view during the wait.
  treeView.message = 'Starting AgentVille…';
  void vscode.window.withProgress(
    { location: { viewId: 'agentville.world' }, title: 'Waiting for Claude Code to start…' },
    async () => {
      await new Promise((resolve) => setTimeout(resolve, STARTUP_DELAY_MS));
      await provider.activateMonitoring();
      // Clear the header message — the view now shows real content (or an empty-state row).
      treeView.message = undefined;
      logDebug('activate(): Initial monitoring activated after startup delay');
    },
  );
}

function registerCommands(
  context: vscode.ExtensionContext,
  provider: import('./sessionTreeDataProvider').SessionTreeDataProvider,
): void {
  const refreshCmd = vscode.commands.registerCommand('agentville.refresh', () => {
    logDebug('command(): refresh invoked');
    provider.refresh();
  });
  context.subscriptions.push(refreshCmd);

  // Toggle buttons in the view title. Handlers only flip the setting; the config
  // listener in activate() is what actually starts/stops monitoring.
  const enableCmd = vscode.commands.registerCommand('agentville.enable', () => {
    logDebug('command(): enable monitoring');
    setMonitoringEnabled(true);
  });
  const disableCmd = vscode.commands.registerCommand('agentville.disable', () => {
    logDebug('command(): disable monitoring');
    setMonitoringEnabled(false);
  });
  context.subscriptions.push(enableCmd, disableCmd);

  const openLogCmd = vscode.commands.registerCommand('agentville.openSessionLog', (item?: SessionTreeItem) => {
    logDebug(`command(): openSessionLog for ${item?.id || 'unknown'}`);
    if (item?.session.logFilePath) {
      if (fs.existsSync(item.session.logFilePath)) {
        void vscode.workspace
          .openTextDocument(vscode.Uri.file(item.session.logFilePath))
          .then((doc) => vscode.window.showTextDocument(doc));
      } else {
        void vscode.window.showErrorMessage(`Log file not found: ${item.session.logFilePath}`);
      }
    }
  });
  context.subscriptions.push(openLogCmd);

  const openProjectCmd = vscode.commands.registerCommand('agentville.openProject', (item?: SessionTreeItem) => {
    logDebug(`command(): openProject for ${item?.id || 'unknown'}`);
    if (item?.session.projectPath) {
      if (fs.existsSync(item.session.projectPath)) {
        void vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(item.session.projectPath), true);
      } else {
        void vscode.window.showErrorMessage(`Project folder not found: ${item.session.projectPath}`);
      }
    }
  });
  context.subscriptions.push(openProjectCmd);

  const openOfficeCmd = vscode.commands.registerCommand('agentville.openOffice', () => {
    logDebug('command(): openOffice invoked');
    OfficePanel.show(context, provider);
  });
  context.subscriptions.push(openOfficeCmd);
}

export function deactivate() {
  logDebug('deactivate(): Extension is being deactivated');
}
