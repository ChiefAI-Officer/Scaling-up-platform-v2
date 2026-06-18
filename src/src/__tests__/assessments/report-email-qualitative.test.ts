/**
 * Assessment v7.6 Wave E (Task 11) — qualitative email twin.
 *
 * The EMAIL twin of the on-screen QualitativeReport. Unlike React, inline-HTML
 * string assembly does NOT auto-escape — so respondent free-text answers are an
 * injection surface. These tests assert:
 *
 *  - Dispatch: a qualitative-alias report (qsp-v2 / LVA) renders the respondent's
 *    own answers and DOES NOT render the scored anatomy (score table / ring /
 *    "Score summary" / "All sections").
 *  - R2-H3 escaping: every respondent-controlled value (answer text, labels,
 *    options) is HTML-escaped; a percent value is clamped to [0,100] before it
 *    ever reaches a style="width:N%".
 *  - R1-M5 size budget: a huge text answer is truncated to the cap with the
 *    truncated indicator; a worst-case many-long-answers body stays ≤ budget.
 *  - R2-M6 defensive render: a malformed item shape does not throw — the rest of
 *    the report still renders.
 *
 * Fixtures are inline — NO DB.
 */

import {
  buildReportEmailHtml,
  QUAL_EMAIL_ANSWER_CAP,
  QUAL_EMAIL_BYTE_BUDGET,
} from "@/lib/assessments/report-email";
import type { RespondentReport } from "@/lib/assessments/respondent-report";
import type { ScoreResult } from "@/lib/assessments/scoring";
import type { QMeta } from "@/lib/assessments/qualitative-report-model";

// ── Fixture builder ──────────────────────────────────────────────────────────

interface QualFixtureArgs {
  templateAlias: string;
  sections: Array<{ stableKey: string; name: string; description?: string }>;
  questionsByKey: Record<string, QMeta>;
  rawAnswers: Array<{ stableKey: string; value: unknown }>;
  questionByKey?: Record<string, string>;
}

function qualReport(args: QualFixtureArgs): RespondentReport {
  const questionByKey: Record<string, string> =
    args.questionByKey ??
    Object.fromEntries(
      Object.entries(args.questionsByKey).map(([k, m]) => [k, m.label]),
    );
  return {
    respondentName: "Jane Doe",
    jobTitle: null,
    companyName: "Acme Corp",
    assessmentName: "Leadership Vision Alignment",
    templateAlias: args.templateAlias,
    campaignLabel: null,
    submittedAt: new Date("2026-06-17T10:00:00Z"),
    result: {} as ScoreResult,
    sections: args.sections,
    questionByKey,
    questionsByKey: args.questionsByKey,
    rawAnswers: args.rawAnswers,
    scoringConfig: {},
    provenance: {
      submissionId: "sub-1",
      versionId: "ver-1",
      contentHash: "hash",
      templateName: "Leadership Vision Alignment",
    },
    degraded: false,
  };
}

// ── Dispatch ─────────────────────────────────────────────────────────────────

