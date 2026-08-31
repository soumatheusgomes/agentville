import * as fs from 'fs';
import * as path from 'path';
import { LogEntry } from './transcriptEntry';
import { Session } from './types';

/**
 * Works out the repo context a transcript belongs to: which project, which git branch, and
 * (Claude Code only) which git worktree.
 *
 * Neither brand states the project outright. Claude Code encodes the project directory into the
 * folder name and stamps the real `cwd` on every entry; Antigravity states it only inside prose
 * fields ("Active Document: …") or a tool call's `Cwd`. Both cases fall back to walking up the
 * file system for a project marker. Branch and worktree name are simpler — Claude Code stamps
 * `gitBranch` directly, and a `worktree-state` entry's `worktreeSession.worktreeName` needs no
 * decoding. All three are kept out of LogParser because none of it depends on the incremental-read
 * machinery — it only ever looks at one entry, or one path, at a time.
 */
export class ProjectPathResolver {
  private decodedPathCache = new Map<string, string>();

  /** Fill in `session.projectPath` from whatever this entry reveals. Silent when it reveals nothing. */
  public detectProjectPath(json: LogEntry, session: Session): void {
    if (session.type === 'claude-code') {
      this.detectClaudeCodeProjectPath(json, session);
      return;
    }

    // 1. Extract from Active Document metadata in USER_INPUT
    if (json.type === 'USER_INPUT' && typeof json.content === 'string') {
      const activeDocMatch = json.content.match(/Active Document:\s*([^\n]+)/);
      if (activeDocMatch) {
        session.projectPath = this.findProjectRoot(activeDocMatch[1].trim());
        return;
      }
      const otherDocMatch = json.content.match(/Other open documents:\s*-\s*([^\n]+)/);
      if (otherDocMatch) {
        session.projectPath = this.findProjectRoot(otherDocMatch[1].trim());
        return;
      }
    }

    // 2. Extract from Cwd
    const cwd = this.extractCwd(json);
    if (cwd) {
      session.projectPath = cwd;
      return;
    }

    // 3. Extract from TargetFile
    if (json.TargetFile) {
      session.projectPath = this.findProjectRoot(json.TargetFile);
    }
  }

  public detectGitBranch(json: LogEntry, session: Session): void {
    if (json.gitBranch) {
      session.gitBranch = json.gitBranch;
    } else if (json.git && typeof json.git.branch === 'string') {
      session.gitBranch = json.git.branch;
    }
  }

  /** Tracks the bare git-worktree name from a `type:"worktree-state"` entry (real shape:
   * `{"type":"worktree-state","worktreeSession":{"worktreeName":"structured-logging",...}}`) so
   * logParser.ts's detectSessionTitle can recognize Claude Code's own later auto-stamped
   * `custom-title` (set to this same name) instead of trusting it as a real user rename. See
   * nameExtractor.ts's extractRenamedTitle.
   *
   * KNOWN LIMITATION, deliberately not "fixed": this never clears, so session.worktreeName
   * latches to the LAST worktree entered for the rest of the session's life — a later GENUINE
   * user rename that happens to coincide with a past worktree's name would be wrongly rejected as
   * an auto-stamp echo. A clearing rule keyed on "relocated back to a bare, non-worktree cwd" was
   * tried and reverted: real evidence (session `7ac34ece-fdce-41ad-9898-886d832035ec`) shows
   * Claude Code can relocate a session OUT of a worktree to a bare cwd and then back — a worktree-state
   * entry with `worktreeSession: null` in between — while STILL re-stamping the identical
   * customTitle auto-echo afterward. Clearing on that "exit" signal made the SECOND, still-bogus
   * auto-stamp get wrongly ACCEPTED as a real rename instead — reopening a worse form of the very
   * bug this function exists to prevent. No reliable "permanently left this worktree" signal was
   * found in the real corpus, so per this project's own architecture-no-public-transcript-schema
   * lesson (don't speculatively engineer for a case real data doesn't confirm), the one-way latch
   * stays as the deliberately-narrower, safer default. */
  public detectWorktreeName(json: LogEntry, session: Session): void {
    if (typeof json.worktreeSession?.worktreeName === 'string') {
      session.worktreeName = json.worktreeSession.worktreeName;
    }
  }

