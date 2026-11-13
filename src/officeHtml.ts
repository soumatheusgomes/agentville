// The office webview's HTML shell. Pure (no `vscode`), so the Content-Security-Policy —
// the webview's only line of defence — is unit-tested rather than eyeballed.

export interface OfficeHtmlParams {
  cspSource: string; // webview.cspSource — the origin that serves extension resources
  scriptUri: string;
  assetsUri: string;
  nonce: string;
}

function escapeAttribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Overlay styles follow the VS Code theme through its CSS variables. Bubbles, name tags
// and the feed are DOM rather than canvas text so they inherit the theme and stay
// selectable.
const STYLES = `
  html, body { margin: 0; height: 100%; overflow: hidden; background: var(--vscode-editor-background); }
  #office { position: relative; width: 100%; height: 100%; overflow: hidden; }
  #office canvas { image-rendering: pixelated; }
  .bubble {
    position: absolute; top: 0; left: 0; max-width: 220px; padding: 2px 8px;
    font: 11px var(--vscode-font-family); color: var(--vscode-editor-foreground);
    background: var(--vscode-editorWidget-background); border: 1px solid var(--vscode-editorWidget-border);
    border-radius: 10px; cursor: pointer; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .name-tag {
    position: absolute; top: 0; left: 0; pointer-events: none; padding: 0 4px; border-radius: 4px;
    font: 10px var(--vscode-font-family); color: var(--vscode-editor-foreground);
    background: color-mix(in srgb, var(--vscode-editor-background) 78%, transparent); white-space: nowrap;
  }
  .feed {
    position: absolute; top: 0; right: 0; width: min(380px, 90%); height: 100%; box-sizing: border-box;
    overflow-y: auto; padding: 12px; background: var(--vscode-sideBar-background, var(--vscode-editor-background));
    border-left: 1px solid var(--vscode-editorWidget-border); color: var(--vscode-editor-foreground);
    font: 12px var(--vscode-font-family);
  }
  .feed-header { display: flex; gap: 8px; align-items: center; justify-content: space-between; }
  .feed-header h2 { font-size: 13px; margin: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .feed-actions { display: flex; gap: 4px; flex-shrink: 0; }
  .feed button {
    font: 11px var(--vscode-font-family); color: var(--vscode-button-secondaryForeground);
    background: var(--vscode-button-secondaryBackground); border: none; border-radius: 2px; padding: 2px 6px;
    cursor: pointer;
  }
  .feed-empty { opacity: 0.65; margin-top: 12px; }
  .feed-list pre { white-space: pre-wrap; word-break: break-word; margin: 4px 0 12px; font: 12px var(--vscode-editor-font-family); }
  .feed-meta { opacity: 0.65; font-size: 10px; text-transform: uppercase; }
  .overflow {
    position: absolute; left: 8px; bottom: 8px; padding: 2px 8px; border-radius: 8px;
    background: var(--vscode-badge-background); color: var(--vscode-badge-foreground);
    font: 11px var(--vscode-font-family);
  }
  .hidden { display: none; }
`;

export function officeHtml(params: OfficeHtmlParams): string {
  const { cspSource, nonce } = params;
  // No remote origin anywhere. Phaser's loader fetches textures over XHR and decodes them
  // through blob: URLs, so connect-src needs the resource origin and img-src needs blob:.
  const csp = [
    "default-src 'none'",
    `img-src ${cspSource} blob: data:`,
    `style-src ${cspSource} 'unsafe-inline'`,
    `script-src 'nonce-${nonce}'`,
    `connect-src ${cspSource}`,
  ].join('; ');
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta http-equiv="Content-Security-Policy" content="${escapeAttribute(csp)}" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>AgentVille</title>
<style>${STYLES}</style>
</head>
<body>
<div id="office" data-assets="${escapeAttribute(params.assetsUri)}"></div>
<script nonce="${escapeAttribute(nonce)}" src="${escapeAttribute(params.scriptUri)}"></script>
</body>
</html>`;
}
