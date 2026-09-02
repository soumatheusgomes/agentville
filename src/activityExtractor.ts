// Derives the one-line "what is this agent doing right now" string shown in the office
// speech bubble, from the last tool_use of an agent's most recent assistant turn.
//
// The transcript format is undocumented and changes between Claude Code releases, so every
// access here is defensive: an unrecognised shape yields `undefined` (keep the previous
// action) or the generic 'Working', never an exception and never a raw tool id.

const MAX_COMMAND_CHARS = 30;

interface ToolUse {
  name: string;
  input: Record<string, unknown>;
}

function basename(filePath: string): string {
  const parts = filePath.split(/[\\/]/);
  return parts[parts.length - 1] || filePath;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function toRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

// `Array.isArray`'s lib.es5.d.ts signature narrows to `any[]`, not `unknown[]` — this wrapper
// re-types the guard so indexing the result doesn't smuggle `any` back in.
function isUnknownArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

/** The object at `entry.message`, or undefined when `entry` isn't shaped that way. */
function getMessage(entry: unknown): Record<string, unknown> | undefined {
  if (typeof entry !== 'object' || entry === null) {
    return undefined;
  }
  const message = (entry as { message?: unknown }).message;
  return typeof message === 'object' && message !== null ? (message as Record<string, unknown>) : undefined;
}

function isAssistantTurn(entry: unknown): boolean {
  // Bookkeeping entries (attachment / last-prompt / queue-operation / ai-title) trail every
  // real turn and carry no `message` — gating on `type` alone would misread them as turns.
  if (!getMessage(entry)) {
    return false;
  }
  return (entry as { type?: unknown }).type === 'assistant';
}

function isToolUseBlock(block: unknown): block is { name: string; input: unknown } {
  if (typeof block !== 'object' || block === null) {
    return false;
  }
  const typed = block as { type?: unknown; name?: unknown };
  return typed.type === 'tool_use' && typeof typed.name === 'string';
}

/** The last tool_use block of an assistant turn, or undefined when there is none. */
function lastToolUse(entry: unknown): ToolUse | undefined {
  const content = getMessage(entry)?.content;
  if (!isUnknownArray(content)) {
    return undefined;
  }
  for (let i = content.length - 1; i >= 0; i--) {
    const block = content[i];
    if (isToolUseBlock(block)) {
      return { name: block.name, input: toRecord(block.input) };
    }
  }
  return undefined;
}

type ToolRenderer = (input: Record<string, unknown>) => string;

function renderRead(input: Record<string, unknown>): string {
  const file = asString(input.file_path);
  return file ? `Reading ${basename(file)}` : 'Reading';
}

function renderEdit(input: Record<string, unknown>): string {
  const file = asString(input.file_path) ?? asString(input.notebook_path);
  return file ? `Editing ${basename(file)}` : 'Editing';
}

function renderBash(input: Record<string, unknown>): string {
  const command = asString(input.command);
  if (!command) {
    return 'Running a command';
  }
  const shown = command.length > MAX_COMMAND_CHARS ? `${command.slice(0, MAX_COMMAND_CHARS)}…` : command;
  return `Running ${shown}`;
}

function renderSearch(input: Record<string, unknown>): string {
  const pattern = asString(input.pattern);
  return pattern ? `Searching for ${pattern}` : 'Searching';
}

function renderDelegate(input: Record<string, unknown>): string {
  const target = asString(input.subagent_type) ?? asString(input.description);
  return target ? `Delegating to ${target}` : 'Delegating';
}

function renderConstant(text: string): ToolRenderer {
  return () => text;
}

// One renderer per known tool name, keyed by the exact tool_use `name`. A lookup table
// (rather than a switch) keeps this at a flat, low complexity regardless of how many tools
// it grows to cover — see renderTool below.
const TOOL_RENDERERS: ReadonlyMap<string, ToolRenderer> = new Map<string, ToolRenderer>([
  ['Read', renderRead],
  ['Edit', renderEdit],
  ['Write', renderEdit],
  ['NotebookEdit', renderEdit],
  ['Bash', renderBash],
  ['Grep', renderSearch],
  ['Glob', renderSearch],
  ['Agent', renderDelegate],
  ['Task', renderDelegate],
  ['WebSearch', renderConstant('Researching')],
  ['WebFetch', renderConstant('Researching')],
  ['TodoWrite', renderConstant('Planning')],
]);

function renderTool(tool: ToolUse): string {
  const renderer = TOOL_RENDERERS.get(tool.name);
  return renderer ? renderer(tool.input) : 'Working';
}

/**
 * The current action for an agent, from one transcript entry.
 * `undefined` means "this entry says nothing about activity" — the caller keeps whatever
 * action it already had.
 */
export function extractAction(entry: unknown): string | undefined {
  try {
    if (!isAssistantTurn(entry)) {
      return undefined;
    }
    const tool = lastToolUse(entry);
    return tool ? renderTool(tool) : 'Thinking';
  } catch {
    return undefined;
  }
}
