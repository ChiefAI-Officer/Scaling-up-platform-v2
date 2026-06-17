/**
 * Assessment v7.6 (Wave D, SEC-H2) — results-email approval bound to a content hash.
 *
 * The F0 "Results Email" approval used to be a bare boolean
 * (`resultsEmailContentApproved`) on the mutable `AssessmentTemplate`. An admin
 * could approve content X, then edit the subject/body to Y WITHOUT the approval
 * clearing — so unapproved copy Y could be sent.
 *
 * Fix: bind the approval to a sha256 hash of the EXACT approved content. The
 * PATCH handler clears the approval whenever content is edited without
 * re-approving, and stores the hash of the post-update content when approving.
 * At send time, `isResultsEmailApproved` re-derives the hash from the current
 * subject/body and treats a mismatch (stale approval) as NOT approved.
 *
 * IMPORTANT: the canonicalization (JSON.stringify of the [subject, body] tuple,
 * null → "") is the load-bearing contract — every writer/reader MUST agree on
 * it or the hash will spuriously mismatch. Do not reorder or reformat.
 */

import { createHash } from "crypto";

/**
 * Stable sha256 over the exact (subject, body) pair. Null is normalized to the
 * empty string so an opted-out template (null subject/body) still hashes
 * deterministically. The two-element array keeps the subject/body boundary
 * unambiguous (so e.g. ["ab", ""] != ["a", "b"]).
 */
export function resultsEmailContentHash(
  subject: string | null,
  body: string | null,
): string {
  const canonical = JSON.stringify([subject ?? "", body ?? ""]);
  return createHash("sha256").update(canonical).digest("hex");
}

/**
 * True ONLY when the approval flag is on AND the stored hash matches the hash
 * of the current subject/body. A stale approval (content edited after approval,
 * so the hash no longer matches) reads as NOT approved — fail-closed.
 */
export function isResultsEmailApproved(t: {
  resultsEmailContentApproved: boolean;
  resultsEmailContentApprovedHash: string | null;
  resultsEmailSubject: string | null;
  resultsEmailBodyMarkdown: string | null;
}): boolean {
  if (!t.resultsEmailContentApproved) return false;
  if (!t.resultsEmailContentApprovedHash) return false;
  return (
    t.resultsEmailContentApprovedHash ===
    resultsEmailContentHash(t.resultsEmailSubject, t.resultsEmailBodyMarkdown)
  );
}
