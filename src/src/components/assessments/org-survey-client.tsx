"use client";

/**
 * Assessment v7.6 — INVITED-mode survey client (Task D).
 *
 * Lifecycle:
 *   1. On mount: read window.location.hash (`#t=<rawToken>`).
 *   2. POST { token } → ./exchange. Strip the fragment on success.
 *   3. GET ./me → fetch form data.
 *   4. Render SLIDER_LIKERT inputs; submit POST → ./submit.
 *   5. On 200, redirect to ./thank-you.
 *
 * Errors render inline. 410 ⇒ "This survey has closed.", 404 ⇒ "Invalid link.",
 * 401 ⇒ "Your session expired."
 */

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { SectionPager } from "./section-pager";
import {
  buildSectionPages,
  isAnswered,
  type PagerSection,
  type PagerQuestion,
} from "@/lib/assessments/section-pages";
import {
  useAnswerDraft,
  invitedDraftKey,
} from "@/lib/assessments/use-answer-draft";
import { pruneAnswersToQuestions } from "@/lib/assessments/prune-answers";
import {
  filterVisibleSurveyQuestions,
  visibleSurveyQuestionKeys,
} from "@/lib/assessments/form-visibility";
import {
  WelcomeShellHeader,
  WelcomeExpectations,
  WelcomeStats,
  deriveScaleLabel,
  deriveTimeEstimate,
} from "@/components/assessments/assessment-welcome";
import { formatTimestampDateTime } from "@/lib/utils";

// Wave J-1 — SU-Full CEO-only background section gating.
const SU_FULL_ALIAS = "scaling-up-full";
const SU_FULL_BACKGROUND_SECTION = "S_BACKGROUND";

interface ScaleConfig {
  min: number;
  max: number;
  step: number;
  anchorMin: string;
  anchorMax: string;
}

interface Question {
  stableKey: string;
  sortOrder: number;
  type: string;
  label: string;
  helpText?: string;
  sectionStableKey?: string;
  isRequired: boolean;
  scale?: ScaleConfig;
  options?: Array<{ key: string; label: string }>;
  maxChoices?: number;
}

interface Section {
  stableKey: string;
  sortOrder: number;
  name: string;
  description?: string;
  partLabel?: string;
}

interface SurveyData {
  // Opaque per-respondent id (the invitation cuid) surfaced by /me. Used ONLY
  // to key the localStorage autosave draft per-respondent so two invitees of
  // the same campaign on a shared device never cross-hydrate each other.
  respondentKey?: string;
  // Wave J-1: whether THIS respondent is the campaign CEO. Drives the SU-Full
  // CEO-only behavior — the S_BACKGROUND page (CEO FTE questions) is shown only
  // to the CEO, and the growth-phase interstitial fires only for the CEO.
  isCEO?: boolean;
  campaign: {
    name: string;
    alias: string;
    templateAlias?: string | null;
    organizationName?: string | null;
    /** Task 6b: when true, append ?results=1 to the thank-you redirect. */
    sendResultsToRespondent?: boolean;
  };
  version: { language: string };
  sections: Section[];
  questions: Question[];
}

type Phase =
  | { kind: "exchanging" }
  | { kind: "loading" }
  | { kind: "intro"; data: SurveyData }
  | { kind: "ready"; data: SurveyData }
  | { kind: "submitting"; data: SurveyData }
  | { kind: "error"; message: string };

