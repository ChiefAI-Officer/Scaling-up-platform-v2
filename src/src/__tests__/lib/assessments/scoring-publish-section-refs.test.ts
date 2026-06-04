import { TemplateVersionForPublishSchema } from "@/lib/assessments/scoring";

const base = {
  sections: [{ stableKey: "S1", sortOrder: 1, name: "One" }],
  scoringConfig: { tierMetric: "countAchieved", passThreshold: 2, tiers: [{ minMetric: 0, maxMetric: 1, label: "x", message: "y" }] },
};
const slider = (stableKey: string, sectionStableKey: string | undefined) => ({
  stableKey, sortOrder: 1, type: "SLIDER_LIKERT", label: stableKey, sectionStableKey, isRequired: true,
  scale: { min: 0, max: 1, step: 1, anchorMin: "a", anchorMax: "b" },
});

it("rejects a question whose sectionStableKey does not resolve to a defined section", () => {
  const res = TemplateVersionForPublishSchema.safeParse({ ...base, questions: [slider("q1", "GHOST")] });
  expect(res.success).toBe(false);
  if (!res.success) expect(res.error.issues.some((i) => i.path.join(".").startsWith("questions") && /section/i.test(i.message))).toBe(true);
});

it("allows a question with NO section key (renders in Other fallback) — not a publish error", () => {
  // NOTE: this minimal fixture may fail OTHER publish checks (tier tiling); we assert only that NO section-ref issue is raised.
  const res = TemplateVersionForPublishSchema.safeParse({ ...base, questions: [slider("q1", undefined)] });
  const sectionRefIssues = res.success ? [] : res.error.issues.filter((i) => /resolve|unknown section/i.test(i.message));
  expect(sectionRefIssues).toEqual([]);
});

it("does NOT require every section to have a question (empty welcome/closing sections allowed)", () => {
  const res = TemplateVersionForPublishSchema.safeParse({
    sections: [{ stableKey: "S0", sortOrder: 1, name: "Welcome" }, { stableKey: "S1", sortOrder: 2, name: "One" }],
    scoringConfig: base.scoringConfig,
    questions: [slider("q1", "S1")],
  });
  const emptySectionIssues = res.success ? [] : res.error.issues.filter((i) => /no questions/i.test(i.message));
  expect(emptySectionIssues).toEqual([]);
});
