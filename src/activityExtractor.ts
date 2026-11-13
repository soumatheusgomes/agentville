// Derives the one-line "what is this agent doing right now" string shown in the office
// speech bubble, from the last tool_use of an agent's most recent assistant turn.
//
// The transcript format is undocumented and changes between Claude Code releases, so every
// access here is defensive: an unrecognised shape yields `undefined` (keep the previous
// action) or the generic 'Working', never an exception and never a raw tool id.

const MAX_COMMAND_CHARS = 30;

type ToolInput = Record<string, unknown>;

interface ToolUse {
  name: string;
  input: ToolInput;
}

function basename(filePath: string): string {
  const parts = filePath.split(/[\\/]/);
  return parts[parts.length - 1] || filePath;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : undefined;
}

/** `prefix detail` when a detail exists, else the bare prefix. */
function withDetail(prefix: string, detail: string | undefined): string {
  return detail ? `${prefix} ${detail}` : prefix;
}

function renderEdit(input: ToolInput): string {
  const file = asString(input.file_path) ?? asString(input.notebook_path);
  return withDetail('Editing', file && basename(file));
}

function renderBash(input: ToolInput): string {
  const command = asString(input.command);
  if (!command) {
    return 'Running a command';
  }
  return command.length > MAX_COMMAND_CHARS ? `Running ${command.slice(0, MAX_COMMAND_CHARS)}…` : `Running ${command}`;
}

function renderSearch(input: ToolInput): string {
  const pattern = asString(input.pattern);
  return pattern ? `Searching for ${pattern}` : 'Searching';
}

function renderDelegate(input: ToolInput): string {
  const target = asString(input.subagent_type) ?? asString(input.description);
  return target ? `Delegating to ${target}` : 'Delegating';
}

const RENDERERS: Record<string, (input: ToolInput) => string> = {
  Read: (input) => {
    const file = asString(input.file_path);
    return withDetail('Reading', file && basename(file));
  },
  Edit: renderEdit,
  Write: renderEdit,
  NotebookEdit: renderEdit,
  Bash: renderBash,
  Grep: renderSearch,
  Glob: renderSearch,
  Agent: renderDelegate,
  Task: renderDelegate,
  WebSearch: () => 'Researching',
  WebFetch: () => 'Researching',
  TodoWrite: () => 'Planning',
};

/**
 * The `message` of an assistant turn, or undefined. Bookkeeping entries (attachment /
 * last-prompt / queue-operation / ai-title) trail every real turn and carry no `message` —
 * gating on `type` alone would misread them as turns.
 */
function assistantMessage(entry: unknown): Record<string, unknown> | undefined {
  const typed = asRecord(entry);
  if (typed?.type !== 'assistant') {
    return undefined;
  }
  return asRecord(typed.message);
}

/** The last tool_use block of an assistant turn, or undefined when there is none. */
function lastToolUse(message: Record<string, unknown>): ToolUse | undefined {
  const content = message.content;
  if (!Array.isArray(content)) {
    return undefined;
  }
  for (let i = content.length - 1; i >= 0; i--) {
    const block = asRecord(content[i]);
    if (block?.type === 'tool_use' && typeof block.name === 'string') {
      return { name: block.name, input: asRecord(block.input) ?? {} };
    }
  }
  return undefined;
}

function renderTool(tool: ToolUse): string {
  const render = Object.prototype.hasOwnProperty.call(RENDERERS, tool.name) ? RENDERERS[tool.name] : undefined;
  return render ? render(tool.input) : 'Working';
}

/**
 * The current action for an agent, from one transcript entry.
 * `undefined` means "this entry says nothing about activity" — the caller keeps whatever
 * action it already had.
 */
export function extractAction(entry: unknown): string | undefined {
  try {
    const message = assistantMessage(entry);
    if (!message) {
      return undefined;
    }
    const tool = lastToolUse(message);
    return tool ? renderTool(tool) : 'Thinking';
  } catch {
    return undefined;
  }
}
