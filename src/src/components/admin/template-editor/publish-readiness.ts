/**
 * Wave ED2 Safe-to-Publish (spec 19ad). Pure, client-side, zero db imports.
 * Evaluates a live editor draft (already assembled by buildVersionScoringPayload)
 * for publish-readiness:
 *   - Prevent = the SAME getPublishValidationIssues the publish route runs
 *     (C1 — no second code path).
 *   - Warn = advisory STRUCTURAL nudges, computed from the raw payload
 *     INDEPENDENTLY of Prevent (C4 — safeParse yields no data on any failure,
 *     so warnings must not be gated on parse-success).
 */
import { getPublishValidationIssues } from "@/lib/assessments/scoring";

export interface ReadinessIssue {
  path: (string | number)[];
  message: string;
}

export interface PublishReadiness {
  prevent: ReadinessIssue[];
  warn: ReadinessIssue[];
}

interface BuiltVersion {
  questions: unknown;
  sections: unknown;
  scoringConfig: unknown;
}

export function evaluatePublishReadiness(built: BuiltVersion): PublishReadiness {
  // zod's ZodIssue.path is PropertyKey[] (incl. symbol); this schema never
  // emits symbol path segments, so the narrowing cast is safe.
  const prevent: ReadinessIssue[] = getPublishValidationIssues(built).map((i) => ({
    path: i.path as (string | number)[],
    message: i.message,
  }));
  return { prevent, warn: computeWarnings(built) };
}

/**
 * Two structural warnings, both publish-legal (never block). Reads the raw
 * built payload defensively; a field too malformed to read is skipped (Prevent
 * will already carry that structural issue).
 */
export function computeWarnings(built: BuiltVersion): ReadinessIssue[] {
  const out: ReadinessIssue[] = [];
  const questions = Array.isArray(built.questions) ? built.questions : [];
  const sections = Array.isArray(built.sections) ? built.sections : [];

  // Warn 1 — empty section: a section referenced by zero questions.
  const referenced = new Set<string>();
  for (const q of questions) {
    const key = readSectionKey(q);
    if (key) referenced.add(key);
  }
  sections.forEach((s, i) => {
    const key = readStableKey(s);
    if (key && !referenced.has(key)) {
      out.push({
        path: ["sections", i],
        message: `Section "${readName(s) ?? key}" has no questions.`,
      });
    }
  });

  // Warn 2 — unassigned question: blank/absent sectionStableKey ("Other" bucket).
  questions.forEach((q, i) => {
    if (!readSectionKey(q)) {
      out.push({
        path: ["questions", i, "sectionStableKey"],
        message: `Question "${readStableKey(q) ?? i}" is not assigned to a section (renders under "Other").`,
      });
    }
  });

  return out;
}

function asRecord(x: unknown): Record<string, unknown> | null {
  return x !== null && typeof x === "object" ? (x as Record<string, unknown>) : null;
}
function readSectionKey(q: unknown): string {
  const raw = asRecord(q)?.sectionStableKey;
  return typeof raw === "string" ? raw.trim() : "";
}
function readStableKey(x: unknown): string | null {
  const v = asRecord(x)?.stableKey;
  return typeof v === "string" ? v : null;
}
function readName(x: unknown): string | null {
  const r = asRecord(x);
  const v = r?.name ?? r?.title ?? r?.label;
  return typeof v === "string" ? v : null;
}
