"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
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
import { useAnswerDraft, publicDraftKey } from "@/lib/assessments/use-answer-draft";
import { pruneAnswersToQuestions } from "@/lib/assessments/prune-answers";
import {
  filterVisibleSurveyQuestions,
  visibleSurveyQuestionKeys,
} from "@/lib/assessments/form-visibility";
import {
  WelcomeShellHeader,
  WelcomeExpectations,
  WelcomeStats,
  deriveWelcomePresentation,
  deriveTimeEstimate,
} from "@/components/assessments/assessment-welcome";
import { BrandedReport } from "@/components/assessments/BrandedReport";
import { ReportStyleScope } from "@/components/assessments/ReportStyleScope";
import { PrintReportButton } from "@/components/assessments/PrintReportButton";
import { formatTimestamp } from "@/lib/utils";
// The detailed report styling lives in su-report.css (scoped to .su-public-brand
// .su-report). The invited (report) route loads it via its layout; the public
// in-place results must load it here too, else the report renders unstyled.
import "@/styles/su-report.css";
import type { RespondentReport, QuestionMeta } from "@/lib/assessments/respondent-report";
import type { ScoreResult } from "@/lib/assessments/scoring";
import {
  isReportStyleKey,
  type ReportStyleKey,
} from "@/lib/assessments/report-style-registry";
import { PublicMarketingResult } from "@/components/assessments/PublicMarketingResult";
import type { PublicMarketingResultConfig } from "@/lib/assessments/public-marketing-result";
import type { SafeReportHtml } from "@/lib/assessments/report-html";
import {
  resolvePublicContactConfig,
  type PublicContactFieldKey,
  type PublicContactValues,
} from "@/lib/assessments/public-contact-config";
import {
  type InvitedWelcomeConfig,
} from "@/lib/assessments/invited-welcome-config";
import { AssessmentWelcomeCard } from "@/components/assessments/AssessmentWelcomeCard";

interface SectionDef {
  stableKey: string;
  sortOrder: number;
  name: string;
  description?: string;
  partLabel?: string;
}

interface QuestionScale {
  min: number;
  max: number;
  step: number;
  anchorMin: string;
  anchorMax: string;
}

interface QuestionDef {
  stableKey: string;
  sortOrder: number;
  type: string;
  label: string;
  helpText?: string;
  sectionStableKey?: string;
  isRequired: boolean;
  scale?: QuestionScale;
  options?: Array<{ key: string; label: string }>;
  maxChoices?: number;
}

// Tolerant cast — server gives us `unknown`; runtime shape comes from the
// stored published version which is Zod-validated at scoring time.
function toSections(raw: unknown): SectionDef[] {
  if (!Array.isArray(raw)) return [];
  return (raw as SectionDef[]).filter(
    (s) => s && typeof s.stableKey === "string" && typeof s.name === "string",
  );
}
function toQuestions(raw: unknown): QuestionDef[] {
  if (!Array.isArray(raw)) return [];
  // Accept all question types — only require stableKey + label.
  // Non-SLIDER questions may not have a scale; QuestionInput handles them.
  return (raw as QuestionDef[]).filter(
    (q) =>
      q &&
      typeof q.stableKey === "string" &&
      typeof q.label === "string",
  );
}

interface PublicQuizClientProps {
  campaignAlias: string;
  campaignName: string;
  campaignDescription: string | null;
  templateName: string;
  templateAlias?: string | null;
  isOpen: boolean;
  status: "DRAFT" | "ACTIVE" | "CLOSED";
  openAtIso: string;
  closeAtIso: string | null;
  sections: unknown;
  questions: unknown;
  referredResultsEnabled?: boolean;
  qspStoryGroupEnabled?: boolean;
  /**
   * Wave M (#19): already-sanitized custom slides (SERVER-sanitized into
   * `safeHtml` by the page loader). Empty/omitted ⇒ the mergeCustomSlides
   * no-op leaves the section pages unchanged. v1 has no PUBLIC authoring path,
   * so this is normally empty.
   */
  customSlides?: SafeSlide[];
  marketingResultConfig?: PublicMarketingResultConfig | null;
  /** Strictly parsed current template Welcome copy for PUBLIC campaigns. */
  welcomeConfig?: InvitedWelcomeConfig;
  /** Server-resolved fragments from this campaign's pinned version. */
  reportHtml?: SafeReportHtml;
  /** Composite successor decision resolved by the server page. */
  reportHtmlExperienceActive?: boolean;
}

