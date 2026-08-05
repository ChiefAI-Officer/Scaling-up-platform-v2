import type { ScoredReportViewModel } from "@/lib/assessments/scored-report-view-model";

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return value;
}

/** Fixed, synthetic-only content used to render report-style previews. */
export const REPORT_STYLE_PREVIEW_FIXTURE: ScoredReportViewModel = deepFreeze({
  identity: {
    assessmentName: "Scaling Up Full",
    campaignLabel: "Annual planning workshop",
    respondentName: "Alex Rivera",
    respondentEmail: null,
    respondentNameIsEmail: false,
    jobTitle: "Chief Executive Officer",
    companyName: "ABC Corp",
    submittedAtLabel: "15 January 2026",
  },
  summary: {
    headline: "68 / 100",
    headlineLabel: "ScaleUp",
    tierMessage: null,
    showTier: false,
    neutral: false,
    overallAverage: 6.8,
    overallTotal: 136,
    answeredItems: 20,
    sectionCount: 4,
  },
  decisions: [
    { stableKey: "people", label: "People", averageAcrossSections: 7.5, totalPoints: 38, color: "#f7a600" },
    { stableKey: "strategy", label: "Strategy", averageAcrossSections: 7, totalPoints: 35, color: "#008bd2" },
    { stableKey: "execution", label: "Execution", averageAcrossSections: 6, totalPoints: 31, color: "#946b36" },
    { stableKey: "cash", label: "Cash", averageAcrossSections: 5.5, totalPoints: 32, color: "#95c11f" },
  ],
  insights: {
    strengths: [{ stableKey: "people", label: "People", averageAcrossSections: 7.5, totalPoints: 38, color: "#f7a600" }],
    priorities: [{ stableKey: "cash", label: "Cash", averageAcrossSections: 5.5, totalPoints: 32, color: "#95c11f" }],
  },
  sections: [
    {
      stableKey: "people", label: "People", domain: "people", color: "#f7a600", totalPoints: 38, averagePoints: 7.5, achievedCount: 4, totalCount: 5,
      questions: [
        { stableKey: "people-accountability", label: "Everyone has a clear accountabilities map", unmapped: false, value: 8, maximum: 10, achieved: true },
        { stableKey: "people-feedback", label: "We resolve performance gaps quickly and fairly", unmapped: false, value: 7, maximum: 10, achieved: true },
      ],
    },
    {
      stableKey: "strategy", label: "Strategy", domain: "strategy", color: "#008bd2", totalPoints: 35, averagePoints: 7, achievedCount: 3, totalCount: 5,
      questions: [
        { stableKey: "strategy-words", label: "Our strategic choices are understood across the company", unmapped: false, value: 7, maximum: 10, achieved: true },
        { stableKey: "strategy-differentiator", label: "Customers can explain why they choose us", unmapped: false, value: 7, maximum: 10, achieved: true },
      ],
    },
    {
      stableKey: "execution", label: "Execution", domain: "execution", color: "#946b36", totalPoints: 31, averagePoints: 6, achievedCount: 3, totalCount: 5,
      questions: [
        { stableKey: "execution-priorities", label: "Our quarterly priorities have a single accountable owner", unmapped: false, value: 6, maximum: 10, achieved: false },
      ],
    },
    {
      stableKey: "cash", label: "Cash", domain: "cash", color: "#95c11f", totalPoints: 32, averagePoints: 5.5, achievedCount: 2, totalCount: 5,
      questions: [
        { stableKey: "cash-cycle", label: "We actively improve our cash conversion cycle", unmapped: false, value: 5, maximum: 10, achieved: false },
      ],
    },
  ],
  orphanQuestions: [],
  scorecard: {
    visible: true,
    rows: [
      { stableKey: "people", label: "People", color: "#f7a600", totalPoints: 38, averagePoints: 7.5 },
      { stableKey: "strategy", label: "Strategy", color: "#008bd2", totalPoints: 35, averagePoints: 7 },
      { stableKey: "execution", label: "Execution", color: "#946b36", totalPoints: 31, averagePoints: 6 },
      { stableKey: "cash", label: "Cash", color: "#95c11f", totalPoints: 32, averagePoints: 5.5 },
    ],
    total: { totalPoints: 136, overallAverage: 6.8 },
  },
  recommendations: [
    {
      sectionStableKey: "cash",
      label: "Cash",
      items: [{
        stableKey: "cash-cycle",
        text: "Create a weekly cash conversion review with one owner for receivables, inventory, and commitments. Use the first two cycles to identify where decisions wait unnecessarily, then publish a small operating rule that keeps those decisions moving without adding another meeting to every calendar.",
      }],
    },
    {
      sectionStableKey: "execution",
      label: "Execution",
      items: [{ stableKey: "execution-priorities", text: "Give every quarterly priority one accountable owner and a visible weekly measure." }],
    },
  ],
  additionalResponses: [
    { label: "What would make the biggest difference this quarter?", answer: "A shared rhythm for turning strategic choices into weekly commitments, without losing the candor that made our planning workshop useful." },
  ],
  cta: { eligible: true, contactEmail: null },
  coach: { name: "Your Scaling Up Coach", logoUrl: null },
  provenance: { submissionId: null, versionId: null, contentHash: null, templateName: "Scaling Up Full", imported: false },
  closingGreeting: "Alex",
  degraded: false,
});
