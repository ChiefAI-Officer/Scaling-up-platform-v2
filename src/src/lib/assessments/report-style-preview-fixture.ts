import type { ScoredReportQuestionView, ScoredReportViewModel } from "@/lib/assessments/scored-report-view-model";
import { formatReportDate } from "@/lib/assessments/report-presentation";

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return value;
}

function question(
  stableKey: string,
  label: string,
  value: number,
  achieved: boolean,
): ScoredReportQuestionView {
  return {
    stableKey,
    label,
    unmapped: false,
    value,
    maximum: 10,
    scoreLabel: `${value} / 10`,
    achieved,
    achievementMarker: null,
  };
}

/** Fixed, synthetic-only content used to render report-style previews. */
export const REPORT_STYLE_PREVIEW_FIXTURE: ScoredReportViewModel = deepFreeze({
  identity: {
    assessmentName: "Scaling Up Full",
    campaignLabel: "Annual planning workshop",
    campaignSubtitle: "Annual planning workshop",
    respondentName: "Alex Rivera",
    respondentEmail: null,
    respondentNameIsEmail: false,
    jobTitle: "Chief Executive Officer",
    companyName: "ABC Corp",
    submittedAtLabel: formatReportDate(new Date("2026-01-15T12:00:00.000Z")),
  },
  summary: {
    headline: "68 / 100",
    headlineLabel: "ScaleUp",
    tierMessage: null,
    showTier: false,
    neutral: false,
    overallAverage: 6.8,
    overallAverageLabel: "6.8",
    overallTotal: 136,
    overallTotalLabel: "136",
    answeredItems: 20,
    sectionCount: 5,
    achievementMarkersVisible: false,
  },
  decisions: [
    { stableKey: "people", label: "People", averageAcrossSections: 7.5, averageAcrossSectionsLabel: "7.5", totalPoints: 30, totalPointsLabel: "30", color: "#f7a600" },
    { stableKey: "strategy", label: "Strategy", averageAcrossSections: 7, averageAcrossSectionsLabel: "7", totalPoints: 28, totalPointsLabel: "28", color: "#008bd2" },
    { stableKey: "execution", label: "Execution", averageAcrossSections: 6, averageAcrossSectionsLabel: "6", totalPoints: 24, totalPointsLabel: "24", color: "#946b36" },
    { stableKey: "cash", label: "Cash", averageAcrossSections: 5.5, averageAcrossSectionsLabel: "5.5", totalPoints: 22, totalPointsLabel: "22", color: "#95c11f" },
    { stableKey: "you", label: "You", averageAcrossSections: 8, averageAcrossSectionsLabel: "8", totalPoints: 32, totalPointsLabel: "32", color: "#522583" },
  ],
  insights: {
    strengths: [{ stableKey: "you", label: "You", averageAcrossSections: 8, averageAcrossSectionsLabel: "8", totalPoints: 32, totalPointsLabel: "32", color: "#522583" }],
    priorities: [{ stableKey: "cash", label: "Cash", averageAcrossSections: 5.5, averageAcrossSectionsLabel: "5.5", totalPoints: 22, totalPointsLabel: "22", color: "#95c11f" }],
  },
  sections: [
    {
      stableKey: "people", label: "People", domain: "people", color: "#f7a600", totalPoints: 30, totalPointsLabel: "30", averagePoints: 7.5, averagePointsLabel: "7.5", achievedCount: 4, totalCount: 4,
      questions: [
        question("people-accountability", "Everyone has a clear accountabilities map", 8, true),
        question("people-feedback", "We resolve performance gaps quickly and fairly", 8, true),
        question("people-talent", "We hire people who raise the standard", 7, true),
        question("people-values", "Our values guide difficult decisions", 7, true),
      ],
    },
    {
      stableKey: "strategy", label: "Strategy", domain: "strategy", color: "#008bd2", totalPoints: 28, totalPointsLabel: "28", averagePoints: 7, averagePointsLabel: "7", achievedCount: 3, totalCount: 4,
      questions: [
        question("strategy-words", "Our strategic choices are understood across the company", 7, true),
        question("strategy-differentiator", "Customers can explain why they choose us", 7, true),
        question("strategy-brand", "Our brand promise is credible", 7, true),
        question("strategy-focus", "We decline distractions outside our strategy", 7, false),
      ],
    },
    {
      stableKey: "execution", label: "Execution", domain: "execution", color: "#946b36", totalPoints: 24, totalPointsLabel: "24", averagePoints: 6, averagePointsLabel: "6", achievedCount: 2, totalCount: 4,
      questions: [
        question("execution-priorities", "Our quarterly priorities have a single accountable owner", 6, false),
        question("execution-data", "We use a small set of visible measures", 6, true),
        question("execution-rhythm", "Meetings create decisions and commitments", 6, true),
        question("execution-follow-through", "We close the loop on commitments", 6, false),
      ],
    },
    {
      stableKey: "cash", label: "Cash", domain: "cash", color: "#95c11f", totalPoints: 22, totalPointsLabel: "22", averagePoints: 5.5, averagePointsLabel: "5.5", achievedCount: 1, totalCount: 4,
      questions: [
        question("cash-cycle", "We actively improve our cash conversion cycle", 5, false),
        question("cash-forecast", "Our cash forecast drives weekly action", 5, false),
        question("cash-pricing", "We price for value and margin", 6, true),
        question("cash-terms", "Payment terms are consistently managed", 6, false),
      ],
    },
    {
      stableKey: "you", label: "You", domain: "you", color: "#522583", totalPoints: 32, totalPointsLabel: "32", averagePoints: 8, averagePointsLabel: "8", achievedCount: 4, totalCount: 4,
      questions: [
        question("you-energy", "I protect the energy needed to lead", 8, true),
        question("you-focus", "I make time for the work only I can do", 8, true),
        question("you-feedback", "I invite direct feedback", 8, true),
        question("you-learning", "I keep learning with intention", 8, true),
      ],
    },
  ],
  orphanQuestions: [],
  scorecard: {
    visible: true,
    rows: [
      { stableKey: "people", label: "People", color: "#f7a600", totalPoints: 30, totalPointsLabel: "30", averagePoints: 7.5, averagePointsLabel: "7.5" },
      { stableKey: "strategy", label: "Strategy", color: "#008bd2", totalPoints: 28, totalPointsLabel: "28", averagePoints: 7, averagePointsLabel: "7" },
      { stableKey: "execution", label: "Execution", color: "#946b36", totalPoints: 24, totalPointsLabel: "24", averagePoints: 6, averagePointsLabel: "6" },
      { stableKey: "cash", label: "Cash", color: "#95c11f", totalPoints: 22, totalPointsLabel: "22", averagePoints: 5.5, averagePointsLabel: "5.5" },
      { stableKey: "you", label: "You", color: "#522583", totalPoints: 32, totalPointsLabel: "32", averagePoints: 8, averagePointsLabel: "8" },
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
  findingRecommendations: [],
  additionalResponses: [
    { label: "What would make the biggest difference this quarter?", answer: "A shared rhythm for turning strategic choices into weekly commitments, without losing the candor that made our planning workshop useful." },
  ],
  cta: {
    eligible: true,
    contactEmail: null,
    label: "Talk to a Coach →",
    href: "https://scalingup.com/coaches",
    learnMoreHref: "https://scalingup.com",
  },
  coach: { name: "Your Scaling Up Coach", logoUrl: null },
  provenance: { submissionId: null, versionId: null, contentHash: null, templateName: "Scaling Up Full", imported: false },
  closingGreeting: "Alex",
  degraded: false,
});
