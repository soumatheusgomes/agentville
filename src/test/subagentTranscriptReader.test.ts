import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { INITIAL_TAIL_BYTES, SubagentTranscriptReader, subagentTranscriptPath } from '../subagentTranscriptReader';

const tempDir = path.join(os.tmpdir(), 'agentville-subagent-test');
const filePath = path.join(tempDir, 'agent-abc.jsonl');

function assistantLine(toolName: string, input: Record<string, unknown>): string {
  return `${JSON.stringify({
    type: 'assistant',
    timestamp: '2026-08-13T10:00:00.000Z',
    message: { role: 'assistant', content: [{ type: 'tool_use', name: toolName, input }] },
  })}\n`;
}

describe('subagentTranscriptPath', () => {
  it('resolves the subagents directory next to the session transcript', () => {
    const result = subagentTranscriptPath('/logs/proj/session-1.jsonl', 'abc');
    expect(result).toBe(path.join('/logs/proj', 'session-1', 'subagents', 'agent-abc.jsonl'));
  });
});

describe('SubagentTranscriptReader', () => {
  beforeEach(() => {
    fs.mkdirSync(tempDir, { recursive: true });
    fs.writeFileSync(filePath, '');
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('returns an empty result for a missing file and does not throw', () => {
    const reader = new SubagentTranscriptReader();
    expect(reader.read(path.join(tempDir, 'nope.jsonl'))).toEqual({ action: undefined, entries: [] });
  });

  it('extracts the action from the last assistant turn', () => {
    fs.writeFileSync(filePath, assistantLine('Read', { file_path: '/a/types.ts' }));
    const reader = new SubagentTranscriptReader();
    expect(reader.read(filePath).action).toBe('Reading types.ts');
  });

  it('reads only appended bytes on a second call', () => {
    fs.writeFileSync(filePath, assistantLine('Read', { file_path: '/a/one.ts' }));
    const reader = new SubagentTranscriptReader();
    expect(reader.read(filePath).entries).toHaveLength(1);

    fs.appendFileSync(filePath, assistantLine('Bash', { command: 'npm test' }));
    const second = reader.read(filePath);
    expect(second.entries).toHaveLength(1);
    expect(second.action).toBe('Running npm test');
  });

  it('returns no new entries when nothing was appended', () => {
    fs.writeFileSync(filePath, assistantLine('Read', { file_path: '/a/one.ts' }));
    const reader = new SubagentTranscriptReader();
    reader.read(filePath);
    expect(reader.read(filePath).entries).toEqual([]);
  });

  it('re-reads from the start when the file shrinks (rotation)', () => {
    fs.writeFileSync(filePath, assistantLine('Read', { file_path: '/a/one.ts' }));
    const reader = new SubagentTranscriptReader();
    reader.read(filePath);

    fs.writeFileSync(filePath, assistantLine('Bash', { command: 'ls' }));
    expect(reader.read(filePath).entries).toHaveLength(1);
  });

  it('skips malformed lines without throwing', () => {
    fs.writeFileSync(filePath, `not json\n${assistantLine('Read', { file_path: '/a/ok.ts' })}{"broken":\n`);
    const reader = new SubagentTranscriptReader();
    const result = reader.read(filePath);
    expect(result.action).toBe('Reading ok.ts');
    expect(result.entries).toHaveLength(1);
  });

  it('picks up a trailing line once its write completes', () => {
    const line = assistantLine('Bash', { command: 'ls' });
    fs.writeFileSync(filePath, line.slice(0, 20));
    const reader = new SubagentTranscriptReader();
    expect(reader.read(filePath).entries).toEqual([]);

    fs.appendFileSync(filePath, line.slice(20));
    expect(reader.read(filePath).action).toBe('Running ls');
  });

  it('reads only the tail of a large transcript on first sight', () => {
    const filler = assistantLine('Read', { file_path: '/a/old.ts' });
    const lines = Math.ceil((INITIAL_TAIL_BYTES * 2) / filler.length);
    fs.writeFileSync(filePath, filler.repeat(lines) + assistantLine('Bash', { command: 'ls' }));
    const result = new SubagentTranscriptReader().read(filePath);
    expect(result.action).toBe('Running ls');
    expect(result.entries.length).toBeLessThan(lines / 2);
  });

  it('moves the action to Thinking without adding a text-less thinking entry to the feed', () => {
    const thinking = `${JSON.stringify({
      type: 'assistant',
      message: { role: 'assistant', content: [{ type: 'thinking', thinking: '', signature: 'x' }] },
    })}\n`;
    fs.writeFileSync(filePath, assistantLine('Read', { file_path: '/a/one.ts' }) + thinking);
    const result = new SubagentTranscriptReader().read(filePath);
    expect(result.action).toBe('Thinking');
    expect(result.entries.map((e) => e.tool)).toEqual(['Reading one.ts']);
  });

  it('labels a prose turn by role, not as Thinking', () => {
    const prose = `${JSON.stringify({
      type: 'assistant',
      message: { role: 'assistant', content: [{ type: 'text', text: 'Let me check the parser.' }] },
    })}\n`;
    fs.writeFileSync(filePath, prose);
    const [entry] = new SubagentTranscriptReader().read(filePath).entries;
    expect(entry).toMatchObject({ role: 'assistant', text: 'Let me check the parser.', tool: undefined });
  });

  it('ignores bookkeeping entries', () => {
    fs.writeFileSync(filePath, `${JSON.stringify({ type: 'ai-title' })}\n`);
    const reader = new SubagentTranscriptReader();
    expect(reader.read(filePath)).toEqual({ action: undefined, entries: [] });
  });
});
