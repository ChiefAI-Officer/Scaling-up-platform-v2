/**
 * Assessment v7.6 — canonical content-hash for AssessmentTemplateVersion rows.
 *
 * Mirrors the hash computed by `prisma/seed-rockefeller-assessment.ts`. Key
 * order is FIXED and MUST match across writers so the hash is stable across
 * seed runs vs admin-UI writes vs migration scripts.
 *
 * IMPORTANT: do NOT pretty-print, sort, or add whitespace. The hash is the
 * sha256 of `JSON.stringify({ questions, sections, scoringConfig, reportConfig,
 * invitationSubject, invitationBodyMarkdown })` in that exact key order.
 */

import { createHash } from "crypto";

export interface ContentHashInput {
  questions: unknown;
  sections: unknown;
  scoringConfig: unknown;
  reportConfig: unknown;
  invitationSubject: string;
  invitationBodyMarkdown: string;
}

export function computeTemplateContentHash(input: ContentHashInput): string {
  const canonical = {
    questions: input.questions,
    sections: input.sections,
    scoringConfig: input.scoringConfig,
    reportConfig: input.reportConfig,
    invitationSubject: input.invitationSubject,
    invitationBodyMarkdown: input.invitationBodyMarkdown,
  };
  return createHash("sha256")
    .update(JSON.stringify(canonical))
    .digest("hex");
}
