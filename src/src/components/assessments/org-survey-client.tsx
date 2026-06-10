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
import {
  WelcomeShellHeader,
  WelcomeExpectations,
  WelcomeStats,
  deriveScaleLabel,
  deriveTimeEstimate,
} from "@/components/assessments/assessment-welcome";

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
  campaign: { name: string; alias: string; organizationName?: string | null };
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

  const sortedSections = useMemo<Section[]>(() => {
    if (
      phase.kind !== "intro" &&
      phase.kind !== "ready" &&
      phase.kind !== "submitting"
    )
      return [];
    return [...phase.data.sections].sort((a, b) => a.sortOrder - b.sortOrder);
  }, [phase]);

  const sortedQuestions = useMemo<Question[]>(() => {
    if (
      phase.kind !== "intro" &&
      phase.kind !== "ready" &&
      phase.kind !== "submitting"
    )
      return [];
    return [...phase.data.questions].sort((a, b) => a.sortOrder - b.sortOrder);
  }, [phase]);

  // Welcome stat chips + expectation copy derive from the ACTUAL data.
  const scaleLabel = useMemo(() => deriveScaleLabel(sortedQuestions), [sortedQuestions]);
  const timeEstimate = useMemo(
    () => deriveTimeEstimate(sortedQuestions.length),
    [sortedQuestions.length],
  );

  async function handleSubmit() {
    if (phase.kind !== "ready") return;

    const required = phase.data.questions.filter((q) => q.isRequired);
    const missing = required
      .filter((q) => !isAnswered(answers[q.stableKey]))
      .map((q) => q.label);
    if (missing.length > 0) {
      setPhase({
        kind: "error",
        message: `Please answer all required questions before submitting (${missing.length} missing).`,
      });
      return;
    }

    // The submit route rejects an empty `answers` array (EMPTY_ANSWERS 400),
    // so even an all-optional survey must have ≥1 answered question before we
    // POST. Mirrors the public quiz client guard.
    const answeredCount = Object.values(answers).filter((v) =>
      isAnswered(v)
    ).length;
    if (answeredCount === 0) {
      setPhase({
        kind: "error",
        message: "Please answer at least one question before submitting.",
      });
      return;
    }

    setPhase({ kind: "submitting", data: phase.data });

    try {
      const submitRes = await fetch(`/org-survey/${campaignAlias}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        cache: "no-store",
        body: JSON.stringify({
          answers: Object.entries(answers).map(([stableKey, value]) => ({
            stableKey,
            value,
          })),
        }),
      });
      if (!submitRes.ok) {
        const message = await readError(submitRes, "Failed to submit.");
        setPhase({ kind: "error", message });
        return;
      }
      clearDraft();
      router.push(`/org-survey/${campaignAlias}/thank-you`);
    } catch (err) {
      console.error("[org-survey] submit failed", err);
      setPhase({
        kind: "error",
        message: "Something went wrong. Please try again.",
      });
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
    sortedQuestions as PagerQuestion[]
  );

  return (
    <div className="ty-page">
      <header className="ty-header">
        <span className="ty-brand">Scaling Up</span>
        <span>{data.campaign.name}</span>
      </header>
      <main className="survey-body">
        <div className="survey-form">
          <section className="ty-card" aria-labelledby="survey-title">
            <span className="hero-eyebrow">Survey</span>
            <h1 className="ty-title" id="survey-title">
              {data.campaign.name}
            </h1>
            <p className="ty-lede">
              Please rate each item below and submit when you&apos;re done.
            </p>
          </section>

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
        return `This survey hasn't opened yet. It opens ${new Date(body.openAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}.`;
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
