import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { extractAction } from '../activityExtractor';
import { SubagentTranscriptReader } from '../subagentTranscriptReader';

// Fixtures have hidden a parser bug in this project before (153 tests green, one run against
// real transcripts caught it), so this suite reads whatever Claude Code transcripts exist on
// the machine running it. Skipped where there are none — CI included.
const PROJECTS_DIR = path.join(os.homedir(), '.claude', 'projects');
const MAX_TRANSCRIPTS = 5;
const MAX_ACTION_CHARS = 80;

function someTranscripts(limit: number): string[] {
  if (!fs.existsSync(PROJECTS_DIR)) {
    return [];
  }
  const found: string[] = [];
  for (const dir of fs.readdirSync(PROJECTS_DIR)) {
    const full = path.join(PROJECTS_DIR, dir);
    if (!fs.statSync(full).isDirectory()) {
      continue;
    }
    for (const file of fs.readdirSync(full).filter((f) => f.endsWith('.jsonl'))) {
      found.push(path.join(full, file));
      if (found.length >= limit) {
        return found;
      }
    }
  }
  return found;
}

function parsedLines(transcript: string): unknown[] {
  return fs
    .readFileSync(transcript, 'utf8')
    .split('\n')
    .flatMap((line) => {
      try {
        return line.trim() ? [JSON.parse(line) as unknown] : [];
      } catch {
        return [];
      }
    });
}

const transcripts = someTranscripts(MAX_TRANSCRIPTS);

describe.skipIf(transcripts.length === 0)('office extraction against real transcripts', () => {
  it('renders bounded, human-readable actions and never a raw tool id', () => {
    let rendered = 0;
    for (const transcript of transcripts) {
      for (const entry of parsedLines(transcript)) {
        const action = extractAction(entry);
        if (action === undefined) {
          continue;
        }
        rendered++;
        expect(action).not.toMatch(/tool_use|toolu_/);
        expect(action.length).toBeLessThan(MAX_ACTION_CHARS);
      }
    }
    expect(rendered).toBeGreaterThan(0);
  });

  it('reads each transcript tail into a feed with no empty entries', () => {
    for (const transcript of transcripts) {
      const { entries } = new SubagentTranscriptReader().read(transcript);
      for (const entry of entries) {
        expect(entry.text.trim()).not.toBe('');
        expect(Number.isFinite(entry.at)).toBe(true);
      }
    }
  });
});
