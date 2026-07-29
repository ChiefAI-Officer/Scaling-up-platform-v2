"use client";

/**
 * Assessment v7.6 — INVITED-mode survey client (Task D).
 *
 * Lifecycle:
 *   1. On mount: read window.location.hash (`#t=<rawToken>`).
 *   2. POST { token } → ./exchange. Strip the fragment on success.
 *   3. GET ./me → fetch form data.
 *   4. Render SLIDER_LIKERT inputs; submit POST → ./submit.
 *   5. On 200: if the response carries a report (Wave OSR / #71 — the campaign
 *      opted in AND the flag is on, both decided server-side), render it in
 *      place as the terminal `results` phase; otherwise redirect to ./thank-you.
 *
 * Errors render inline. 410 ⇒ "This survey has closed.", 404 ⇒ "Invalid link.",
 * 401 ⇒ "Your session expired." One exception (Wave OSR): a 410 from ./me with a
 * stored on-screen report re-renders that report instead of the error — the 410
 * is what proves a live invitation cookie. See onscreen-result-store.ts.
 */

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { SectionPager } from "./section-pager";
import {
  buildSectionPages,
  filterConditionallyEmptiedPages,
  isAnswered,
  type PagerSection,
  type PagerQuestion,
} from "@/lib/assessments/section-pages";
import {
  mergeCustomSlides,
  type SafeSlide,
} from "@/lib/assessments/custom-slides";
import {
  useAnswerDraft,
  invitedDraftKey,
} from "@/lib/assessments/use-answer-draft";
import { pruneAnswersToQuestions } from "@/lib/assessments/prune-answers";
import {
  RESUME_NOTE,
  resolveWelcomeLede,
  shouldShowResumeNote,
} from "@/lib/assessments/welcome-copy";
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
import { BrandedReport } from "@/components/assessments/BrandedReport";
import { PrintReportButton } from "@/components/assessments/PrintReportButton";
import type { RespondentReport } from "@/lib/assessments/respondent-report";
import {
  readOnScreenResult,
  writeOnScreenResult,
  clearOnScreenResult,
  reviveOnScreenReport,
} from "@/lib/assessments/onscreen-result-store";

// Wave OSR (#71) — the in-place report needs the report stylesheets. This route
// group has no (report) layout to supply them, so the client imports them the
// same way public-quiz-client.tsx does. Without these the report renders
// completely unstyled (ADR-0005 scopes both files under .su-public-brand, so
// they cannot leak into the blue admin/coach UI).
import "@/styles/su-public-brand.css";
import "@/styles/su-report.css";

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
  /**
   * Wave M (#19): already-sanitized custom slides emitted by the /me route
   * (SERVER-sanitized into `safeHtml`). Present only when the campaign has
   * slides AND the WAVE_M flag is on; otherwise omitted ⇒ the mergeCustomSlides
   * no-op leaves the section pages unchanged. The client never sanitizes.
   */
  customSlides?: SafeSlide[];
}

