/**
 * Claude Code writes its own version onto every transcript line (`version` field, e.g. "2.1.220").
 * The parser depends on the transcript's shape (field names, how slash commands / titles / subagents
 * are recorded), which changes between Claude Code releases. We pin the version this extension was
 * last validated against; when a newer one shows up in the logs we warn once so the format can be
 * re-checked instead of silently mis-parsing.
 *
 * Bump this after validating the parser against a new Claude Code release.
 *
 * Last validated 2026-08-31 against a real Windows corpus of 111 transcripts spanning 2.1.197 →
 * 2.1.227 (30 of them with subagents): every file parsed without error, 108 sessions resolved a
 * model, and every project path decoded to a real directory. 2.1.227 is the newest version that
 * corpus actually contained — deliberately not bumped to the installed CLI version, since a
 * release with no transcripts on disk has validated nothing.
 */
export const KNOWN_COMPATIBLE_CLAUDE_VERSION = '2.1.227';

/** Compare two dotted numeric versions. Returns -1 if a < b, 1 if a > b, 0 if equal. Non-numeric
 * or missing segments compare as 0, so "2.1" == "2.1.0". Never throws. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.');
  const pb = b.split('.');
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const na = parseInt(pa[i] ?? '0', 10) || 0;
    const nb = parseInt(pb[i] ?? '0', 10) || 0;
    if (na !== nb) return na < nb ? -1 : 1;
  }
  return 0;
}

/** True when `seen` is a newer Claude Code version than the one the extension was validated against. */
export function isNewerThanCompatible(seen: string): boolean {
  return compareVersions(seen, KNOWN_COMPATIBLE_CLAUDE_VERSION) > 0;
}
