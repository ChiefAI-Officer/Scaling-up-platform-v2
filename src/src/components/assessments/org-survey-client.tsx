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
  scale: ScaleConfig;
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
  | { kind: "ready"; data: SurveyData }
  | { kind: "submitting"; data: SurveyData }
  | { kind: "error"; message: string };

export function OrgSurveyClient({ campaignAlias }: { campaignAlias: string }) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>({ kind: "exchanging" });
  const [answers, setAnswers] = useState<Record<string, number>>({});

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
        if (!cancelled) setPhase({ kind: "ready", data: meBody.data });
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
    if (phase.kind !== "ready" && phase.kind !== "submitting") return [];
    return [...phase.data.sections].sort((a, b) => a.sortOrder - b.sortOrder);
  }, [phase]);

  const questionsBySection = useMemo<Map<string, Question[]>>(() => {
    const out = new Map<string, Question[]>();
    if (phase.kind !== "ready" && phase.kind !== "submitting") return out;
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
      .filter((q) => answers[q.stableKey] === undefined)
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
      <main className="max-w-2xl mx-auto px-6 py-16">
        <p className="text-slate-500">Loading your survey…</p>
      </main>
    );
  }

  if (phase.kind === "error") {
    return (
      <main className="max-w-2xl mx-auto px-6 py-16">
        <h1 className="text-2xl font-semibold text-slate-900 mb-2">
          We can&apos;t open this survey
        </h1>
        <p className="text-slate-700">{phase.message}</p>
      </main>
    );
  }

  const submitting = phase.kind === "submitting";
  const data = phase.data;

  return (
    <main className="max-w-2xl mx-auto px-6 py-12">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold text-slate-900">
          {data.campaign.name}
        </h1>
        <p className="text-slate-600 mt-2 text-sm">
          Please rate each item below and submit when you&apos;re done.
        </p>
      </header>
      <form onSubmit={handleSubmit} className="space-y-10">
        {sortedSections.map((section) => {
          const list = questionsBySection.get(section.stableKey) ?? [];
          if (list.length === 0) return null;
          return (
            <section key={section.stableKey} className="space-y-4">
              <h2 className="text-lg font-medium text-slate-900">
                {section.partLabel ? `${section.partLabel}: ` : ""}
                {section.name}
              </h2>
              {section.description ? (
                <p className="text-sm text-slate-600">{section.description}</p>
              ) : null}
              <ul className="space-y-6">
                {list.map((q) => (
                  <li key={q.stableKey} className="space-y-2">
                    <label
                      htmlFor={`q-${q.stableKey}`}
                      className="block text-sm font-medium text-slate-800"
                    >
                      {q.label}
                      {q.isRequired ? <span className="text-rose-500"> *</span> : null}
                    </label>
                    {q.helpText ? (
                      <p className="text-xs text-slate-500">{q.helpText}</p>
                    ) : null}
                    <input
                      id={`q-${q.stableKey}`}
                      type="range"
                      min={q.scale.min}
                      max={q.scale.max}
                      step={q.scale.step}
                      value={answers[q.stableKey] ?? q.scale.min}
                      onChange={(e) =>
                        setAnswers((prev) => ({
                          ...prev,
                          [q.stableKey]: Number(e.target.value),
                        }))
                      }
                      className="w-full"
                      aria-valuemin={q.scale.min}
                      aria-valuemax={q.scale.max}
                      aria-valuenow={answers[q.stableKey] ?? q.scale.min}
                    />
                    <div className="flex justify-between text-xs text-slate-500">
                      <span>{q.scale.anchorMin}</span>
                      <span className="font-medium text-slate-700">
                        {answers[q.stableKey] !== undefined
                          ? answers[q.stableKey]
                          : "—"}
                      </span>
                      <span>{q.scale.anchorMax}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
        <button
          type="submit"
          disabled={submitting}
          className="inline-flex items-center justify-center rounded-md bg-blue-700 px-6 py-3 text-white font-medium hover:bg-blue-800 disabled:bg-slate-400"
        >
          {submitting ? "Submitting…" : "Submit"}
        </button>
      </form>
    </main>
  );
}

async function readError(res: Response, fallback: string): Promise<string> {
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
