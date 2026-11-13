# claude-agents-view-vscode

> Project memory for Claude Code. Keep this file short and high-signal —
> bloated memory gets ignored. Put hard guarantees in hooks, not prose.

## Behavioral guidelines

<!-- aia-harness:behavioral — non-negotiable; do not edit, reorder, or remove during enrichment -->

1. **Think before coding** — state assumptions explicitly; if multiple interpretations exist, present them instead of picking silently; say so when a simpler approach exists; if something is unclear, stop and ask.
2. **Simplicity first** — minimum code that solves the problem. No speculative features, no abstractions for single-use code, no unrequested configurability, no error handling for impossible scenarios. If 200 lines could be 50, rewrite.
3. **Surgical changes** — touch only what the request requires; match existing style; don't refactor, reformat, or "improve" adjacent code. Remove orphans _your_ change created; leave pre-existing dead code alone (mention it, don't delete it). Every changed line should trace directly to the user's request.
4. **Goal-driven execution** — turn tasks into verifiable goals ("fix the bug" → "write a test that reproduces it, then make it pass"). For multi-step work, state a brief plan with a verify check per step, then loop until verified.
5. **Main session = orchestrator — it does not implement.** Plan, decide, coordinate; ALL delegable implementation and analysis goes to a specialist subagent via `Agent`, parallel when scopes don't conflict.

## Stack

TypeScript, JavaScript · npm

Architecture: **layered**.

## Canonical commands

Always use these exact commands (do not guess):

- **Install:** `npm install`
- **Lint:** `npm run lint`
- **Format:** `npm run format`
- **Typecheck:** `npx tsc --noEmit`
- **Test:** `npm run test`
- **Build:** `npm run build`

## Releasing

New extension version / release / `.vsix` — "gerar nova versão da extensão", "nova
release", "empacotar/build/ship the extension" — use the **`release-vsix`** skill
(`.claude/skills/release-vsix/`): patch bump + minified build + `.vscodeignore`/bundle-size
guard + install reminder. Don't hand-run `npm run package` for a release; the skill also
verifies nothing extraneous (the harness `.claude/`, vault, `graphify-out/`…) ships.

## Workflow & Agents

Invoke `superpowers:subagent-driven-development` for **non-trivial** implementation — trigger it when the request meets **≥2** of:

- touches **3+ files** or **2+ domains/layers** (UI + agent, API + DB…)
- is a **new feature / epic / cross-cutting refactor** (not a one-line or single-function change)
- needs a **multi-step plan** or ordered tasks, each with its own verification
- has **unclear scope or root cause** and needs exploration before coding

Skip it — implement inline — for typo/copy fixes, single-function edits, config tweaks, or one-file bugs with an obvious cause.

When dispatching subagents, you MUST use the matching specialist agent from the table below — never the generic agent when a specialist is listed. Cross-reference the task type with the "When to use" column and pass the exact name as `subagent_type`.

Model dispatch: an agent's frontmatter `model` wins; a generic dispatch or a project/user agent with no `model` in frontmatter is force-set to `sonnet` by a PreToolUse hook, so it never silently inherits this session's model — except namespaced plugin agents (`plugin:name`), left unrewritten since their frontmatter isn't reliably hook-resolvable. Pass `model` explicitly yourself for those, or to override for complex work: `haiku` for search/exploration, `sonnet` for implementation, `opus` for architectural judgment — cheapest tier that fits.