type Step = "intro" | "info" | "form" | "results" | "error";

export function PublicQuizClient({
  campaignAlias,
  campaignName,
  campaignDescription,
  templateName,
  templateAlias,
  isOpen,
  status,
  openAtIso,
  closeAtIso,
  sections: rawSections,
  questions: rawQuestions,
  customSlides,
  referredResultsEnabled = false,
  qspStoryGroupEnabled = false,
  marketingResultConfig = null,
  welcomeConfig,
  reportHtml = { introductionHtml: null, conclusionHtml: null },
  reportHtmlExperienceActive = false,
}: PublicQuizClientProps) {
  const sections = useMemo(() => toSections(rawSections), [rawSections]);
  const questions = useMemo(() => toQuestions(rawQuestions), [rawQuestions]);
  const contactConfig = useMemo(
    () => resolvePublicContactConfig(templateAlias),
    [templateAlias],
  );

  // §4 — Per-coach attribution. A `?coach=<ref>` query param (the coach's email
  // for v1) is forwarded to the submit route as `referringCoachEmail`. The
  // server's active-coach guard validates it; a blank/missing/inactive ref
  // silently falls back to SU-team-only. We omit the field entirely when blank.
  const searchParams = useSearchParams();
  const referringCoachEmail = useMemo(() => {
    const raw = searchParams?.get("coach") ?? "";
    const trimmed = raw.trim();
    return trimmed.length > 0 ? trimmed : null;
  }, [searchParams]);

  const sortedQuestions = useMemo(
    () => [...questions].sort((a, b) => a.sortOrder - b.sortOrder),
    [questions],
  );
  const sortedSections = useMemo(
    () => [...sections].sort((a, b) => a.sortOrder - b.sortOrder),
    [sections],
  );

  // Welcome stat chips + expectation copy derive from the complete ACTUAL
  // question bank (never hardcoded counts/scale).
  const welcomePresentation = useMemo(
    () => deriveWelcomePresentation(sortedQuestions),
    [sortedQuestions],
  );
  const timeEstimate = useMemo(
    () => deriveTimeEstimate(sortedQuestions.length),
    [sortedQuestions.length],
  );

  const [step, setStep] = useState<Step>(isOpen ? "intro" : "error");
  const [contactValues, setContactValues] = useState<PublicContactValues>({});
  const [answers, setAnswers] = useState<Record<string, number | string | string[]>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [results, setResults] = useState<ScoreResult | null>(null);
  const [reportStyle, setReportStyle] = useState<ReportStyleKey | null>(null);
  const [reportStylesAvailable, setReportStylesAvailable] = useState(false);
  const [reportFindingsAvailable, setReportFindingsAvailable] = useState(false);
  const [submittedId, setSubmittedId] = useState<string>("");
  const [verifiedCoachEmail, setVerifiedCoachEmail] = useState<string | null>(
    null,
  );
  // Stable idempotency key — generated once per component mount and reused on retries.
  const idemRef = useRef<string>("");

  // localStorage autosave (anonymous public draft, keyed per browser session).
  // Hook must run unconditionally at the top level, before any early return.
  const draftKey = useMemo(() => publicDraftKey(campaignAlias), [campaignAlias]);
  const { clearDraft } = useAnswerDraft(draftKey, answers, setAnswers);
  const visibleQuestions = useMemo<QuestionDef[]>(
    () =>
      filterVisibleSurveyQuestions({
        templateAlias,
        questions: sortedQuestions as PagerQuestion[],
        answers,
      }) as QuestionDef[],
    [templateAlias, sortedQuestions, answers],
  );

  // The set of stableKeys that map to a currently-rendered question. Used both
  // to prune a stale localStorage draft on hydrate AND to prune the POST body
  // pre-submit (Wave C R3-M2) so an answer whose question no longer exists can
  // never reach the server.
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
  // this no-ops when nothing is stale, so it can't loop.
  useEffect(() => {
    if (knownKeys.size === 0) return;
    setAnswers((prev) => pruneAnswersToQuestions(prev, knownKeys));
  }, [knownKeys]);

  if (!isOpen || step === "error") {
    return (
      <div className="ty-page">
        <header className="ty-header">
          <span className="ty-brand">Scaling Up</span>
          <span>Quiz unavailable</span>
        </header>
        <main className="ty-body">
          <section className="ty-card">
            <span className="hero-eyebrow">Notice</span>
            <h1 className="ty-title">{campaignName}</h1>
            <p className="ty-lede">
              {status === "DRAFT"
                ? "This assessment is not yet open."
                : status === "CLOSED"
                  ? "This assessment is closed."
                  : new Date(openAtIso) > new Date()
                    ? `This assessment opens ${formatTimestamp(openAtIso)}.`
                    : closeAtIso
                      ? `This assessment closed on ${formatTimestamp(closeAtIso)}.`
                      : "This assessment is not currently accepting submissions."}
            </p>
          </section>
        </main>
        <footer className="ty-footer">Powered by Scaling Up</footer>
      </div>
    );
  }

  if (step === "intro") {
    // Screen 1 — de-bared WELCOME / invitation (approved participant mockup).
    // Branded app-shell header (white logo) + "what to expect" value-prop list
    // + stat chips (actual counts + derived scale) + strong purple CTA.
    return (
      <div className="su-welcome-page">
        <WelcomeShellHeader caption={templateName} />
        <main className="su-welcome-body">
          {welcomeConfig ? (
            <AssessmentWelcomeCard
              config={welcomeConfig}
              campaignName={campaignName}
              questions={sortedQuestions}
              sections={sortedSections}
              onStart={() => setStep("info")}
              headingId="hero-title"
              startButtonTestId="quiz-start"
            />
          ) : (
            <section className="su-welcome-card" aria-labelledby="hero-title">
              <span className="su-welcome-eyebrow">Free assessment</span>
              <h1 className="su-welcome-title" id="hero-title">
                {campaignName}
              </h1>
              {campaignDescription ? (
                <p className="su-welcome-lede" style={{ whiteSpace: "pre-line" }}>
                  {campaignDescription}
                </p>
              ) : (
                <p className="su-welcome-lede">
                  See how your business scores across the Four Decisions —
                  People, Strategy, Execution, and Cash — and get your results
                  instantly.
                </p>
              )}
              <WelcomeExpectations
                timeLabel={timeEstimate}
                expectationText={welcomePresentation.expectationText}
                sharingLabel="How your results are shared"
                sharingSub="You receive your results immediately. Authorized Scaling Up staff can review your full report; your referring coach can too, if you used their link."
                scoresLabel="Your category scores"
                scoresSub="See where you stand across each category."
              />
              <WelcomeStats
                questionCount={sortedQuestions.length}
                sectionCount={sortedSections.length}
                scaleLabel={welcomePresentation.scaleLabel}
              />
              <div className="su-welcome-cta-row">
                <button
                  type="button"
                  onClick={() => setStep("info")}
                  className="su-welcome-cta"
                  data-testid="quiz-start"
                >
                  Start the assessment →
                </button>
              </div>
              <p className="su-welcome-fine">
                Free to take — you&apos;ll get your results on screen and a copy
                by email.
              </p>
            </section>
          )}
        </main>
        <footer className="su-welcome-foot">Powered by Scaling Up</footer>
      </div>
    );
  }

  if (step === "info") {
    const setContactValue = (key: PublicContactFieldKey, value: string) => {
      setContactValues((current) => ({ ...current, [key]: value }));
    };

    return (
      <div className="ty-page">
        <header className="ty-header">
          <span className="ty-brand">Scaling Up</span>
          <span>Tell us about you</span>
        </header>
        <main className="ty-body">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (contactConfig.fields.some(
                (field) =>
                  field.required &&
                  (contactValues[field.key] ?? "").trim() === "",
              )) return;
              setStep("form");
            }}
            className="ty-card"
            aria-labelledby="quiz-info-title"
          >
            <span className="hero-eyebrow">About you</span>
            <h1 className="ty-title" id="quiz-info-title">
              About you
            </h1>
            <p className="ty-sub">
              We use the contact information you provide to deliver your
              results and email you a copy. It may also be shared with
              authorized Scaling Up staff and, if you used a coach referral
              link, that verified coach, who receives the full report. Scaling
              Up retains personal data as described in its{" "}
              <a href="https://scalingup.com/privacy-policy/">Privacy Policy</a>.
            </p>
            {contactConfig.fields.map((field) => {
              const slug = field.key.replace(
                /[A-Z]/g,
                (letter) => `-${letter.toLowerCase()}`,
              );
              const id = `quiz-${slug}-input`;
              const value = contactValues[field.key] ?? "";
              return (
                <div className="survey-question" key={field.key}>
                  <label className="wf-label" htmlFor={id}>
                    {field.label}
                  </label>
                  {field.inputType === "select" ? (
                    <select
                      id={id}
                      value={value}
                      onChange={(event) => setContactValue(field.key, event.target.value)}
                      required={field.required}
                      autoComplete={field.autoComplete}
                      className="wf-input"
                      data-testid={`quiz-${slug}`}
                    >
                      <option value="">Select...</option>
                      {field.options?.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      id={id}
                      type={field.inputType}
                      value={value}
                      onChange={(event) => setContactValue(field.key, event.target.value)}
                      required={field.required}
                      maxLength={field.maxLength}
                      autoComplete={field.autoComplete}
                      className="wf-input"
                      data-testid={`quiz-${slug}`}
                    />
                  )}
                </div>
              );
            })}
            <div className="hero-cta-row" style={{ justifyContent: "space-between" }}>
              <button
                type="button"
                onClick={() => setStep("intro")}
                className="wf-btn wf-btn-secondary"
              >
                Back
              </button>
              <button
                type="submit"
                className="wf-btn wf-btn-primary"
                data-testid="quiz-info-next"
              >
                Continue
              </button>
            </div>
          </form>
        </main>
        <footer className="ty-footer">Powered by Scaling Up</footer>
      </div>
    );
  }

  // step === "results" — render the branded in-place report.
  if (step === "results" && results && reportStyle) {
    const firstName = contactValues.firstName ?? "";
    const lastName = contactValues.lastName ?? "";
    const email = contactValues.email ?? "";
    const report: RespondentReport = {
      respondentName: `${firstName.trim()} ${lastName.trim()}`.trim(),
      respondentEmail: email.trim() || null,
      jobTitle: null,
      companyName: "",
      assessmentName: templateName,
      // Was OMITTED here, which silently forced every public report through
      // DEFAULT_REPORT_CONFIG regardless of the instrument (BrandedReport reads
      // it at four sites). Now threaded, which ALIGNS this in-place render with
      // the public quiz's own email twin — quiz/[campaignAlias]/submit already
      // passes the real alias into the report model.
      //
      // ⚠️ This is a real dispatch change, not a no-op: for a PUBLIC campaign on
      // a REPORT_CONFIG-mapped alias, the report type itself can change (qsp-v1 /
      // qsp-v2 / leadership-vision-alignment are "qualitative"). It is inert for
      // the campaign live at the time of writing, but that is a fact about DATA,
      // not about this code — so do not treat it as a guarantee. See ADR-0008.
      templateAlias: templateAlias ?? "",
      reportStyle,
      campaignLabel: campaignName,
      submittedAt: new Date(),
      result: results,
      sections: rawSections,
      questionByKey: Object.fromEntries(sortedQuestions.map((q) => [q.stableKey, q.label])),
      questionsByKey: Object.fromEntries(
        sortedQuestions.map((q) => [
          q.stableKey,
          {
            type: q.type,
            label: q.label,
            sectionStableKey: q.sectionStableKey,
          } as QuestionMeta,
        ]),
      ),
      rawAnswers: Object.entries(answers).map(([stableKey, value]) => ({ stableKey, value })),
      scoringConfig: undefined,
      reportHtml,
      provenance: {
        submissionId: submittedId,
        versionId: "",
        contentHash: "",
        templateName,
      },
      degraded: false,
      publicLeadActions: true,
    };
    return (
      <ReportStyleScope
        report={report}
        reportStylesAvailable={reportStylesAvailable}
      >
        <main className="survey-body" data-testid="quiz-results">
          {/* Scope wrapper so su-report.css applies (ADR-0005) — same wrapper the
              invited (report) route layout provides. */}
          <div className="su-public-brand su-report">
            <PrintReportButton
              fileName={`${templateName} — ${report.respondentName}`}
            />
            <BrandedReport
              report={report}
              assessmentName={templateName}
              campaignLabel={campaignName}
              contactEmail={verifiedCoachEmail}
              reportStylesAvailable={reportStylesAvailable}
              reportFindingsAvailable={reportFindingsAvailable}
              beforeConclusion={
                reportHtmlExperienceActive && marketingResultConfig ? (
                  <PublicMarketingResult
                    score={
                      results.scaleUpScore ??
                      Math.max(0, Math.min(100, results.overallAverage * 10))
                    }
                    scoreBands={marketingResultConfig.scoreBands}
                    marketingCta={null}
                    referringCoachEmail={verifiedCoachEmail}
                  />
                ) : undefined
              }
            />
            {marketingResultConfig && !reportHtmlExperienceActive && (
              <PublicMarketingResult
                score={
                  results.scaleUpScore ??
                  Math.max(0, Math.min(100, results.overallAverage * 10))
                }
                scoreBands={marketingResultConfig.scoreBands}
                marketingCta={marketingResultConfig.marketingCta}
                referringCoachEmail={verifiedCoachEmail}
              />
            )}
          </div>
        </main>
      </ReportStyleScope>
    );
  }

  // step === "form"
  function setAnswer(key: string, value: number | string | string[]) {
    setAnswers((cur) => ({ ...cur, [key]: value }));
  }

  const requiredQuestions = visibleQuestions.filter((q) => q.isRequired);
  const missingRequired = requiredQuestions.filter((q) => {
    const v = answers[q.stableKey];
    if (v === undefined) return true;
    if (typeof v === "string" && v.trim() === "") return true;
    if (Array.isArray(v) && v.length === 0) return true;
    return false;
  });
  // The submit endpoint rejects an empty `answers` array (Zod `.min(1)`), so an
  // all-optional quiz must still have at least one answered question before we
  // allow a POST — otherwise the server 400s on a zero-answer payload.
  const visibleAnswers = pruneAnswersToQuestions(answers, knownKeys);
  const answeredCount = Object.values(visibleAnswers).filter((v) => isAnswered(v)).length;
  const canSubmit = missingRequired.length === 0 && answeredCount > 0;

  async function handleSubmit() {
    if (submitting || !canSubmit) return;
    setSubmitError(null);
    setSubmitting(true);
    // Lazily assign a stable idempotency key for this submission attempt.
    if (!idemRef.current) idemRef.current = crypto.randomUUID();
    // Pre-submit prune (R3-M2): drop any answer whose stableKey isn't a
    // currently-rendered question (a stale localStorage draft) before POSTing.
    // Persist the pruned map back if it changed so local state + the autosaved
    // draft stay in sync.
    const pruned = pruneAnswersToQuestions(answers, knownKeys);
    if (pruned !== answers) setAnswers(pruned);
    const publicTaker = Object.fromEntries(
      contactConfig.fields.flatMap((field) => {
        const value = (contactValues[field.key] ?? "").trim();
        return value === "" && !field.required ? [] : [[field.key, value]];
      }),
    );
    try {
      const res = await fetch(`/api/quiz/${campaignAlias}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          publicTaker: {
            ...publicTaker,
          },
          answers: Object.entries(pruned).map(([stableKey, value]) => ({
            stableKey,
            value,
          })),
          idempotencyKey: idemRef.current,
          // §4 — include only when a non-blank ?coach= param was present.
          ...(referringCoachEmail ? { referringCoachEmail } : {}),
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || body.success === false) {
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      if (!isReportStyleKey(body.data.reportStyle)) {
        throw new Error("Invalid report style response");
      }
      clearDraft();
      setResults(body.data.scoreResult as ScoreResult);
      setReportStyle(body.data.reportStyle);
      setReportStylesAvailable(body.data.reportStylesAvailable === true);
      setReportFindingsAvailable(body.data.reportFindingsAvailable === true);
      setSubmittedId(body.data.submissionId ?? "");
      setVerifiedCoachEmail(body.data.referringCoachEmail ?? null);
      setStep("results");
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : "Submission failed. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  // One section per screen via the shared SectionPager. It derives total
  // questions + progress internally and renders each question through the
  // accessible QuestionInput; we own the answer state and the submit POST.
  // Wave M (#19): weave any server-sanitized custom slides into the page array
  // (pure; no-op when customSlides is empty/undefined). The client never
  // sanitizes — slides arrive as already-safe SafeSlide[].
  // Wave W (D7): a section whose authored questions are ALL hidden by showIf
  // is suppressed (no contentless step); authored-empty intro pages render as
  // before. Runs BEFORE the slide merge so `before-section` anchors reflect
  // the visible page list (unknown anchor ⇒ existing fail-safe drop).
  const { pages } = mergeCustomSlides(
    filterConditionallyEmptiedPages(
      buildSectionPages(
        sortedSections as PagerSection[],
        visibleQuestions as PagerQuestion[],
      ),
      sortedQuestions as PagerQuestion[],
    ),
    customSlides ?? [],
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
            onAnswerChange={(k, v) => setAnswer(k, v)}
            onSubmit={handleSubmit}
            submitting={submitting}
            onExit={() => setStep("info")}
            assessmentName={campaignName}
            templateAlias={templateAlias ?? undefined}
            qspStoryGroupEnabled={qspStoryGroupEnabled}
            requireAtLeastOneAnswer
          />

          <p
            className="ty-sub"
            style={{ fontSize: "0.75rem", textAlign: "center", margin: "0.5rem 0 0" }}
            data-testid="quiz-consent"
          >
            {referredResultsEnabled ? (
              <>
                By submitting, you agree that your full report will be shown and
                emailed to you. It will also be shared with the Scaling Up team
                and, if you used a coach referral link, made available to that
                verified coach while their account remains active. Scaling Up
                retains personal data as described in its{" "}
                <a href="https://scalingup.com/privacy-policy/">
                  Privacy Policy
                </a>
                .
              </>
            ) : (
              <>
                By submitting, you agree that your results will be shown to you
                and emailed to you, and shared with the Scaling Up team and the
                coach who referred you (if any) — who receives the full report.
              </>
            )}
          </p>

          {!canSubmit && (
            <p
              style={{
                fontSize: "0.75rem",
                color: "hsl(var(--muted-foreground))",
                textAlign: "center",
                margin: 0,
              }}
            >
              {missingRequired.length > 0
                ? "Please answer all required questions before submitting."
                : "Please answer at least one question before submitting."}
            </p>
          )}
        </div>
      </main>
      <footer className="ty-footer">Powered by Scaling Up</footer>
    </div>
  );
}