type Phase =
  | { kind: "exchanging" }
  | { kind: "loading" }
  | { kind: "intro"; data: SurveyData }
  | { kind: "ready"; data: SurveyData }
  | { kind: "submitting"; data: SurveyData }
  /**
   * Wave OSR (#71): terminal in-place report. Reached either straight from a
   * submit whose response carried a report, or rehydrated from sessionStorage on
   * a refresh (spec 19an §4).
   */
  | { kind: "results"; report: RespondentReport }
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

          // Wave OSR (#71): a fresh exchange means a (possibly different)
          // respondent is starting this campaign in this tab — purge any stored
          // report. This is a belt-and-braces cleanup, NOT the security boundary:
          // the real guard is the /me 410 check below, because the tokenless
          // reload never reaches this branch at all.
          clearOnScreenResult(campaignAlias);

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
          // Wave OSR (#71) — rehydrate the in-place report, but ONLY behind a
          // proof of identity. /me answers 410 once the invitation is past its
          // lifecycle gate (SUBMITTED is the case we care about) and that answer
          // requires a live, sealed invitation cookie — so a 410 is evidence
          // this browser holds THIS respondent's session.
          //
          // The stored slot is deliberately NOT treated as a credential. It is
          // keyed by campaign alias (respondentKey is unavailable once /me has
          // 410'd), so reading it before this check would serve a full report —
          // name, answers, scores — to whoever next reloads an abandoned tab,
          // with no token at all. The exchange purge does not cover that case:
          // the exchange strips the fragment, so a tokenless reload is the
          // COMMON path, not an exotic one.
          if (meRes.status === 410) {
            const stored = readOnScreenResult(campaignAlias);
            if (stored) {
              if (!cancelled) setPhase({ kind: "results", report: stored });
              return;
            }
          } else {
            // No live session (401/404/…): identity cannot be proven, so destroy
            // the stored PII rather than leave it readable.
            clearOnScreenResult(campaignAlias);
          }
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

      // Wave OSR (#71): the server decides disclosure under the submission lock
      // and returns the report ONLY when the campaign toggle + flag permit it —
      // so the presence of `data.report` IS the signal. There is deliberately no
      // client-visible flag to consult, which makes it impossible for client and
      // server to disagree (spec 19an §6).
      const submitBody = (await submitRes
        .json()
        .catch(() => null)) as { data?: { report?: unknown } } | null;
      // Revive across the JSON boundary: `submittedAt` is typed Date but arrives
      // as an ISO string, and the renderers hand it to Intl.DateTimeFormat,
      // which throws on a string and falls back to printing raw ISO text. The
      // sessionStorage path revives too — both boundaries need it, or the same
      // report shows two different date formats before vs after a refresh.
      const onScreenReport = reviveOnScreenReport(submitBody?.data?.report);
      if (onScreenReport) {
        writeOnScreenResult(campaignAlias, onScreenReport);
        setPhase({ kind: "results", report: onScreenReport });
        return;
      }

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

  // Wave OSR (#71) — terminal in-place report. Same artifact the coach/admin
  // sees, shown to its subject (ADR-0027); BrandedReport dispatches
  // scored-vs-qualitative itself off report.templateAlias, which the SERVER
  // populated, so there is no branch to make here.
  if (phase.kind === "results") {
    return (
      <main className="survey-body" data-testid="org-survey-results">
        {/* Scope wrapper so su-report.css applies (ADR-0005) — the same wrapper
            the invited (report) route layout provides. */}
        <div className="su-public-brand su-report">
          <div className="no-print" style={{ textAlign: "center" }}>
            <PrintReportButton
              fileName={`${phase.report.assessmentName} — ${phase.report.respondentName}`}
            />
            {/* The copy that used to live on the thank-you page: with the report
                shown in place that page is bypassed entirely, so the "your coach
                will review this with you" framing needs a home here. Print /
                Download is the ONLY way to keep the report, so say so. */}
            <p className="su-report-onscreen-note">
              Your coach will review these results with you. Use Print or
              Download PDF above if you would like to keep a copy.
            </p>
          </div>
          <BrandedReport
            report={phase.report}
            assessmentName={phase.report.assessmentName}
            campaignLabel={phase.report.campaignLabel ?? null}
          />
        </div>
      </main>
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
    // Resolved once: `templateAlias` above is exactly this phase's
    // `campaign.templateAlias`, and both helpers walk the same map.
    const welcomeLede = resolveWelcomeLede(templateAlias);
    const showResumeNote = shouldShowResumeNote(templateAlias);
    return (
      <div className="su-welcome-page">
        <WelcomeShellHeader caption={orgName ?? "Team Assessment"} />
        <main className="su-welcome-body">
          <section className="su-welcome-card" aria-labelledby="invite-title">
            <span className="su-welcome-eyebrow">You&apos;re invited</span>
            <h1 className="su-welcome-title" id="invite-title">
              {phase.data.campaign.name}
            </h1>
            {welcomeLede.map((para, i) => (
              <p className="su-welcome-lede" key={i}>
                {para}
              </p>
            ))}
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
              {/* `{" "}` is structural: a trailing space inside a template
                  literal is invisible and silently deletable, and both
                  sentence-level assertions would still pass if it vanished. */}
              {showResumeNote && (
                <>
                  {RESUME_NOTE}{" "}
                </>
              )}
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
  // Wave M (#19): weave any server-sanitized custom slides into the page array
  // (pure; no-op when data.customSlides is empty/undefined). The client never
  // sanitizes — slides arrive as already-safe SafeSlide[] from /me.
  // Wave W (D7): a section whose authored questions are ALL hidden by showIf
  // is suppressed (no contentless step); authored-empty intro pages render as
  // before. Runs BEFORE the slide merge so `before-section` anchors reflect
  // the visible page list (unknown anchor ⇒ existing fail-safe drop).
  const { pages } = mergeCustomSlides(
    filterConditionallyEmptiedPages(
      buildSectionPages(
        sortedSections as PagerSection[],
        visibleQuestions as PagerQuestion[]
      ),
      sortedQuestions as PagerQuestion[]
    ),
    data.customSlides ?? []
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