describe("buildReportEmailHtml — qualitative dispatch", () => {
  it("renders the respondent's answer text (qsp-v2 qualitative alias)", () => {
    const { bodyHtml } = buildReportEmailHtml({
      report: qualReport({
        templateAlias: "qsp-v2",
        sections: [{ stableKey: "P3_growth_challenge", name: "Growth & Challenge" }],
        questionsByKey: {
          p3_q: {
            type: "TEXT",
            label: "What was your biggest win?",
            sectionStableKey: "P3_growth_challenge",
          },
        },
        rawAnswers: [{ stableKey: "p3_q", value: "We closed a major enterprise deal." }],
      }),
      recipientRole: "TAKER_COPY",
    });
    expect(bodyHtml).toContain("We closed a major enterprise deal.");
    expect(bodyHtml).toContain("What was your biggest win?");
  });

  it("does NOT render the scored anatomy for a qualitative report", () => {
    const { bodyHtml } = buildReportEmailHtml({
      report: qualReport({
        templateAlias: "leadership-vision-alignment",
        sections: [{ stableKey: "S2_vision", name: "Vision on the Future" }],
        questionsByKey: {
          v1: { type: "TEXT", label: "Our main Products in three years", sectionStableKey: "S2_vision" },
        },
        rawAnswers: [{ stableKey: "v1", value: "Cloud platform" }],
      }),
      recipientRole: "TAKER_COPY",
    });
    // Scored markers must be absent.
    expect(bodyHtml).not.toContain("Score summary");
    expect(bodyHtml).not.toContain("How you scored, by decision");
    expect(bodyHtml).not.toContain("Detailed breakdown");
    // The qualitative section heading renders.
    expect(bodyHtml).toContain("Vision on the Future");
  });

  it("renders MULTI_CHOICE option picks (choices section)", () => {
    const { bodyHtml } = buildReportEmailHtml({
      report: qualReport({
        templateAlias: "leadership-vision-alignment",
        sections: [{ stableKey: "S4_obstacles", name: "Biggest Obstacles" }],
        questionsByKey: {
          obs: {
            type: "MULTI_CHOICE",
            label: "Pick the biggest obstacles",
            sectionStableKey: "S4_obstacles",
          },
        },
        rawAnswers: [{ stableKey: "obs", value: ["Sales pipeline", "Cash flow"] }],
      }),
      recipientRole: "TAKER_COPY",
    });
    expect(bodyHtml).toContain("Sales pipeline");
    expect(bodyHtml).toContain("Cash flow");
  });
});

// ── R2-H3 — escape everything respondent-controlled ──────────────────────────

