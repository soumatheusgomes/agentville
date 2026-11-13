import { describe, it, expect } from 'vitest';
import { officeHtml } from '../officeHtml';

const params = {
  cspSource: 'https://res.vscode-cdn.net',
  scriptUri: 'https://res.vscode-cdn.net/ext/dist/webview.js',
  assetsUri: 'https://res.vscode-cdn.net/ext/resources/office',
  nonce: 'abc123',
};

function cspOf(html: string): string {
  const match = /http-equiv="Content-Security-Policy" content="([^"]*)"/.exec(html);
  return match?.[1] ?? '';
}

describe('officeHtml', () => {
  it('only runs the nonce-tagged script', () => {
    const html = officeHtml(params);
    expect(cspOf(html)).toContain("script-src 'nonce-abc123'");
    expect(cspOf(html)).not.toContain('unsafe-eval');
    expect(html).toContain(`<script nonce="abc123" src="${params.scriptUri}">`);
  });

  it('denies everything by default and allows no remote origin', () => {
    const csp = cspOf(officeHtml(params));
    expect(csp.startsWith("default-src 'none'")).toBe(true);
    const origins = csp.match(/https?:\/\/[^\s;]+/g) ?? [];
    expect(new Set(origins)).toEqual(new Set([params.cspSource]));
  });

  it('lets Phaser fetch textures from the resource origin', () => {
    const csp = cspOf(officeHtml(params));
    expect(csp).toContain(`connect-src ${params.cspSource}`);
    expect(csp).toMatch(/img-src [^;]*blob:/);
  });

  it('passes the asset root to the webview bootstrap', () => {
    expect(officeHtml(params)).toContain(`data-assets="${params.assetsUri}"`);
  });

  it('escapes attribute values', () => {
    const html = officeHtml({ ...params, assetsUri: 'x" onload="alert(1)' });
    expect(html).toContain('data-assets="x&quot; onload=&quot;alert(1)"');
  });
});