| Agent                    | When to use                                                                                                                                                                                                                                                          |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `orchestrator`           | Coordinates multi-agent or cross-domain tasks by subdelegating to specialized agents. Use proactively when a task spans multiple domains or requires parallel subagent execution. MUST BE USED instead of dispatching generic agents directly for complex workflows. |
| `code-reviewer`          | Reviews any code change for bugs, security, error handling, and test coverage. Use proactively after editing any source file. MUST BE USED before merging a pull request.                                                                                            |
| `security-reviewer`      | Reviews code for OWASP Top 10 vulnerabilities, hardcoded secrets, broken auth, and dependency CVEs. Use proactively before any merge that touches auth, input handling, or secrets. MUST BE USED before shipping security-sensitive changes.                         |
| `typescript-reviewer`    | Reviews TypeScript and JavaScript code for type safety (any abuse, non-null assertions), async correctness, injection risks, and prototype pollution. Use proactively after editing .ts or .js files with no React/JSX involvement.                                  |
| `qa-automation-engineer` | Writes and maintains E2E tests (Playwright/Cypress) and CI/CD quality gates. Use proactively after new user flows are implemented or when E2E coverage is missing for a critical path.                                                                               |
| `test-engineer`          | Writes unit and integration tests with TDD discipline, coverage analysis, and edge-case discovery. Use proactively after implementing new logic or when test coverage gaps are identified.                                                                           |
| `database-architect`     | Designs schemas, migrations, indexes, and query strategies for correctness, integrity, and scalability. Use proactively when adding tables, modifying schemas, planning migrations, or diagnosing slow queries.                                                      |
| `devops-engineer`        | Owns deployment, CI/CD pipelines, infrastructure configuration, and production operations. Use proactively when deploying, configuring servers, setting up CI, or troubleshooting production incidents.                                                              |
| `backend-specialist`     | Implements and reviews API endpoints, server-side business logic, authentication, and database integration. Use proactively when building or modifying backend services, REST/GraphQL routes, or persistence layers.                                                 |
| `performance-optimizer`  | Profiles and fixes performance bottlenecks — slow endpoints, high memory usage, poor Core Web Vitals, and database query inefficiency. Use proactively after profiling reveals a bottleneck or when response times degrade.                                          |
| `product-manager`        | Clarifies ambiguous requirements and prioritizes roadmap decisions when requirements are undefined before a story exists. Use when discovery and prioritization need structured analysis.                                                                            |
| `product-owner`          | Translates business objectives into actionable technical specs and defines acceptance criteria for existing stories before implementation begins. Use when a story needs clear acceptance criteria before development starts.                                        |
| `project-planner`        | Breaks features and epics into ordered, executable tasks with clear acceptance criteria. Use proactively when starting a new feature, sprint, or significant refactor that needs a structured plan before implementation begins.                                     |
| `code-archaeologist`     | Reverse-engineers undocumented or legacy code to uncover intent, trace logic, and map hidden dependencies. Use proactively before refactoring unfamiliar legacy code or when you need to understand why existing behavior exists.                                    |
| `debugger`               | Finds the root cause of bugs, crashes, and flaky behavior through systematic, evidence-based investigation. Use proactively when a test fails or a defect is reported, before attempting a fix.                                                                      |
| `explorer-agent`         | Maps an unfamiliar or complex codebase — architecture, patterns, dependencies, and risk areas — to inform planning and integration decisions. Use proactively when onboarding to a new codebase or before planning a cross-cutting change.                           |
| `documentation-writer`   | Produces clear, example-rich technical documentation — READMEs, API docs, runbooks, and guides. Use when documentation is explicitly requested or after a feature ships and needs user-facing docs.                                                                  |
| `penetration-tester`     | Simulates attacker techniques to find exploitable vulnerabilities using PTES and OWASP methodologies. Use proactively before a security release, after adding new auth flows, or when a pentest is required.                                                         |
| `security-auditor`       | Performs defensive SAST reviews, threat modeling, and hardening recommendations using defense-in-depth principles. Use proactively before a major release or after architectural changes that touch auth, data handling, or trust boundaries.                        |

### Superpowers → Project Specialists (mandatory bridging)

<!-- aia-harness:agent-routing — superpowers→specialist bridge; do not remove -->

Superpowers skills (`superpowers:dispatching-parallel-agents`, `superpowers:subagent-driven-development`,
`superpowers:executing-plans`, `superpowers:systematic-debugging`) show `general-purpose` as the default
`subagent_type` in their examples. **Never dispatch `general-purpose` (or a generic
implementer) when a specialist below covers the domain** — pass the specialist's exact
name as `subagent_type` instead.

> Basis: superpowers itself states "User's explicit instructions (CLAUDE.md) — highest
> priority." This section applies that priority over the agent types its examples suggest.
> The normal flow is unchanged (`superpowers:brainstorming` → `superpowers:writing-plans` → `superpowers:subagent-driven-development`);
> only the dispatched `subagent_type` changes.

