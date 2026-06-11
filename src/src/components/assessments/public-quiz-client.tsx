"use client";

import { useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { SectionPager } from "./section-pager";
import {
  buildSectionPages,
  isAnswered,
  type PagerSection,
  type PagerQuestion,
} from "@/lib/assessments/section-pages";
import { useAnswerDraft, publicDraftKey } from "@/lib/assessments/use-answer-draft";
import {
  WelcomeShellHeader,
  WelcomeExpectations,
  WelcomeStats,
  deriveScaleLabel,
  deriveTimeEstimate,
} from "@/components/assessments/assessment-welcome";
import { BrandedReport } from "@/components/assessments/BrandedReport";
// The detailed report styling lives in su-report.css (scoped to .su-public-brand
// .su-report). The invited (report) route loads it via its layout; the public
// in-place results must load it here too, else the report renders unstyled.
import "@/styles/su-report.css";
import type { RespondentReport, QuestionMeta } from "@/lib/assessments/respondent-report";
import type { ScoreResult } from "@/lib/assessments/scoring";

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
  isOpen: boolean;
  status: "DRAFT" | "ACTIVE" | "CLOSED";
  openAtIso: string;
  closeAtIso: string | null;
  sections: unknown;
  questions: unknown;
}

type Step = "intro" | "info" | "form" | "results" | "error";

export function PublicQuizClient({
  campaignAlias,
  campaignName,
  campaignDescription,
  templateName,
  isOpen,
  status,
  openAtIso,
  closeAtIso,
  sections: rawSections,
  questions: rawQuestions,
}: PublicQuizClientProps) {
  const sections = useMemo(() => toSections(rawSections), [rawSections]);
  const questions = useMemo(() => toQuestions(rawQuestions), [rawQuestions]);

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

  // Welcome stat chips + expectation copy derive from the ACTUAL data (never
  // hardcoded counts/scale).
  const scaleLabel = useMemo(() => deriveScaleLabel(sortedQuestions), [sortedQuestions]);
  const timeEstimate = useMemo(
    () => deriveTimeEstimate(sortedQuestions.length),
    [sortedQuestions.length],
  );

  const [step, setStep] = useState<Step>(isOpen ? "intro" : "error");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [answers, setAnswers] = useState<Record<string, number | string | string[]>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [results, setResults] = useState<ScoreResult | null>(null);
  const [submittedId, setSubmittedId] = useState<string>("");
  // Stable idempotency key — generated once per component mount and reused on retries.
  const idemRef = useRef<string>("");

  // localStorage autosave (anonymous public draft, keyed per browser session).
  // Hook must run unconditionally at the top level, before any early return.
  const draftKey = useMemo(() => publicDraftKey(campaignAlias), [campaignAlias]);
  const { clearDraft } = useAnswerDraft(draftKey, answers, setAnswers);

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
                    ? `This assessment opens ${new Date(openAtIso).toLocaleDateString()}.`
                    : closeAtIso
                      ? `This assessment closed on ${new Date(closeAtIso).toLocaleDateString()}.`
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
              questionCount={sortedQuestions.length}
              scaleLabel={scaleLabel}
              confidentialSub="Your results are shown to you the moment you submit."
              scoresSub="See where you stand across each category."
            />
            <WelcomeStats
              questionCount={sortedQuestions.length}
              sectionCount={sortedSections.length}
              scaleLabel={scaleLabel}
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
              by email. Your responses are also shared with the Scaling Up team
              and the coach who referred you (if any), who receives the full
              report.
            </p>
          </section>
        </main>
        <footer className="su-welcome-foot">Powered by Scaling Up</footer>
      </div>
    );
  }

  if (step === "info") {
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
              if (
                firstName.trim() === "" ||
                lastName.trim() === "" ||
                email.trim() === ""
              )
                return;
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
              We use your name and email to show you your results and email you
              a copy, and, where applicable, to share them with the Scaling Up
              team and the coach who referred you (who receives the full
              report).
            </p>
            <div className="survey-question">
              <label className="wf-label" htmlFor="quiz-first-name-input">
                First name
              </label>
              <input
                id="quiz-first-name-input"
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                required
                maxLength={100}
                className="wf-input"
                data-testid="quiz-first-name"
              />
            </div>
            <div className="survey-question">
              <label className="wf-label" htmlFor="quiz-last-name-input">
                Last name
              </label>
              <input
                id="quiz-last-name-input"
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                required
                maxLength={100}
                className="wf-input"
                data-testid="quiz-last-name"
              />
            </div>
            <div className="survey-question">
              <label className="wf-label" htmlFor="quiz-email-input">
                Email
              </label>
              <input
                id="quiz-email-input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                maxLength={320}
                className="wf-input"
                data-testid="quiz-email"
              />
            </div>
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
  if (step === "results" && results) {
    const report: RespondentReport = {
      respondentName: `${firstName.trim()} ${lastName.trim()}`.trim(),
      jobTitle: null,
      companyName: "",
      assessmentName: templateName,
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
      provenance: {
        submissionId: submittedId,
        versionId: "",
        contentHash: "",
        templateName,
      },
      degraded: false,
    };
    return (
      <main className="survey-body" data-testid="quiz-results">
        {/* Scope wrapper so su-report.css applies (ADR-0005) — same wrapper the
            invited (report) route layout provides. */}
        <div className="su-public-brand su-report">
          <BrandedReport
            report={report}
            assessmentName={templateName}
            campaignLabel={campaignName}
          />
        </div>
      </main>
    );
  }

  // step === "form"
  function setAnswer(key: string, value: number | string | string[]) {
    setAnswers((cur) => ({ ...cur, [key]: value }));
  }

  const requiredQuestions = sortedQuestions.filter((q) => q.isRequired);
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
  const answeredCount = Object.values(answers).filter((v) => isAnswered(v)).length;
  const canSubmit = missingRequired.length === 0 && answeredCount > 0;

  async function handleSubmit() {
    if (submitting || !canSubmit) return;
    setSubmitError(null);
    setSubmitting(true);
    // Lazily assign a stable idempotency key for this submission attempt.
    if (!idemRef.current) idemRef.current = crypto.randomUUID();
    try {
      const res = await fetch(`/api/quiz/${campaignAlias}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          publicTaker: {
            firstName: firstName.trim(),
            lastName: lastName.trim(),
            email: email.trim(),
          },
          answers: Object.entries(answers).map(([stableKey, value]) => ({
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
      clearDraft();
      setResults(body.data.scoreResult as ScoreResult);
      setSubmittedId(body.data.submissionId ?? "");
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
  const pages = buildSectionPages(
    sortedSections as PagerSection[],
    sortedQuestions as PagerQuestion[],
  );

  return (
    <div className="ty-page">
      <header className="ty-header">
        <span className="ty-brand">Scaling Up</span>
        <span>{campaignName}</span>
      </header>
      <main className="survey-body">
        <div className="survey-form">
          {submitError && (
            <div
              className="wf-intersection-banner"
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
            assessmentName={templateName}
          />

          <p
            className="ty-sub"
            style={{ fontSize: "0.75rem", textAlign: "center", margin: "0.5rem 0 0" }}
            data-testid="quiz-consent"
          >
            By submitting, you agree that your results will be shown to you and
            emailed to you, and shared with the Scaling Up team and the coach who
            referred you (if any) — who receives the full report.
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
