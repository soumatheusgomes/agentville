// Reads a subagent's own transcript — the file the tree view never needed. Subagent
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

function emptyRead(): SubagentRead {
  return { action: undefined, entries: [] };
}

/** `/logs/proj/session-1.jsonl` + `abc` → `/logs/proj/session-1/subagents/agent-abc.jsonl` */
export function subagentTranscriptPath(sessionLogPath: string, agentId: string): string {
  const dir = path.dirname(sessionLogPath);
  const sessionId = path.basename(sessionLogPath, '.jsonl');
  return path.join(dir, sessionId, 'subagents', `agent-${agentId}.jsonl`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

// `Array.isArray`'s lib.es5.d.ts signature narrows to `any[]`, not `unknown[]` — this
// wrapper mirrors the one in activityExtractor.ts (not exported there, so duplicated here)
// re-typing the guard so indexing the result doesn't smuggle `any` back in.
function isUnknownArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

/** Plain text of a message body — a string body as-is, or the `text` blocks of an array body. */
function textOf(message: Record<string, unknown>): string {
  const content = message.content;
  if (typeof content === 'string') {
    return content;
  }
  if (!isUnknownArray(content)) {
    return '';
  }
  const parts: string[] = [];
  for (const block of content) {
    if (isRecord(block) && block.type === 'text' && typeof block.text === 'string') {
      parts.push(block.text);
    }
  }
  return parts.join('\n');
}

/** 'user' or 'assistant' for a recognised turn type, undefined for anything else (bookkeeping). */
function feedRole(type: unknown): 'assistant' | 'user' | undefined {
  if (type === 'user') {
    return 'user';
  }
  if (type === 'assistant') {
    return 'assistant';
  }
  return undefined;
}

/** The entry's `timestamp` in epoch ms, or now when it is missing or unparsable. */
function parsedAt(entry: Record<string, unknown>): number {
  const timestamp = entry.timestamp;
  if (typeof timestamp !== 'string') {
    return Date.now();
  }
  const at = Date.parse(timestamp);
  return Number.isNaN(at) ? Date.now() : at;
}

/** A parsed transcript line as a `FeedEntry`, or undefined when it carries nothing to show. */
function toFeedEntry(entry: unknown): FeedEntry | undefined {
  if (!isRecord(entry)) {
    return undefined;
  }
  const role = feedRole(entry.type);
  if (!role) {
    return undefined;
  }
  const message = entry.message;
  if (!isRecord(message)) {
    return undefined;
  }
  const text = textOf(message);
  const action = extractAction(entry);
  if (!text && !action) {
    return undefined;
  }
  return { role, text: text || (action ?? ''), tool: action, at: parsedAt(entry) };
}

/** Turns each JSON line of a chunk into the latest action and any displayable feed entries. */
function parseChunk(chunk: string): SubagentRead {
  const entries: FeedEntry[] = [];
  let action: string | undefined;
  for (const line of chunk.split('\n')) {
    if (!line.trim()) {
      continue;
    }
    try {
      const parsed: unknown = JSON.parse(line);
      const feed = toFeedEntry(parsed);
      if (feed) {
        entries.push(feed);
      }
      action = extractAction(parsed) ?? action;
    } catch {
      // A partially-written trailing line is normal while an agent is mid-append.
    }
  }
  return { action, entries };
}

export class SubagentTranscriptReader {
  private readonly offsets = new Map<string, number>();

  read(transcriptPath: string): SubagentRead {
    try {
      if (!fs.existsSync(transcriptPath)) {
        return emptyRead();
      }
      const chunk = this.readNewBytes(transcriptPath);
      return chunk === undefined ? emptyRead() : parseChunk(chunk);
    } catch (error) {
      logDebug(`SubagentTranscriptReader.read failed for ${transcriptPath}: ${String(error)}`);
      return emptyRead();
    }
  }

  /** Bytes appended to `transcriptPath` since the last read, or undefined when there are none. */
  private readNewBytes(transcriptPath: string): string | undefined {
    const size = fs.statSync(transcriptPath).size;
    const previous = this.offsets.get(transcriptPath) ?? 0;
    // A file that shrank was rotated or rewritten — start over rather than read garbage.
    const start = size < previous ? 0 : previous;
    this.offsets.set(transcriptPath, size);
    if (size === start) {
      return undefined;
    }

    const fd = fs.openSync(transcriptPath, 'r');
    try {
      const buffer = Buffer.alloc(size - start);
      fs.readSync(fd, buffer, 0, buffer.length, start);
      return buffer.toString('utf8');
    } finally {
      fs.closeSync(fd);
    }
  }
}