| When superpowers would use `general-purpose` for…  | Dispatch instead                                              |
| -------------------------------------------------- | ------------------------------------------------------------- |
| Multi-domain feature — subdelegates to specialists | `orchestrator`                                                |
| Review / audit changed code                        | `code-reviewer` / `security-reviewer` / `typescript-reviewer` |
| E2E / QA automation                                | `qa-automation-engineer`                                      |
| Unit / integration tests                           | `test-engineer`                                               |
| Schema / migration / query / data modeling         | `database-architect`                                          |
| Deploy / CI/CD / infra                             | `devops-engineer`                                             |
| Backend / API / server-side / domain logic         | `backend-specialist`                                          |
| Performance profiling / optimization               | `performance-optimizer`                                       |
| Understand legacy code before changing it          | `code-archaeologist`                                          |
| Bug / crash / root-cause analysis                  | `debugger`                                                    |
| Explore / map an unfamiliar codebase               | `explorer-agent`                                              |
| Documentation (only when explicitly requested)     | `documentation-writer`                                        |
| Offensive security / pentest                       | `penetration-tester`                                          |
| Security audit / defensive review                  | `security-auditor`                                            |

## Architecture map

Single-tree VS Code extension. Pipeline: scan log files → parse JSONL → detect
subagents → dedupe/nest → render tree. All source under `src/`:

- **extension.ts** — VS Code entrypoint: `activate`/`deactivate`, registers the tree
  view + 5 commands, gates monitoring on the `agentville.enabled` setting,
  delays the first scan ~10s so it doesn't race Claude Code for the log files.
- **sessionTreeDataProvider.ts** — orchestrator + `TreeDataProvider`: owns the session
  Map, file watchers, 15s refresh timer, `lsof` active-status detection (macOS/Linux
  only), and calls dedupe + background-agent nesting before feeding the tree.
- **sessionScanner.ts** — discovers Claude (`~/.claude/projects/**/*.jsonl`) and
  Antigravity (`~/.gemini/.../transcript.jsonl`) log files. Pure, never throws.
- **logParser.ts** — incremental JSONL parser (caches a per-file byte offset, reads
  only appended bytes); builds a `Session`, delegates title, subagent and project-path
  extraction.
- **projectPathResolver.ts** — works out which project a transcript belongs to: Claude
  Code's `cwd` (preferred) or its ambiguous, POSIX-shaped encoded directory name (raw
  name on Windows until `cwd` self-corrects it), Antigravity's prose metadata /
  tool-call `Cwd`, else walks up for a project marker.
- **sessionActivity.ts** — decides whether a session is still running (`lsof` on
  macOS/Linux only, recent write, user turn awaiting a reply, thinking-only last turn,
  or live subagents).
- **subagentDetector.ts** — detects subagent start/stop from a log entry across both
  Claude and Antigravity shapes, incl. async-launch ACK vs real `<task-notification>`.
  Three Claude launch shapes, only one of which is a `tool_use`: classic `Agent` tool,
  `<forked-skill-launch>` on a `type:"system"` entry (`context: fork` skills like
  `/code-review`), and in-process teammates (grandchildren — deliberately not detected).
  See `.claude/memory/architecture-subagent-dispatch-mechanisms.md`.
- **sidecarReader.ts** — reads the `agent-<id>.meta.json` sidecars from both candidate
  directories (the transcript's own and the one `projectPath` encodes to — they differ
  inside a worktree), dedupes across them, and caches by filename set so a refresh that
  changed nothing re-parses nothing.
- **subagentMetadata.ts** — fills a detected subagent's real name/model from the sidecar,
  joined on `toolUseId`. Runs on parse (`logParser`).
- **nestedSubagents.ts** — attaches grandchildren (subagents launched by a subagent) via
  the sidecar's `parentAgentId`, one level deep, with a best-effort mtime status. Runs on
  the refresh tick, NOT on parse: a background subagent writes only two lines to the
  parent transcript, so parse-driven refresh would go stale exactly while it works.
- **nameExtractor.ts** — derives the session title from the first real user prompt,
  skipping slash-command scaffolding and `isMeta` turns.
