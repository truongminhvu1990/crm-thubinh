import { createHash } from "crypto";
import { FacebookLivePostCommentData } from "@/lib/facebookTools/facebookGraphClient";

/** Phase 2F — pure, side-effect-free text comparison. Every function here
 * only ever answers "does this content exist on the post," never "who
 * wrote it" — no identity inference anywhere in this module. */

/** Used for the Exact Match verdict itself. Diacritics are deliberately
 * PRESERVED (PO-locked, architecture review): folding them away risks a
 * false match between genuinely different Vietnamese words that happen to
 * share base letters — too risky to use for a verdict. */
export function normalizeStrict(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Used ONLY to rank AI candidates — never a verdict by itself (PO-locked).
 * Diacritic-insensitive, emoji/punctuation-stripped, so genuinely different
 * phrasing of the same idea still scores some overlap for the AI to
 * consider. */
export function normalizeLoose(text: string): string {
  return text
    .normalize("NFD")
    .replace(new RegExp("[\\u0300-\\u036f]", "g"), "")
    .replace(/\p{Extended_Pictographic}/gu, "")
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export function tokenOverlapScore(a: string, b: string): number {
  const tokensA = new Set(normalizeLoose(a).split(" ").filter(Boolean));
  const tokensB = new Set(normalizeLoose(b).split(" ").filter(Boolean));
  if (tokensA.size === 0 || tokensB.size === 0) return 0;
  let overlap = 0;
  for (const t of tokensA) if (tokensB.has(t)) overlap++;
  return overlap / Math.max(tokensA.size, tokensB.size);
}

export interface DeterministicMatchResult {
  outcome: "Exact Match" | "No Deterministic Match";
  matchedCommentId: string | null;
  matchedSnippet: string | null;
  /** >1 means multiple comments share identical normalized text — still an
   * Exact Match content-wise (this system never claims identity, so which
   * literal instance it is doesn't matter), kept only for audit context. */
  matchCount: number;
}

export function findExactMatch(assignedCommentText: string, comments: FacebookLivePostCommentData[]): DeterministicMatchResult {
  const target = normalizeStrict(assignedCommentText);
  const hits = comments.filter((c) => c.message && normalizeStrict(c.message) === target);
  if (hits.length === 0) {
    return { outcome: "No Deterministic Match", matchedCommentId: null, matchedSnippet: null, matchCount: 0 };
  }
  return { outcome: "Exact Match", matchedCommentId: hits[0].id, matchedSnippet: hits[0].message ?? null, matchCount: hits.length };
}

export const AI_CANDIDATE_LIMIT = 5;

/** Ranks candidates by loose token-overlap for the AI prompt — a
 * pre-filter only, never a verdict (PO-locked). Comments with no message
 * text are excluded (nothing to compare). */
export function rankAiCandidates(
  assignedCommentText: string,
  comments: FacebookLivePostCommentData[],
  limit: number = AI_CANDIDATE_LIMIT
): FacebookLivePostCommentData[] {
  return comments
    .filter((c) => !!c.message?.trim())
    .map((c) => ({ comment: c, score: tokenOverlapScore(assignedCommentText, c.message!) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.comment);
}

export function hashText(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

/** Idempotency key input (§7): hash of the assigned comment_text as it
 * currently reads, normalized so a purely cosmetic edit (extra whitespace)
 * doesn't spuriously invalidate an existing result. */
export function hashCommentText(commentText: string): string {
  return hashText(normalizeStrict(commentText));
}

/** Idempotency key input (§7): a canonical hash of the exact evidence set a
 * result was computed against — informational/audit only (see service
 * docstring for why this isn't itself a live skip gate). */
export function hashEvidenceSnapshot(comments: FacebookLivePostCommentData[]): string {
  const canonical = comments
    .map((c) => `${c.id}:${normalizeStrict(c.message ?? "")}`)
    .sort()
    .join("|");
  return hashText(canonical);
}
