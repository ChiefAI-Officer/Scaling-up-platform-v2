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
import { QuestionInput } from "./question-input";

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
  campaign: { name: string; alias: string };
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

  const questionsBySection = useMemo<Map<string, Question[]>>(() => {
    const out = new Map<string, Question[]>();
    if (
      phase.kind !== "intro" &&
      phase.kind !== "ready" &&
      phase.kind !== "submitting"
    )
      return out;
    const sorted = [...phase.data.questions].sort(
      (a, b) => a.sortOrder - b.sortOrder
    );
    for (const q of sorted) {
      const key = q.sectionStableKey ?? "__unassigned";
      if (!out.has(key)) out.set(key, []);
      out.get(key)!.push(q);
    }
    return out;
  }, [phase]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (phase.kind !== "ready") return;

    const required = phase.data.questions.filter((q) => q.isRequired);
    const missing = required
      .filter((q) => {
        const v = answers[q.stableKey];
        if (v === undefined) return true;
        if (typeof v === "string" && v.trim() === "") return true;
        if (Array.isArray(v) && v.length === 0) return true;
        return false;
      })
      .map((q) => q.label);
    if (missing.length > 0) {
      setPhase({
        kind: "error",
        message: `Please answer all required questions before submitting (${missing.length} missing).`,
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
    return (
      <div className="ty-page">
        <header className="ty-header">
          <span className="ty-brand">Scaling Up</span>
          <span>You&apos;re invited</span>
        </header>
        <main className="ty-body">
          <section className="ty-card" aria-labelledby="invite-title">
            <span className="hero-eyebrow">You&apos;re invited</span>
            <h1 className="ty-title" id="invite-title">
              {phase.data.campaign.name}
            </h1>
            <p className="ty-lede">
              You&apos;ve been invited to take this assessment. Click below
              when you&apos;re ready to begin.
            </p>
            <p className="ty-sub">
              You can answer in one sitting or come back later — your link
              stays active.
            </p>
            <div className="hero-cta-row">
              <button
                type="button"
                onClick={() => setPhase({ kind: "ready", data: phase.data })}
                className="wf-btn wf-btn-primary hero-cta"
              >
                Start Assessment
              </button>
            </div>
          </section>
        </main>
        <footer className="ty-footer">Powered by Scaling Up</footer>
      </div>
    );
  }

  const submitting = phase.kind === "submitting";
  const data = phase.data;

  return (
    <div className="ty-page">
      <header className="ty-header">
        <span className="ty-brand">Scaling Up</span>
        <span>{data.campaign.name}</span>
      </header>
      <main className="survey-body">
        <form onSubmit={handleSubmit} className="survey-form">
          <section className="ty-card" aria-labelledby="survey-title">
            <span className="hero-eyebrow">Survey</span>
            <h1 className="ty-title" id="survey-title">
              {data.campaign.name}
            </h1>
            <p className="ty-lede">
              Please rate each item below and submit when you&apos;re done.
            </p>
          </section>

          {sortedSections.map((section) => {
            const list = questionsBySection.get(section.stableKey) ?? [];
            if (list.length === 0) return null;
            return (
              <section key={section.stableKey} className="ty-card survey-section">
                <h2 className="survey-section-title">
                  {section.partLabel ? `${section.partLabel}: ` : ""}
                  {section.name}
                </h2>
                {section.description ? (
                  <p className="survey-section-desc">{section.description}</p>
                ) : null}
                <ul className="survey-question-list">
                  {list.map((q) => (
                    <li key={q.stableKey} className="survey-question">
                      <label
                        htmlFor={`q-${q.stableKey}`}
                        className="survey-question-label"
                      >
                        {q.label}
                        {q.isRequired ? (
                          <span className="survey-required"> *</span>
                        ) : null}
                      </label>
                      {q.helpText ? (
                        <p className="survey-question-help">{q.helpText}</p>
                      ) : null}
                      <QuestionInput
                        question={q}
                        value={answers[q.stableKey]}
                        onChange={(sk, v) =>
                          setAnswers((prev) => ({ ...prev, [sk]: v }))
                        }
                        disabled={submitting}
                      />
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}

          <div className="survey-submit-row">
            <button
              type="submit"
              disabled={submitting}
              className="wf-btn wf-btn-primary"
            >
              {submitting ? "Submitting…" : "Submit"}
            </button>
          </div>
        </form>
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