describe("buildReportEmailHtml — qualitative escaping (R2-H3)", () => {
  it("escapes a <script> TEXT answer (no live tag)", () => {
    const { bodyHtml } = buildReportEmailHtml({
      report: qualReport({
        templateAlias: "leadership-vision-alignment",
        sections: [{ stableKey: "S2_vision", name: "Vision" }],
        questionsByKey: {
          v1: { type: "TEXT", label: "Vision", sectionStableKey: "S2_vision" },
        },
        rawAnswers: [{ stableKey: "v1", value: "<script>alert(1)</script>" }],
      }),
      recipientRole: "TAKER_COPY",
    });
    expect(bodyHtml).not.toContain("<script>alert(1)</script>");
    expect(bodyHtml).toContain("&lt;script&gt;");
  });

  it("escapes an img-onerror injection answer", () => {
    const { bodyHtml } = buildReportEmailHtml({
      report: qualReport({
        templateAlias: "leadership-vision-alignment",
        sections: [{ stableKey: "S2_vision", name: "Vision" }],
        questionsByKey: {
          v1: { type: "TEXT", label: "Vision", sectionStableKey: "S2_vision" },
        },
        rawAnswers: [{ stableKey: "v1", value: '"><img src=x onerror=y>' }],
      }),
      recipientRole: "TAKER_COPY",
    });
    expect(bodyHtml).not.toContain("<img src=x onerror=y>");
    expect(bodyHtml).toContain("&lt;img src=x onerror=y&gt;");
  });

  it("escapes a question label containing markup", () => {
    const { bodyHtml } = buildReportEmailHtml({
      report: qualReport({
        templateAlias: "leadership-vision-alignment",
        sections: [{ stableKey: "S2_vision", name: "Vision" }],
        questionsByKey: {
          v1: { type: "TEXT", label: "Our <b>main</b> products", sectionStableKey: "S2_vision" },
        },
        rawAnswers: [{ stableKey: "v1", value: "SaaS" }],
      }),
      recipientRole: "TAKER_COPY",
    });
    expect(bodyHtml).not.toContain("<b>main</b>");
    expect(bodyHtml).toContain("&lt;b&gt;main&lt;/b&gt;");
  });

  it("escapes a MULTI_CHOICE option label containing markup", () => {
    const { bodyHtml } = buildReportEmailHtml({
      report: qualReport({
        templateAlias: "leadership-vision-alignment",
        sections: [{ stableKey: "S4_obstacles", name: "Obstacles" }],
        questionsByKey: {
          obs: { type: "MULTI_CHOICE", label: "Pick obstacles", sectionStableKey: "S4_obstacles" },
        },
        rawAnswers: [{ stableKey: "obs", value: ["<svg onload=1>"] }],
      }),
      recipientRole: "TAKER_COPY",
    });
    expect(bodyHtml).not.toContain("<svg onload=1>");
    expect(bodyHtml).toContain("&lt;svg onload=1&gt;");
  });

  it("clamps an out-of-range percent value into [0,100] before the style width", () => {
    const overReport = qualReport({
      templateAlias: "leadership-vision-alignment",
      sections: [{ stableKey: "S6_focus", name: "Focus" }],
      questionsByKey: {
        rehire: {
          type: "NUMBER",
          label: "Rehire %",
          sectionStableKey: "S6_focus",
          min: 0,
          max: 100,
        },
      },
      rawAnswers: [{ stableKey: "rehire", value: 9999 }],
    });
    const { bodyHtml } = buildReportEmailHtml({
      report: overReport,
      recipientRole: "TAKER_COPY",
    });
    // Every width:N% in the body must have N in [0,100].
    const widths = [...bodyHtml.matchAll(/width:\s*(-?\d+)%/g)].map((m) =>
      Number(m[1]),
    );
    expect(widths.length).toBeGreaterThan(0);
    for (const w of widths) {
      expect(w).toBeGreaterThanOrEqual(0);
      expect(w).toBeLessThanOrEqual(100);
    }
    // The raw 9999 never appears as a literal style width.
    expect(bodyHtml).not.toContain("width:9999%");
    expect(bodyHtml).not.toContain("width: 9999%");
  });

  it("clamps a negative percent value into [0,100]", () => {
    const { bodyHtml } = buildReportEmailHtml({
      report: qualReport({
        templateAlias: "leadership-vision-alignment",
        sections: [{ stableKey: "S6_focus", name: "Focus" }],
        questionsByKey: {
          rehire: {
            type: "NUMBER",
            label: "Rehire %",
            sectionStableKey: "S6_focus",
            min: 0,
            max: 100,
          },
        },
        rawAnswers: [{ stableKey: "rehire", value: -5 }],
      }),
      recipientRole: "TAKER_COPY",
    });
    const widths = [...bodyHtml.matchAll(/width:\s*(-?\d+)%/g)].map((m) =>
      Number(m[1]),
    );
    for (const w of widths) {
      expect(w).toBeGreaterThanOrEqual(0);
      expect(w).toBeLessThanOrEqual(100);
    }
    expect(bodyHtml).not.toMatch(/width:\s*-/);
  });
});

// ── R1-M5 — size budget + truncation ─────────────────────────────────────────