  /**
   * Best-effort reconstruction of a real path from Claude Code's encoded project-directory name.
   * Only a fallback: `detectProjectPath` prefers the transcript's own `cwd`, because the encoding
   * collapses every non-alphanumeric character — including `_` and `.` — onto the same `-` as the
   * path separator, making it ambiguous to decode. Walks the file system to disambiguate.
   */
  public decodeClaudeProjectPath(projectDir: string): string {
    const encoded = this.splitEncodedRoot(projectDir);
    if (!encoded) return projectDir;
    const cached = this.decodedPathCache.get(projectDir);
    if (cached !== undefined) return cached;

    const decoded = this.walkAmbiguousSegments(encoded.root, encoded.rest.split('-'));
    this.decodedPathCache.set(projectDir, decoded);
    return decoded;
  }

  /**
   * Walk `parts` down from `root`, greedily rejoining as many segments as still name a directory
   * that exists — that is what disambiguates a '-' that was a path separator from one that was a
   * character inside a folder name.
   */
  private walkAmbiguousSegments(root: string, parts: string[]): string {
    let currentPath = root;
    let i = 0;
    while (i < parts.length) {
      let foundNext = false;
      for (let len = parts.length - i; len > 0; len--) {
        const candidate = path.join(currentPath, parts.slice(i, i + len).join('-'));
        if (fs.existsSync(candidate)) {
          currentPath = candidate;
          i += len;
          foundNext = true;
          break;
        }
      }
      if (!foundNext) {
        currentPath = path.join(currentPath, parts[i]);
        i++;
      }
    }
    return currentPath;
  }

  /**
   * Split an encoded project-directory name into the filesystem root it starts from and the
   * remaining, still-ambiguous segments — or null when the name isn't an encoded path at all.
   *
   * Both platforms encode the root, just differently: a POSIX cwd starts with '/', which collapses
   * to a single leading '-' (`-Users-me-app`); a Windows cwd starts with a drive letter and ':\',
   * whose two non-alphanumeric characters collapse to '--' (`C--Dev-REPZ` for `C:\Dev\REPZ`).
   * Recognising only the POSIX form left the Windows walk unseeded, so decoding returned the raw
   * encoded name and the tree showed `C--Dev-REPZ` as the project path.
   */
  private splitEncodedRoot(projectDir: string): { root: string; rest: string } | null {
    if (projectDir.startsWith('-')) {
      return { root: '/', rest: projectDir.substring(1) };
    }
    const windowsDrive = /^([A-Za-z])--(.*)$/.exec(projectDir);
    return windowsDrive ? { root: `${windowsDrive[1]}:\\`, rest: windowsDrive[2] } : null;
  }

  private detectClaudeCodeProjectPath(json: LogEntry, session: Session): void {
    // The project-directory name Claude Code encodes to (e.g. `-Users-me-aia_harness` for
    // `/Users/me/aia_harness`) is ambiguous to decode: every non-alphanumeric character,
    // including `_` and `.`, collapses to the same `-` as the path separator. The transcript's
    // own `cwd` field carries the real, unambiguous path — always prefer it over the guess.
    if (typeof json.cwd === 'string' && json.cwd.trim()) {
      session.projectPath = json.cwd.trim();
      session.projectName = path.basename(session.projectPath) || session.projectName;
    }
  }

  private extractCwd(json: LogEntry): string | null {
    if (json.Cwd) {
      return json.Cwd;
    }

    if (json.tool_calls && Array.isArray(json.tool_calls)) {
      for (const tc of json.tool_calls) {
        const cwd = tc.Cwd || tc.arguments?.Cwd || tc.Arguments?.Cwd;
        if (cwd) {
          return cwd;
        }
      }
    }

    return null;
  }

  private findProjectRoot(filePath: string): string {
    try {
      let current = path.dirname(filePath);
      // `path.dirname` returns the root unchanged once it reaches it ('/' on POSIX, 'C:\' on
      // Windows), so the loop must stop at the parsed root or it spins forever — and this runs
      // synchronously on the extension host thread.
      // `current.length > 1` is NOT redundant next to that check: a relative path parses to a
      // root of '' and bottoms out at '.', which the root comparison alone never catches.
      while (current && current.length > 1 && current !== path.parse(current).root) {
        if (
          fs.existsSync(path.join(current, '.git')) ||
          fs.existsSync(path.join(current, '.claude')) ||
          fs.existsSync(path.join(current, '.agents')) ||
          fs.existsSync(path.join(current, 'package.json'))
        ) {
          return current;
        }
        current = path.dirname(current);
      }
    } catch {
      // Ignore filesystem check errors
    }
    return path.dirname(filePath);
  }
}
