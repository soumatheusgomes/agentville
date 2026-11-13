import { afterAll, describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { ESLint } from 'eslint';

// The architectural lint rules all share one failure mode: when their module resolution
// is misconfigured they report nothing at all, which is indistinguishable from a clean
// codebase. `import-x/no-cycle` sat in this config for releases doing exactly that —
// import-x cannot parse `.ts` without `import-x/extensions` + `import-x/parsers`, so its
// import graph was empty and every cycle passed. These probes feed each rule a
// deliberate violation and assert it still fires.

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SRC = path.join(REPO_ROOT, 'src');

const eslint = new ESLint({ cwd: REPO_ROOT });

/** Rule ids reported for `code` linted as if it were the file at `filePath`. */
async function ruleIdsFor(code: string, filePath: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath, warnIgnored: false });
  return result.messages.map((message) => message.ruleId).filter((id): id is string => id !== null);
}

describe('architectural lint rules', () => {
  it('stops the parsing core from importing the vscode package', async () => {
    const ruleIds = await ruleIdsFor(
      `import * as vscode from 'vscode';\nexport const probe: unknown = vscode;\n`,
      path.join(SRC, 'logger.ts'),
    );

    expect(ruleIds).toContain('boundaries/dependencies');
  });

  it('stops the parsing core from importing the VS Code layer', async () => {
    const ruleIds = await ruleIdsFor(
      `import { SessionTreeItem } from './treeItems';\nexport const probe: unknown = SessionTreeItem;\n`,
      path.join(SRC, 'logger.ts'),
    );

    expect(ruleIds).toContain('boundaries/dependencies');
  });

  it('lets the VS Code layer import the parsing core', async () => {
    const ruleIds = await ruleIdsFor(
      `import { logDebug } from './logger';\nexport const probe: unknown = logDebug;\n`,
      path.join(SRC, 'treeItems.ts'),
    );

    expect(ruleIds).not.toContain('boundaries/dependencies');
  });

  it('stops production code from importing test code', async () => {
    const ruleIds = await ruleIdsFor(`import './test/sessionScanner.test';\n`, path.join(SRC, 'logger.ts'));

    expect(ruleIds).toContain('import-x/no-restricted-paths');
  });

  it('stops the webview from importing the extension side, except the wire types', async () => {
    const webviewMain = path.join(SRC, 'webview', 'main.ts');
    const blocked = await ruleIdsFor(
      `import { logDebug } from '../logger';\nexport const probe: unknown = logDebug;\n`,
      webviewMain,
    );
    const allowed = await ruleIdsFor(
      `import type { AgentView } from '../officeTypes';\nexport const probe: AgentView[] = [];\n`,
      webviewMain,
    );

    expect(blocked).toContain('no-restricted-imports');
    expect(allowed).not.toContain('no-restricted-imports');
  });
});

describe('import cycle detection', () => {
  // A cycle only exists between files that are really on disk — the resolver reads the
  // second half of the pair from the filesystem, so this pair can't be virtual.
  const cycleFiles = [path.join(SRC, 'zzLintProbeA.ts'), path.join(SRC, 'zzLintProbeB.ts')];

  afterAll(() => {
    for (const file of cycleFiles) {
      fs.rmSync(file, { force: true });
    }
  });

  it('detects a dependency cycle', async () => {
    fs.writeFileSync(cycleFiles[0], `import { b } from './zzLintProbeB';\nexport const a: unknown = b;\n`);
    fs.writeFileSync(cycleFiles[1], `import { a } from './zzLintProbeA';\nexport const b: unknown = a;\n`);

    const [result] = await eslint.lintFiles([cycleFiles[0]]);
    const ruleIds = result.messages.map((message) => message.ruleId);

    expect(ruleIds).toContain('import-x/no-cycle');
  });
});