describe("buildReportEmailHtml — qualitative size budget (R1-M5)", () => {
  it("truncates a 10,000-char answer to <= cap with a truncated indicator", () => {
    const huge = "A".repeat(10_000);
    const { bodyHtml } = buildReportEmailHtml({
      report: qualReport({
        templateAlias: "leadership-vision-alignment",
        sections: [{ stableKey: "S2_vision", name: "Vision" }],
        questionsByKey: {
          v1: { type: "TEXT", label: "Vision", sectionStableKey: "S2_vision" },
        },
        rawAnswers: [{ stableKey: "v1", value: huge }],
      }),
      recipientRole: "TAKER_COPY",
    });
    // The run of 'A' in the body must not exceed the cap.
    const longestRun = (bodyHtml.match(/A+/g) ?? [])
      .map((s) => s.length)
      .reduce((a, b) => Math.max(a, b), 0);
    expect(longestRun).toBeLessThanOrEqual(QUAL_EMAIL_ANSWER_CAP);
    expect(bodyHtml).toContain("truncated");
  });

  it("keeps the total body within the byte budget for a worst-case many-long-answers report", () => {
    const longAnswer = "Lorem ipsum dolor sit amet ".repeat(100); // ~2700 chars
    const sections = Array.from({ length: 40 }, (_, i) => ({
      stableKey: `S${i}`,
      name: `Section ${i}`,
    }));
    const questionsByKey: Record<string, QMeta> = {};
    const rawAnswers: Array<{ stableKey: string; value: unknown }> = [];
    for (let i = 0; i < 40; i++) {
      for (let j = 0; j < 5; j++) {
        const key = `S${i}_q${j}`;
        questionsByKey[key] = {
          type: "TEXT",
          label: `Question ${i}.${j}`,
          sectionStableKey: `S${i}`,
        };
        rawAnswers.push({ stableKey: key, value: longAnswer });
      }
    }
    const { bodyHtml } = buildReportEmailHtml({
      report: qualReport({
        templateAlias: "leadership-vision-alignment",
        sections,
        questionsByKey,
        rawAnswers,
      }),
      recipientRole: "TAKER_COPY",
    });
    expect(Buffer.byteLength(bodyHtml, "utf8")).toBeLessThanOrEqual(
      QUAL_EMAIL_BYTE_BUDGET + 20_000, // body budget + bounded shell overhead
    );
    expect(bodyHtml).toContain("report truncated for email");
  });
});

// ── R2-M6 — defensive render ─────────────────────────────────────────────────

describe("buildReportEmailHtml — qualitative defensive render (R2-M6)", () => {
  it("does not throw on a malformed item value (object where a scalar is expected)", () => {
    expect(() =>
      buildReportEmailHtml({
        report: qualReport({
          templateAlias: "leadership-vision-alignment",
          sections: [{ stableKey: "S2_vision", name: "Vision" }],
          questionsByKey: {
            ok: { type: "TEXT", label: "OK question", sectionStableKey: "S2_vision" },
            bad: { type: "TEXT", label: "Bad question", sectionStableKey: "S2_vision" },
          },
          rawAnswers: [
            { stableKey: "ok", value: "a fine answer" },
            // A pathological shape — must not throw the whole email.
            { stableKey: "bad", value: { nested: { deep: [1, 2, 3] } } as unknown },
          ],
        }),
        recipientRole: "TAKER_COPY",
      }),
    ).not.toThrow();
  });

  it("still renders the good items when a sibling item is malformed", () => {
    const { bodyHtml } = buildReportEmailHtml({
      report: qualReport({
        templateAlias: "leadership-vision-alignment",
        sections: [{ stableKey: "S2_vision", name: "Vision" }],
        questionsByKey: {
          ok: { type: "TEXT", label: "OK question", sectionStableKey: "S2_vision" },
          bad: { type: "TEXT", label: "Bad question", sectionStableKey: "S2_vision" },
        },
        rawAnswers: [
          { stableKey: "ok", value: "a fine answer" },
          { stableKey: "bad", value: { nested: true } as unknown },
        ],
      }),
      recipientRole: "TAKER_COPY",
    });
    expect(bodyHtml).toContain("a fine answer");
  });

  it("returns a renderError signal + safe fallback body if the whole render fails", () => {
    // A report whose sections JSON is corrupt enough that buildQualitativeModel
    // returns nothing usable still produces a non-throwing, safe body.
    const result = buildReportEmailHtml({
      report: qualReport({
        templateAlias: "leadership-vision-alignment",
        sections: [],
        questionsByKey: {},
        rawAnswers: [],
      }),
      recipientRole: "TAKER_COPY",
    });
    // No throw; a body is always returned.
    expect(typeof result.bodyHtml).toBe("string");
    expect(result.bodyHtml.length).toBeGreaterThan(0);
  });
});
