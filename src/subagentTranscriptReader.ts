// Reads an agent's own transcript incrementally — for a subagent, the file the tree view
// never needed; the office also uses it for a working session's own log. Subagent
// transcripts live at `<session-dir>/<session-id>/subagents/agent-<id>.jsonl`; the parent
// transcript only records the launch and the completion, so the live picture of what a
// subagent is doing exists nowhere else.
//
// Incremental by the same rule as LogParser: cache a byte offset per file and read only
// what was appended. Only WORKING subagents should be passed here — a finished subagent
// cannot produce a new action, and opening every completed one would multiply I/O by the
// number of agents the session has ever launched.

import * as fs from 'fs';
import * as path from 'path';
import { extractAction } from './activityExtractor';
import { logDebug } from './logger';
import type { FeedEntry } from './officeTypes';

export interface SubagentRead {
  action?: string;
  entries: FeedEntry[];
}

const EMPTY: SubagentRead = { action: undefined, entries: [] };

/** `/logs/proj/session-1.jsonl` + `abc` → `/logs/proj/session-1/subagents/agent-abc.jsonl` */
export function subagentTranscriptPath(sessionLogPath: string, agentId: string): string {
  const dir = path.dirname(sessionLogPath);
  const sessionId = path.basename(sessionLogPath, '.jsonl');
  return path.join(dir, sessionId, 'subagents', `agent-${agentId}.jsonl`);
}

interface MessageEntry {
  type: 'assistant' | 'user';
  timestamp?: unknown;
  message: { content?: unknown };
}

/** Only real conversational turns: bookkeeping entries carry no `message`. */
function asMessageEntry(entry: unknown): MessageEntry | undefined {
  if (typeof entry !== 'object' || entry === null) {
    return undefined;
  }
  const typed = entry as { type?: unknown; message?: unknown };
  if (typed.type !== 'assistant' && typed.type !== 'user') {
    return undefined;
  }
  return typeof typed.message === 'object' && typed.message !== null ? (entry as MessageEntry) : undefined;
}

function textOf(content: unknown): string {
  if (typeof content === 'string') {
    return content;
  }
  if (!Array.isArray(content)) {
    return '';
  }
  return content
    .map((block: unknown) => {
      const typed = block as { type?: unknown; text?: unknown } | null;
      return typed?.type === 'text' && typeof typed.text === 'string' ? typed.text : '';
    })
    .filter((text) => text.length > 0)
    .join('\n');
}

function timestampOf(value: unknown): number {
  const at = typeof value === 'string' ? Date.parse(value) : NaN;
  return Number.isNaN(at) ? Date.now() : at;
}

function toFeedEntry(entry: MessageEntry, action: string | undefined): FeedEntry | undefined {
  const text = textOf(entry.message.content);
  if (!text && !action) {
    return undefined;
  }
  return { role: entry.type, text: text || (action ?? ''), tool: action, at: timestampOf(entry.timestamp) };
}

/** Parse appended JSONL, keeping the latest action and every conversational entry. */
function parseChunk(chunk: string): SubagentRead {
  const entries: FeedEntry[] = [];
  let action: string | undefined;
  for (const line of chunk.split('\n')) {
    if (!line.trim()) {
      continue;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue; // A partially-written trailing line is normal while an agent is mid-append.
    }
    const message = asMessageEntry(parsed);
    if (!message) {
      continue;
    }
    const lineAction = extractAction(parsed);
    const feed = toFeedEntry(message, lineAction);
    if (feed) {
      entries.push(feed);
    }
    action = lineAction ?? action;
  }
  return { action, entries };
}

function readRange(filePath: string, start: number, end: number): Buffer {
  const fd = fs.openSync(filePath, 'r');
  try {
    const buffer = Buffer.alloc(end - start);
    fs.readSync(fd, buffer, 0, buffer.length, start);
    return buffer;
  } finally {
    fs.closeSync(fd);
  }
}

const NEWLINE = 0x0a;

// The first read of a transcript starts this far from its end: session transcripts reach
// tens of MB, and the office only needs the latest action and a short recent window. The
// partial line this lands in fails JSON.parse and is skipped like any other bad line.
export const INITIAL_TAIL_BYTES = 256 * 1024;

function startOffset(size: number, previous: number | undefined): number {
  if (previous === undefined) {
    return Math.max(0, size - INITIAL_TAIL_BYTES);
  }
  // A file that shrank was rotated or rewritten — start over rather than read garbage.
  return size < previous ? 0 : previous;
}

export class SubagentTranscriptReader {
  private readonly offsets = new Map<string, number>();

  read(transcriptPath: string): SubagentRead {
    try {
      if (!fs.existsSync(transcriptPath)) {
        return EMPTY;
      }
      const size = fs.statSync(transcriptPath).size;
      const start = startOffset(size, this.offsets.get(transcriptPath));
      if (size === start) {
        return EMPTY;
      }
      const chunk = readRange(transcriptPath, start, size);
      // Consume only complete lines: a trailing line without its newline is still being
      // appended, and advancing past it would drop that entry for good.
      const complete = chunk.lastIndexOf(NEWLINE) + 1;
      this.offsets.set(transcriptPath, start + complete);
      return parseChunk(chunk.subarray(0, complete).toString('utf8'));
    } catch (error) {
      logDebug(`SubagentTranscriptReader.read failed for ${transcriptPath}: ${String(error)}`);
      return EMPTY;
    }
  }
}
