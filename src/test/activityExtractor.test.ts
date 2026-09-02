import { describe, it, expect } from 'vitest';
import { extractAction } from '../activityExtractor';

function assistantEntry(content: unknown[]): unknown {
  return { type: 'assistant', message: { role: 'assistant', content } };
}

describe('extractAction', () => {
  it('renders Read as Reading with the file basename', () => {
    const entry = assistantEntry([{ type: 'tool_use', name: 'Read', input: { file_path: '/a/b/types.ts' } }]);
    expect(extractAction(entry)).toBe('Reading types.ts');
  });

  it('renders Edit and Write as Editing', () => {
    const edit = assistantEntry([{ type: 'tool_use', name: 'Edit', input: { file_path: '/x/logParser.ts' } }]);
    const write = assistantEntry([{ type: 'tool_use', name: 'Write', input: { file_path: '/x/new.ts' } }]);
    expect(extractAction(edit)).toBe('Editing logParser.ts');
    expect(extractAction(write)).toBe('Editing new.ts');
  });

  it('renders Bash as Running with a truncated command', () => {
    const entry = assistantEntry([{ type: 'tool_use', name: 'Bash', input: { command: 'npm test' } }]);
    expect(extractAction(entry)).toBe('Running npm test');
  });

  it('truncates a long Bash command to 30 characters', () => {
    const long = 'npm run test -- --coverage --reporter=verbose --run';
    const entry = assistantEntry([{ type: 'tool_use', name: 'Bash', input: { command: long } }]);
    expect(extractAction(entry)).toBe(`Running ${long.slice(0, 30)}…`);
  });

  it('renders Grep and Glob as Searching', () => {
    const entry = assistantEntry([{ type: 'tool_use', name: 'Grep', input: { pattern: 'extractAction' } }]);
    expect(extractAction(entry)).toBe('Searching for extractAction');
  });

  it('renders Agent as Delegating to the subagent type', () => {
    const entry = assistantEntry([{ type: 'tool_use', name: 'Agent', input: { subagent_type: 'debugger' } }]);
    expect(extractAction(entry)).toBe('Delegating to debugger');
  });

  it('renders TodoWrite as Planning and web tools as Researching', () => {
    expect(extractAction(assistantEntry([{ type: 'tool_use', name: 'TodoWrite', input: {} }]))).toBe('Planning');
    expect(extractAction(assistantEntry([{ type: 'tool_use', name: 'WebSearch', input: {} }]))).toBe('Researching');
  });

  it('falls back to Working for an unknown tool', () => {
    const entry = assistantEntry([{ type: 'tool_use', name: 'SomeFutureTool', input: {} }]);
    expect(extractAction(entry)).toBe('Working');
  });

  it('uses the LAST tool_use when a turn has several', () => {
    const entry = assistantEntry([
      { type: 'tool_use', name: 'Read', input: { file_path: '/a.ts' } },
      { type: 'tool_use', name: 'Bash', input: { command: 'ls' } },
    ]);
    expect(extractAction(entry)).toBe('Running ls');
  });

  it('renders Thinking for an assistant turn with text but no tool_use', () => {
    const entry = assistantEntry([{ type: 'text', text: 'Let me look at this.' }]);
    expect(extractAction(entry)).toBe('Thinking');
  });

  it('returns undefined for bookkeeping entries that carry no message', () => {
    for (const type of ['attachment', 'last-prompt', 'queue-operation', 'ai-title']) {
      expect(extractAction({ type })).toBeUndefined();
    }
  });

  it('returns undefined for a user entry', () => {
    expect(extractAction({ type: 'user', message: { role: 'user', content: 'hi' } })).toBeUndefined();
  });

  it('never throws on malformed input', () => {
    for (const bad of [null, undefined, 42, 'string', {}, { message: null }, { message: { content: 'x' } }]) {
      expect(() => extractAction(bad)).not.toThrow();
    }
  });
});
