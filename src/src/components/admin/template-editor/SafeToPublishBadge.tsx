"use client";

/**
 * Wave ED2 Safe-to-Publish badge (spec 19ad). A live, PASSIVE publish-readiness
 * readout in the editor header. Prevent = the SAME server publish gate
 * (getPublishValidationIssues, via evaluatePublishReadiness); Warn = advisory
 * structural nudges. Click to expand a grouped panel. Writes NOTHING — the
 * Publish button and the server 422 are unchanged. Soft-fails (an assembly
 * error becomes a Prevent-class note, never crashes the editor — mirrors the
 * Wave 1 Test Mode drawer). Recomputes only when its structural inputs change.
 */
import * as React from "react";
import { buildVersionScoringPayload } from "@/components/admin/template-editor/build-version-payload";
import {
  evaluatePublishReadiness,
  type PublishReadiness,
  type ReadinessIssue,
} from "@/components/admin/template-editor/publish-readiness";
import { formatIssuePath } from "@/components/admin/PublishFailureModal";
import { QuestionSerializationError } from "@/components/admin/template-editor/question-serialization";
import type { QuestionDraftRow } from "@/components/admin/template-editor/question-serialization";
import type { SectionDraft } from "@/components/admin/template-editor/SectionsCard";

export interface SafeToPublishBadgeProps {
  questions: QuestionDraftRow[];
  sections: SectionDraft[];
  rawQuestions: unknown[];
  rawSections: unknown[];
  scoringConfig: unknown;
  publishedKeys: ReadonlySet<string>;
  publishedOptionKeys: Readonly<Record<string, readonly string[]>>;
  dirty: { questions: boolean; sections: boolean };
  isDirty: boolean;
}

export function SafeToPublishBadge(props: SafeToPublishBadgeProps) {
  const [open, setOpen] = React.useState(false);

  // Debounce the heavy recompute on large instruments (spec 19ad §3.5): defer
  // the per-keystroke structural inputs so publish-readiness recomputes at idle
  // priority, keeping question authoring responsive on big templates. (The
  // parent passes stable publishedKeys/dirty identities so the memo caches on
  // unrelated re-renders — adversarial-review fix.)
  const deferredQuestions = React.useDeferredValue(props.questions);
  const deferredSections = React.useDeferredValue(props.sections);

  const readiness: PublishReadiness = React.useMemo(() => {
    try {
      const built = buildVersionScoringPayload({
        questions: deferredQuestions,
        sections: deferredSections,
        rawQuestions: props.rawQuestions,
        rawSections: props.rawSections,
        scoringConfig: props.scoringConfig,
        publishedKeys: props.publishedKeys,
        publishedOptionKeys: props.publishedOptionKeys,
        dirty: props.dirty,
      });
      return evaluatePublishReadiness(built);
    } catch (e) {
      const message =
        e instanceof QuestionSerializationError
          ? e.message
          : "Couldn't assemble this draft to check publish-readiness.";
      return { prevent: [{ path: [], message }], warn: [] };
    }
  }, [
    deferredQuestions,
    deferredSections,
    props.rawQuestions,
    props.rawSections,
    props.scoringConfig,
    props.publishedKeys,
    props.publishedOptionKeys,
    props.dirty,
  ]);

  const nPrevent = readiness.prevent.length;
  const nWarn = readiness.warn.length;
  const tone = nPrevent > 0 ? "blocker" : nWarn > 0 ? "warn" : "ready";

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        data-testid="safe-to-publish-badge"
        data-tone={tone}
        className="wf-btn wf-btn-secondary wf-btn-sm"
      >
        {badgeLabel(nPrevent, nWarn, props.isDirty)}
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="Safe to Publish"
          data-testid="safe-to-publish-panel"
          className="absolute right-0 z-50 mt-2 w-[min(520px,90vw)] rounded-lg border bg-background p-4 text-sm shadow-xl"
        >
          <IssueGroup
            title="Blocks publish"
            testid="stp-prevent"
            tone="blocker"
            issues={readiness.prevent}
            empty="No blockers — this draft passes the publish checks."
          />
          <IssueGroup
            title="Advisory"
            testid="stp-warn"
            tone="warn"
            issues={readiness.warn}
            empty="No warnings."
          />
          {props.isDirty && nPrevent === 0 && (
            <p className="mt-3 text-xs text-muted-foreground">
              Save the draft to publish these changes.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function badgeLabel(nPrevent: number, nWarn: number, isDirty: boolean): string {
  if (nPrevent > 0) {
    const blockers = `${nPrevent} blocker${nPrevent === 1 ? "" : "s"}`;
    return nWarn > 0 ? `${blockers} · ${nWarn} warning${nWarn === 1 ? "" : "s"}` : blockers;
  }
  if (nWarn > 0) return `${nWarn} warning${nWarn === 1 ? "" : "s"}`;
  return isDirty ? "Ready after save" : "Ready to publish";
}

function IssueGroup(props: {
  title: string;
  testid: string;
  tone: "blocker" | "warn";
  issues: ReadinessIssue[];
  empty: string;
}) {
  return (
    <div className="mb-3 last:mb-0" data-testid={props.testid}>
      <p className="font-medium">
        {props.tone === "blocker" ? "✗ " : "⚠ "}
        {props.title} ({props.issues.length})
      </p>
      {props.issues.length === 0 ? (
        <p className="mt-1 text-xs text-muted-foreground">{props.empty}</p>
      ) : (
        <ul className="mt-1 space-y-2">
          {props.issues.map((issue, idx) => (
            <li
              key={idx}
              className={
                props.tone === "blocker"
                  ? "rounded-md border border-destructive/30 bg-destructive/5 p-2"
                  : "rounded-md border border-amber-500/30 bg-amber-500/5 p-2"
              }
            >
              <div className="font-mono text-xs text-muted-foreground">
                {formatIssuePath(issue.path)}
              </div>
              <div className="mt-0.5">{issue.message}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