export function OrgSurveyClient({ campaignAlias }: { campaignAlias: string }) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>({ kind: "exchanging" });
  const [answers, setAnswers] = useState<Record<string, number | string | string[]>>({});
  // Inline submit error shown ON the pager (R2-M1) — a failed submit no longer
  // dead-ends the participant on the terminal error phase.
  const [submitError, setSubmitError] = useState<string | null>(null);

  // localStorage autosave for the invited respondent. The hook must run
  // unconditionally at the top level (Rules of Hooks), before any phase-based
  // early return. Key the draft by the OPAQUE per-respondent id from /me (the
  // invitation cuid) — NOT the campaign alias — so two invitees of the same
  // campaign on a shared device never collide. draftKey is null until /me
  // loads; the hook no-ops while null and hydrates on the null → value
  // transition.
  const surveyData =
    phase.kind === "intro" ||
    phase.kind === "ready" ||
    phase.kind === "submitting"
      ? phase.data
      : null;
  const draftKey = surveyData?.respondentKey
    ? invitedDraftKey(surveyData.respondentKey)
    : null;
  const { clearDraft } = useAnswerDraft(draftKey, answers, setAnswers);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        const hash =
          typeof window !== "undefined" ? window.location.hash || "" : "";
        const tokenMatch = hash.match(/^#t=(.+)$/);

        if (tokenMatch) {
          const token = tokenMatch[1];
          const exchangeRes = await fetch(`/org-survey/${campaignAlias}/exchange`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            cache: "no-store",
            body: JSON.stringify({ token }),
          });

          if (!exchangeRes.ok) {
            const message = await readError(exchangeRes, "Invalid link.");
            if (!cancelled) {
              setPhase({ kind: "error", message });
            }
            return;
          }

          // Clear the fragment so reloads don't re-exchange.
          if (typeof window !== "undefined") {
            window.history.replaceState(
              null,
              "",
              window.location.pathname + window.location.search
            );
          }
        }

        if (cancelled) return;
        setPhase({ kind: "loading" });

        const meRes = await fetch(`/org-survey/${campaignAlias}/me`, {
          method: "GET",
          credentials: "include",
          cache: "no-store",
        });
        if (!meRes.ok) {
          const message = await readError(meRes, "Your session expired.");
          if (!cancelled) setPhase({ kind: "error", message });
          return;
        }
        const meBody = (await meRes.json()) as {
          success: boolean;
          data: SurveyData;
        };
        if (!meBody.success) {
          if (!cancelled)
            setPhase({ kind: "error", message: "Failed to load survey." });
          return;
        }
        if (!cancelled) setPhase({ kind: "intro", data: meBody.data });
      } catch (err) {
        console.error("[org-survey] init failed", err);
        if (!cancelled)
          setPhase({
            kind: "error",
            message: "Something went wrong. Please try the link again.",
          });
      }
    }
    void run();

    return () => {
      cancelled = true;
    };
  }, [campaignAlias]);

  // Wave J-1: the SU-Full CEO background section is shown ONLY to the CEO. For
  // every other respondent (team members) we DROP the whole S_BACKGROUND
  // section and its questions at the source, so the welcome stats, visibility,
  // pager, and section/progress counts all stay consistent — team members never
  // see (nor answer) the CEO FTE questions.
  const isCEO = surveyData?.isCEO === true;
  const dropBackground = surveyData?.campaign.templateAlias === SU_FULL_ALIAS && !isCEO;

  const sortedSections = useMemo<Section[]>(() => {
    if (
      phase.kind !== "intro" &&
      phase.kind !== "ready" &&
      phase.kind !== "submitting"
    )
      return [];
    return [...phase.data.sections]
      .filter((s) => !(dropBackground && s.stableKey === SU_FULL_BACKGROUND_SECTION))
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }, [phase, dropBackground]);

  const sortedQuestions = useMemo<Question[]>(() => {
    if (
      phase.kind !== "intro" &&
      phase.kind !== "ready" &&
      phase.kind !== "submitting"
    )
      return [];
    return [...phase.data.questions]
      .filter(
        (q) => !(dropBackground && q.sectionStableKey === SU_FULL_BACKGROUND_SECTION),
      )
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }, [phase, dropBackground]);

  // Welcome stat chips + expectation copy derive from the ACTUAL data.
  const scaleLabel = useMemo(() => deriveScaleLabel(sortedQuestions), [sortedQuestions]);
  const timeEstimate = useMemo(
    () => deriveTimeEstimate(sortedQuestions.length),
    [sortedQuestions.length],
  );
  const templateAlias = surveyData?.campaign.templateAlias ?? null;
  const visibleQuestions = useMemo<Question[]>(
    () =>
      filterVisibleSurveyQuestions({
        templateAlias,
        questions: sortedQuestions as PagerQuestion[],
        answers,
      }) as Question[],
    [templateAlias, sortedQuestions, answers],
  );

  // The set of stableKeys that map to a currently-rendered question. Used both
  // to prune a stale localStorage draft on hydrate AND to prune the POST body
  // pre-submit (Wave C R3-M2) so an answer whose question no longer exists can
  // never reach the server and trap the user.
  const knownKeys = useMemo(
    () =>
      visibleSurveyQuestionKeys({
        templateAlias,
        questions: sortedQuestions as PagerQuestion[],
        answers,
      }),
    [templateAlias, sortedQuestions, answers],
  );

  // Hydrate prune (secondary): once questions are known, prune the answer state
  // once to the known set. The same-ref guard in pruneAnswersToQuestions means
  // this no-ops (no setState) when nothing is stale, so it can't loop.
  useEffect(() => {
    if (knownKeys.size === 0) return;
    // Safe one-shot reconciliation: the same-ref guard in pruneAnswersToQuestions
    // makes this a no-op (no state change) once nothing is stale, so it cannot
    // cascade or loop. Mirrors the ref-routed setState the autosave hook performs.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAnswers((prev) => pruneAnswersToQuestions(prev, knownKeys));
  }, [knownKeys]);

  async function handleSubmit() {
    if (phase.kind !== "ready") return;
    setSubmitError(null);

    const required = visibleQuestions.filter((q) => q.isRequired);
    const missing = required
      .filter((q) => !isAnswered(answers[q.stableKey]))
      .map((q) => q.label);
    if (missing.length > 0) {
      // Inline recovery (R2-M1 parity): a still-unanswered required question must
      // NOT dead-end the participant on the terminal error phase. Keep them on the
      // pager (ready phase) with the inline alert so they can fix the answer in
      // place — mirrors the public quiz client, which handles this non-terminally.
      setSubmitError(
        `Please answer all required questions before submitting (${missing.length} missing).`
      );
      return;
    }

    // The submit route rejects an empty `answers` array (EMPTY_ANSWERS 400),
    // so even an all-optional survey must have ≥1 answered question before we
    // POST. Mirrors the public quiz client guard. Surface this inline (non-terminal)
    // so the participant stays on the pager and can answer a question.
    const pruned = pruneAnswersToQuestions(answers, knownKeys);
    const answeredCount = Object.values(pruned).filter((v) =>
      isAnswered(v)
    ).length;
    if (answeredCount === 0) {
      setSubmitError("Please answer at least one question before submitting.");
      return;
    }

    // Pre-submit prune (R3-M2): drop any answer whose stableKey isn't a
    // currently-rendered question (a stale localStorage draft) so it can't
    // reach the server. Persist the pruned map back if it changed so the local
    // state + autosaved draft stay in sync.
    if (pruned !== answers) setAnswers(pruned);

    const submittingData = phase.data;
    setPhase({ kind: "submitting", data: submittingData });

    try {
      const submitRes = await fetch(`/org-survey/${campaignAlias}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        cache: "no-store",
        body: JSON.stringify({
          answers: Object.entries(pruned).map(([stableKey, value]) => ({
            stableKey,
            value,
          })),
        }),
      });
      if (!submitRes.ok) {
        // Submit-error recovery (R2-M1): a failed submit must NOT dead-end the
        // participant on a terminal error screen. Drop back to the pager
        // (ready phase) and surface the message inline so they can retry.
        const message = await readError(submitRes, "Failed to submit.");
        setSubmitError(message);
        setPhase({ kind: "ready", data: submittingData });
        return;
      }
      clearDraft();
      // Task 6b: append ?results=1 so the thank-you page shows confirming copy
      // when the campaign is configured to email results to respondents.
      // `submittingData` is captured at the top of this function — use it
      // directly to avoid TypeScript narrowing issues with `phase.kind`.
      const resultsParam =
        submittingData.campaign?.sendResultsToRespondent ? "?results=1" : "";
      router.push(`/org-survey/${campaignAlias}/thank-you${resultsParam}`);
    } catch (err) {
      console.error("[org-survey] submit failed", err);
      setSubmitError("Something went wrong. Please try again.");
      setPhase({ kind: "ready", data: submittingData });
    }
  }

  if (phase.kind === "exchanging" || phase.kind === "loading") {
    return (
      <div className="ty-page">
        <header className="ty-header">
          <span className="ty-brand">Scaling Up</span>
          <span>Loading…</span>
        </header>
        <main className="ty-body">
          <section className="ty-card">
            <span className="hero-eyebrow">Loading</span>
            <h1 className="ty-title">Opening your survey…</h1>
            <p className="ty-lede">One moment while we verify your link.</p>
          </section>
        </main>
        <footer className="ty-footer">Powered by Scaling Up</footer>
      </div>
    );
  }

  if (phase.kind === "error") {
    return (
      <div className="ty-page">
        <header className="ty-header">
          <span className="ty-brand">Scaling Up</span>
          <span>Survey link error</span>
        </header>
        <main className="ty-body">
          <section className="ty-card">
            <span className="hero-eyebrow">Notice</span>
            <h1 className="ty-title">We can&apos;t open this survey</h1>
            <p className="ty-lede">{phase.message}</p>
          </section>
        </main>
        <footer className="ty-footer">Powered by Scaling Up</footer>
      </div>
    );
  }

  if (phase.kind === "intro") {
    // Screen 1 — de-bared WELCOME / invitation (approved participant mockup).
    // Branded app-shell header + "what to expect" value-prop list + stat chips
    // (actual counts + derived scale) + strong purple CTA. INVITED copy: team
    // framing, shared with the facilitator/coach.
    const orgName = phase.data.campaign.organizationName ?? undefined;
    return (
      <div className="su-welcome-page">
        <WelcomeShellHeader caption={orgName ?? "Team Assessment"} />
        <main className="su-welcome-body">
          <section className="su-welcome-card" aria-labelledby="invite-title">
            <span className="su-welcome-eyebrow">You&apos;re invited</span>
            <h1 className="su-welcome-title" id="invite-title">
              {phase.data.campaign.name}
            </h1>
            <p className="su-welcome-lede">
              A quick, confidential check on how your team works together. You
              can answer in one sitting or come back later — your link stays
              active.
            </p>
            <WelcomeExpectations
              timeLabel={timeEstimate}
              questionCount={sortedQuestions.length}
              scaleLabel={scaleLabel}
              confidentialSub="Your individual answers feed the team picture."
              scoresSub="See where the team stands across each category."
            />
            <WelcomeStats
              questionCount={sortedQuestions.length}
              sectionCount={sortedSections.length}
              scaleLabel={scaleLabel}
            />
            <div className="su-welcome-cta-row">
              <button
                type="button"
                onClick={() => setPhase({ kind: "ready", data: phase.data })}
                className="su-welcome-cta"
              >
                Start the assessment →
              </button>
            </div>
            <p className="su-welcome-fine">
              Shared with your facilitator or coach to discuss as a team.
            </p>
          </section>
        </main>
        <footer className="su-welcome-foot">Powered by Scaling Up</footer>
      </div>
    );
  }

  const submitting = phase.kind === "submitting";
  const data = phase.data;

  // One section per screen via the shared SectionPager. buildSectionPages
  // renders EVERY section (incl. empty ones, as intro/closing slides) AND
  // collects orphan questions (no/blank sectionStableKey) into a trailing
  // "Other" page — so a required orphan is now answerable instead of an
  // invisible submit dead-end.
  const pages = buildSectionPages(
    sortedSections as PagerSection[],
    visibleQuestions as PagerQuestion[]
  );

  return (
    <div className="ty-page">
      <main className="survey-body">
        <div className="survey-form">
          {submitError && (
            <div
              className="wf-intersection-banner"
              role="alert"
              style={{
                background: "hsl(var(--destructive) / 0.1)",
                borderColor: "hsl(var(--destructive) / 0.3)",
                color: "hsl(var(--destructive))",
              }}
            >
              {submitError}
            </div>
          )}

          <SectionPager
            pages={pages}
            answers={answers}
            onAnswerChange={(k, v) =>
              setAnswers((prev) => ({ ...prev, [k]: v }))
            }
            onSubmit={handleSubmit}
            submitting={submitting}
            onExit={() => setPhase({ kind: "intro", data: phase.data })}
            assessmentName={data.campaign.name}
            companyName={data.campaign.organizationName ?? undefined}
            templateAlias={data.campaign.templateAlias ?? undefined}
            isCEO={data.isCEO === true}
            requireAtLeastOneAnswer
          />
        </div>
      </main>
      <footer className="ty-footer">Powered by Scaling Up</footer>
    </div>
  );
}

async function readError(res: Response, fallback: string): Promise<string> {
  if (res.status === 425) {
    try {
      const body = (await res.json()) as { error?: string; openAt?: string };
      if (typeof body?.error === "string") return body.error;
      if (body?.openAt) {
        return `This survey hasn't opened yet. It opens ${formatTimestampDateTime(body.openAt)}.`;
      }
    } catch {
      /* fall through */
    }
    return "This survey hasn't opened yet.";
  }
  if (res.status === 410) return "This survey has closed.";
  if (res.status === 404) return "Invalid link.";
  if (res.status === 401) return "Your session expired. Open the link from your email again.";
  if (res.status === 409) return "This survey has already been submitted.";
  try {
    const body = (await res.json()) as { error?: string };
    if (typeof body?.error === "string") return body.error;
  } catch {
    /* fall through */
  }
  return fallback;
}
