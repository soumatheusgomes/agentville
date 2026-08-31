import { describe, it, expect, vi, afterEach } from 'vitest';
import { exec } from 'child_process';
import * as path from 'path';
import { computeSessionStatus, getOpenLogFiles } from '../sessionActivity';
import { Session } from '../types';

vi.mock('child_process', () => ({
  exec: vi.fn((_command: string, callback: (error: Error | null, stdout: string, stderr: string) => void) => {
    callback(null, '', '');
  }),
}));

const FIVE_MINUTES = 5 * 60 * 1000;
const THIRTY_ONE_MINUTES = 31 * 60 * 1000;

function session(overrides: Partial<Session> = {}): Session {
  return {
    id: 'session-1',
    projectHash: '-Users-dev-Projects-acme',
    projectPath: '/Users/dev/Projects/acme',
    projectName: 'acme',
    gitBranch: 'main',
    status: 'stopped',
    lastInteractionTime: Date.now() - FIVE_MINUTES,
    subagents: [],
    logFilePath: '/Users/dev/.claude/projects/acme/session-1.jsonl',
    type: 'claude-code',
    ...overrides,
  };
}

describe('computeSessionStatus', () => {
  const noOpenFiles = new Set<string>();

  it('keeps a session working while its last turn is a thinking block', () => {
    // Claude Code streams reasoning as its own thinking-only entry, so the transcript can sit
    // untouched for minutes mid-reply. Without this the sidebar showed the session as stopped
    // exactly while the user was watching it think.
    const status = computeSessionStatus(session({ lastEntryIsThinking: true }), noOpenFiles);

    expect(status).toBe('working');
  });

  it('stops a quiet session whose last turn already produced its answer', () => {
    const status = computeSessionStatus(session({ lastEntryIsThinking: false }), noOpenFiles);

    expect(status).toBe('stopped');
  });

  it('stops a session left thinking past the idle ceiling', () => {
    // A session abandoned mid-turn must not spin forever.
    const stale = session({
      lastEntryIsThinking: true,
      lastInteractionTime: Date.now() - THIRTY_ONE_MINUTES,
    });

    expect(computeSessionStatus(stale, noOpenFiles)).toBe('stopped');
  });

  it('reports working right after a write, before any heuristic is consulted', () => {
    const status = computeSessionStatus(session({ lastInteractionTime: Date.now() - 5_000 }), noOpenFiles);

    expect(status).toBe('working');
  });

  it('reports working while a subagent never reported completion', () => {
    const withAgent = session({
      subagents: [{ id: 'toolu_1', name: 'explorer', task: 'map the codebase', status: 'working' }],
    });

    expect(computeSessionStatus(withAgent, noOpenFiles)).toBe('working');
  });

  it('still reports working for a user turn awaiting a reply', () => {
    const status = computeSessionStatus(session({ lastEntryType: 'user' }), noOpenFiles);

    expect(status).toBe('working');
  });

  it('stops a session whose last turn was the user interrupting Claude', () => {
    // Claude Code writes an Esc-interruption as a `type: 'user'` turn, so lastEntryType alone
    // can't tell it apart from a real prompt still awaiting a reply — that's what
    // lastEntryIsInterruption is for. Without it, an interrupted session read as 'working' for
    // up to IDLE_CEILING (30 min) after the user killed it.
    const status = computeSessionStatus(session({ lastEntryType: 'user', lastEntryIsInterruption: true }), noOpenFiles);

    expect(status).toBe('stopped');
  });

  it('reports working for an interrupted session that still has a subagent running', () => {
    // hasRunningAgents sits in the same OR as awaitingReply, independent of it — a background
    // agent survives the Esc that killed the main turn and must keep the session visible.
    const status = computeSessionStatus(
      session({
        lastEntryType: 'user',
        lastEntryIsInterruption: true,
        subagents: [{ id: 'toolu_1', name: 'explorer', task: 'map the codebase', status: 'working' }],
      }),
      noOpenFiles,
    );

    expect(status).toBe('working');
  });

  it('stops a session left awaiting a reply past the idle ceiling', () => {
    // Mirrors 'stops a session left thinking past the idle ceiling' above: a genuine unanswered
    // user turn must not spin forever either.
    const stale = session({
      lastEntryType: 'user',
      lastInteractionTime: Date.now() - THIRTY_ONE_MINUTES,
    });

    expect(computeSessionStatus(stale, noOpenFiles)).toBe('stopped');
  });

  it('reports working when the log file is held open, whatever the heuristics say', () => {
    const stale = session({ lastInteractionTime: Date.now() - THIRTY_ONE_MINUTES });
    // getOpenLogFiles normalizes every path it puts in this set, and computeSessionStatus
    // normalizes before looking one up — so the fixture has to normalize too. Without it the
    // POSIX-shaped fixture path never matched its own backslash-normalized form on Windows.
    const open = new Set([path.normalize(stale.logFilePath)]);

    expect(computeSessionStatus(stale, open)).toBe('working');
  });
});

describe('getOpenLogFiles', () => {
  const originalPlatform = process.platform;

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
    vi.mocked(exec).mockClear();
  });

  it('resolves to an empty set and never spawns a subprocess on win32 (no lsof there)', async () => {
    // Regression test: lsof doesn't exist on Windows, so getOpenLogFiles must short-circuit
    // before ever building a command or shelling out — spawning a doomed subprocess on every
    // refresh would be wasted work at best.
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });

    const result = await getOpenLogFiles('/home/user');

    expect(result).toEqual(new Set());
    expect(exec).not.toHaveBeenCalled();
  });

  it('shells out to lsof on non-Windows platforms', async () => {
    Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });

    await getOpenLogFiles('/home/user');

    expect(exec).toHaveBeenCalledTimes(1);
  });
});