- **sessionDedupe.ts** — pure dedupe key, stable relevance ranking,
  background-agent → launcher matching, `applyNestedAgentLiveness` (promotes a launcher to
  'working' when its matched nested agent still is, since `computeSessionStatus` only sees
  same-file subagents), and `upsertIfMoreRelevant` (the collision-safe map insert
  `sessionTreeDataProvider` uses instead of a raw `Map.set`, so a same-id stub left by
  Claude Code's native worktree-entry can never overwrite the real session).
- **treeItems.ts** — the `vscode.TreeItem` subclasses (Brand/Session/SubAgentGroup/
  SubAgent/Message) + model-badge and relative-time formatting.
- **subagentTreeChildren.ts** — pure builders for the subagent and nested-subagent
  (grandchild) tree levels, extracted from `sessionTreeDataProvider`.
- **types.ts** — the `Session` and `SubAgent` domain shapes.
- **logger.ts** — best-effort debug append to a local file; never throws.

The office (an editor-tab webview) hangs off the same provider — no scanner or timer of its own:

- **officePanel.ts** (VS Code layer) — webview lifecycle and message pump; on each tree refresh
  reads working agents' transcripts for their current action and posts a full snapshot.
- **activityExtractor.ts** / **subagentTranscriptReader.ts** / **recentEntries.ts** /
  **officeSnapshot.ts** / **officeHtml.ts** — pure: transcript entry → bubble text, incremental
  tail-first transcript reads, bounded per-agent feed, session tree → capped cast, HTML + CSP.
- **officeTypes.ts** — the extension ↔ webview wire format; the only extension module the
  webview may import (lint-enforced).
- **webview/** — browser bundle (`dist/webview.js`, Phaser inlined). `simulation/` is pure and
  unit-tested (map, BFS pathfinding, cast reconciliation, movement, autotiling) and may not
  import Phaser or touch the DOM; `render/` is the Phaser scene; `ui/` the DOM overlays.
- **Office art** — generated by `scripts/generate-office-assets.mjs` (CC0); `esbuild.js`
  assembles it into `dist/office/`, overlaying a gitignored `resources/office-premium/` if present.

## Conventions

- **Parsing/scanning never throws** — wrap every `fs`/`JSON.parse` in try/catch that
  logs via `logDebug` and returns an empty/fallback value; a bad log line must never
  break the tree.
- **Keep `vscode` out of the parsing core** — `logParser`, `subagentDetector`,
  `nameExtractor`, `sessionDedupe`, `sessionScanner`, `projectPathResolver`, `sessionActivity`
  import no `vscode` and are
  unit-tested in `src/test/`; only `extension.ts`, `sessionTreeDataProvider.ts`,
  `treeItems.ts`, `subagentTreeChildren.ts` touch the VS Code API.
- **Parse incrementally** — `LogParser` caches a per-file byte offset and reads only
  appended bytes; never re-read a whole transcript on refresh.
- **Dedupe/ranking stays deterministic and stable** (`isMoreRelevant`) so the tree
  never oscillates between refreshes — don't replace it with naive "newest wins".
- **Comment every log-format quirk** (async-launch ACK vs real completion, sidechain
  phantoms, ambiguous project-dir decoding) — these encode observed transcript reality;
  preserve them when editing parsers/detectors.
- **Support both brands** — Claude Code and Antigravity — behind `type`-branched
  detection; new log-shape handling must cover or explicitly no-op the other brand.
- **User-facing strings are English** (view messages, `package.json` config
  descriptions); code, identifiers, comments and documentation are English too.

## Engineering rules

<!-- aia-harness:fixed — non-negotiable; do not edit, reorder, or remove during enrichment -->

- Match the style of surrounding code; do not introduce new patterns unprompted.
- Test what can break — business rules, branching logic, money/security/auth, bug regressions; skip trivial getters, wrappers, config, presentational UI (rubric: `.claude/rules/05-testing.md`).
- Run the lint + test commands above before claiming work is complete.
- Never commit secrets; keep them in gitignored env files (`.env`/`.env.local`) — `.claude/settings.local.json` is only for MCP-server credentials referenced by `.mcp.json`.
- Fix every compilation/syntax/lint error found during a session — regardless of whether you edited the file. Never leave the build broken or label errors "pre-existing, not related".
- When performing a code review (user requests it or a workflow triggers it), always use `code-reviewer` and `security-reviewer` and `typescript-reviewer`, applying the `uncle-bob-craft` skill's criteria (Dependency Rule, SOLID in context, code smells) alongside their findings.

@.claude/memory/INSTRUCTIONS.md

@.claude/memory/MEMORY.md
<!-- Generated by aia-harness. Edit freely; re-run /aia-harness:doctor to audit. -->

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:

- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
- Investigating code (file search, implementations, call sites, "where is X"): alongside graphify, dispatch specialist subagents (`model: haiku`) in parallel — never one at a time, never generic-only. Cuts investigation time.

## obsidian-vault

- **obsidian-vault** (`.claude/rules/obsidian.md`) - this project's long-term memory at `vault-obsidian/`, MCP-only access via `mcp__obsidian__*` tools, never direct file access.

Before answering anything that touches a past decision, a failed approach, or a convention spanning modules, or when resuming work from an earlier session, call `mcp__obsidian__search_notes_tool` first. See `.claude/rules/obsidian.md` for the full trigger table, write-tool traps, and access rules.
