/**
 * E1.1 — Round-trip contract tests for AssessmentVersionEditor.
 *
 * Verifies: load server JSON → click Save without UI changes → PATCH body
 * preserves the original JSON deeply. Covers SU Full (D2), Rockefeller
 * (legacy), and QSP (post-D2.0 hotfix shape).
 *
 * Plus targeted edit tests:
 *   - Modify a global tier on Rockefeller → all raw preserved
 *   - Modify a per-domain tier on SU Full → all raw preserved
 */

import React from "react";
import { render, screen, act, waitFor, fireEvent } from "@testing-library/react";

import { AssessmentVersionEditor } from "@/components/admin/AssessmentVersionEditor";

// Toast hook stub — the editor calls useToast() on mount.
jest.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({ toast: jest.fn() }),
}));

// Next.js router stub — the editor calls router.push() on save success.
const pushMock = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, refresh: jest.fn() }),
}));

// ─── Fixtures ────────────────────────────────────────────────────────────

/**
 * Minimal SU Full server JSON. Mirrors prisma/seed-scaling-up-full-assessment.ts
 * shape but with only 2 sections / 2 questions / 2 domains so tests stay
 * readable. The D2 fields (section.domain, question.recommendations,
 * scoringConfig.rollup/domains/scaleUpScore) are what we assert get
 * preserved through the round-trip.
 */
const SU_FULL_SERVER_JSON = {
  id: "ver_sufull_v1",
  versionNumber: 1,
  language: "en-US",
  publishedAt: null,
  contentHash: "abc123",
  sections: [
    {
      stableKey: "S_PEOPLE_YE",
      sortOrder: 1,
      name: "Your Employees",
      description: "Recruitment, retention, onboarding.",
      domain: "people",
    },
    {
      stableKey: "S_STRATEGY",
      sortOrder: 2,
      name: "Strategy",
      description: "Long-term goals + plan.",
      domain: "strategy",
    },
  ],
  questions: [
    {
      stableKey: "Q01",
      sortOrder: 1,
      type: "SLIDER_LIKERT",
      label: "Effective recruitment process",
      sectionStableKey: "S_PEOPLE_YE",
      isRequired: true,
      scale: {
        min: 0,
        max: 10,
        step: 1,
        anchorMin: "Not true",
        anchorMax: "Completely true",
      },
      recommendations: [
        { minScore: 0, maxScore: 3, text: "LOW band copy" },
        { minScore: 4, maxScore: 7, text: "MEDIUM band copy" },
        { minScore: 8, maxScore: 10, text: "HIGH band copy" },
      ],
    },
    {
      stableKey: "Q02",
      sortOrder: 2,
      type: "SLIDER_LIKERT",
      label: "Long-term goals",
      sectionStableKey: "S_STRATEGY",
      isRequired: true,
      scale: {
        min: 0,
        max: 10,
        step: 1,
        anchorMin: "Not true",
        anchorMax: "Completely true",
      },
      recommendations: [
        { minScore: 0, maxScore: 3, text: "LOW band copy" },
        { minScore: 4, maxScore: 7, text: "MEDIUM band copy" },
        { minScore: 8, maxScore: 10, text: "HIGH band copy" },
      ],
    },
  ],
  scoringConfig: {
    tierMetric: "overallAvg",
    passThreshold: 7,
    tiers: [
      { minMetric: 0, maxMetric: 3, label: "Critical", message: "low" },
      { minMetric: 3, maxMetric: 7, label: "At Risk", message: "mid" },
      { minMetric: 7, maxMetric: 10, label: "Strong", message: "high" },
    ],
    rollup: { overall: "meanOfDomains" },
    scaleUpScore: true,
    domains: [
      {
        key: "people",
        label: "People",
        tiers: [
          { minMetric: 0, maxMetric: 3, label: "Critical", message: "low" },
          { minMetric: 3, maxMetric: 7, label: "At Risk", message: "mid" },
          { minMetric: 7, maxMetric: 10, label: "Strong", message: "high" },
        ],
      },
      {
        key: "strategy",
        label: "Strategy",
        tiers: [
          { minMetric: 0, maxMetric: 3, label: "Critical", message: "low" },
          { minMetric: 3, maxMetric: 7, label: "At Risk", message: "mid" },
          { minMetric: 7, maxMetric: 10, label: "Strong", message: "high" },
        ],
      },
    ],
  },
  reportConfig: null,
};

/**
 * Rockefeller — legacy 4-section, countAchieved tierMetric, NO D2 fields.
 * The test asserts no spurious additions appear.
 */
const ROCKEFELLER_SERVER_JSON = {
  id: "ver_rock_v1",
  versionNumber: 1,
  language: "en-US",
  publishedAt: null,
  contentHash: "rock123",
  sections: [
    { stableKey: "S1", sortOrder: 1, name: "Section 1" },
    { stableKey: "S2", sortOrder: 2, name: "Section 2" },
  ],
  questions: [
    {
      stableKey: "Q1_1",
      sortOrder: 1,
      type: "SLIDER_LIKERT",
      label: "Q1.1",
      sectionStableKey: "S1",
      isRequired: true,
      scale: {
        min: 0,
        max: 3,
        step: 1,
        anchorMin: "Not true",
        anchorMax: "Completely true",
      },
    },
    {
      stableKey: "Q2_1",
      sortOrder: 2,
      type: "SLIDER_LIKERT",
      label: "Q2.1",
      sectionStableKey: "S2",
      isRequired: true,
      scale: {
        min: 0,
        max: 3,
        step: 1,
        anchorMin: "Not true",
        anchorMax: "Completely true",
      },
    },
  ],
  scoringConfig: {
    tierMetric: "countAchieved",
    passThreshold: 2,
    tiers: [
      { minMetric: 0, maxMetric: 0, label: "Low", message: "low" },
      { minMetric: 1, maxMetric: 1, label: "OK", message: "ok" },
      { minMetric: 2, maxMetric: 2, label: "Great", message: "great" },
    ],
  },
  reportConfig: null,
};

/**
 * QSP — post-D2.0 hotfix shape with the top-level `scale` wrapper. The
 * test asserts the wrapper round-trips even though the engine ignores it.
 */
const QSP_SERVER_JSON = {
  id: "ver_qsp_v1",
  versionNumber: 1,
  language: "en-US",
  publishedAt: null,
  contentHash: "qsp123",
  sections: [
    {
      stableKey: "S1",
      sortOrder: 1,
      name: "Strategy Tracker",
      description: "Strategic clarity",
    },
  ],
  questions: [
    {
      stableKey: "Q1",
      sortOrder: 1,
      type: "SLIDER_LIKERT",
      label: "Strategic clarity?",
      helpText: "Optional help",
      sectionStableKey: "S1",
      isRequired: true,
      scale: {
        min: 1,
        max: 10,
        step: 1,
        anchorMin: "Low",
        anchorMax: "High",
      },
    },
  ],
  scoringConfig: {
    tierMetric: "overallAvg",
    passThreshold: 7,
    scale: { min: 1, max: 10 }, // QSP wrapper field — engine ignores
    tiers: [
      {
        label: "At Risk",
        minMetric: 1,
        maxMetric: 5,
        message: "At risk message",
      },
      {
        label: "Needs Work",
        minMetric: 5,
        maxMetric: 7,
        message: "Needs work message",
      },
      {
        label: "On Track",
        minMetric: 7,
        maxMetric: 9,
        message: "On track message",
      },
      {
        label: "Strong",
        minMetric: 9,
        message: "Strong message",
      },
    ],
  },
  reportConfig: { template: "qsp-default" },
};

// ─── Test harness ────────────────────────────────────────────────────────

interface FetchCalls {
  patchBody: unknown | null;
  patchCallCount: number;
}

/**
 * Build a fake fetch Response that has `ok: true` — the jest.setup
 * polyfilled Response in this repo lacks the standard `ok` getter, so
 * components that gate on `res.ok` would otherwise see false.
 */
function makeJsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return body;
    },
  } as unknown as Response;
}

function mountWithServerJson(versionJson: Record<string, unknown>): FetchCalls {
  const calls: FetchCalls = { patchBody: null, patchCallCount: 0 };
  global.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const method = init?.method ?? "GET";
    if (method === "GET" && url.includes("/versions/")) {
      return makeJsonResponse({
        success: true,
        data: {
          version: versionJson,
          template: { id: "tpl_1", name: "Test", alias: "test" },
        },
      });
    }
    if (method === "PATCH") {
      calls.patchCallCount += 1;
      calls.patchBody = JSON.parse((init?.body as string) ?? "{}");
      return makeJsonResponse({ success: true, data: {} });
    }
    return makeJsonResponse({});
  }) as unknown as typeof fetch;
  return calls;
}

async function renderAndWaitForLoad() {
  let result: ReturnType<typeof render> | undefined;
  await act(async () => {
    result = render(
      <AssessmentVersionEditor templateId="tpl_1" versionId="ver_1" />,
    );
  });
  // Wait for the editor to finish loading.
  await waitFor(() => {
    expect(screen.queryByText(/Loading version/i)).not.toBeInTheDocument();
  });
  return result!;
}

async function clickSave() {
  const btn = await screen.findByTestId("save-version-btn");
  await act(async () => {
    fireEvent.click(btn);
  });
}

describe("AssessmentVersionEditor — D2 round-trip", () => {
  beforeEach(() => {
    pushMock.mockClear();
  });

  it("SU Full → click Save without edits → PATCH preserves every D2 field", async () => {
    const calls = mountWithServerJson(SU_FULL_SERVER_JSON);
    await renderAndWaitForLoad();
    await clickSave();
    await waitFor(() => {
      expect(calls.patchCallCount).toBe(1);
    });
    const body = calls.patchBody as Record<string, unknown>;
    // sections — domain field preserved verbatim, no spurious fields.
    expect(body.sections).toEqual(SU_FULL_SERVER_JSON.sections);
    // questions — recommendations preserved verbatim.
    expect(body.questions).toEqual(SU_FULL_SERVER_JSON.questions);
    // scoringConfig — rollup, domains, scaleUpScore all preserved.
    expect(body.scoringConfig).toMatchObject({
      rollup: { overall: "meanOfDomains" },
      scaleUpScore: true,
      domains: SU_FULL_SERVER_JSON.scoringConfig.domains,
    });
    expect(body.reportConfig).toBeNull();
  });

  it("Rockefeller (legacy) → click Save without edits → preserved, no D2 additions", async () => {
    const calls = mountWithServerJson(ROCKEFELLER_SERVER_JSON);
    await renderAndWaitForLoad();
    await clickSave();
    await waitFor(() => {
      expect(calls.patchCallCount).toBe(1);
    });
    const body = calls.patchBody as Record<string, unknown>;
    expect(body.sections).toEqual(ROCKEFELLER_SERVER_JSON.sections);
    expect(body.questions).toEqual(ROCKEFELLER_SERVER_JSON.questions);
    const sc = body.scoringConfig as Record<string, unknown>;
    expect(sc.tierMetric).toBe("countAchieved");
    expect(sc).not.toHaveProperty("rollup");
    expect(sc).not.toHaveProperty("domains");
    expect(sc).not.toHaveProperty("scaleUpScore");
  });

  it("QSP (post-D2.0) → click Save without edits → top-level `scale` wrapper preserved", async () => {
    const calls = mountWithServerJson(QSP_SERVER_JSON);
    await renderAndWaitForLoad();
    await clickSave();
    await waitFor(() => {
      expect(calls.patchCallCount).toBe(1);
    });
    const body = calls.patchBody as Record<string, unknown>;
    const sc = body.scoringConfig as Record<string, unknown>;
    expect(sc.scale).toEqual({ min: 1, max: 10 });
    expect(body.reportConfig).toEqual({ template: "qsp-default" });
  });

  it("modify a global tier on Rockefeller → updated tier + every raw field preserved (esp. stableKeys)", async () => {
    const calls = mountWithServerJson(ROCKEFELLER_SERVER_JSON);
    await renderAndWaitForLoad();
    // Tweak the global tier-0 label.
    const labelInput = screen.getByTestId("tier-label-0") as HTMLInputElement;
    fireEvent.change(labelInput, { target: { value: "Low (edited)" } });
    await clickSave();
    await waitFor(() => {
      expect(calls.patchCallCount).toBe(1);
    });
    const body = calls.patchBody as Record<string, unknown>;
    // Sections + questions stableKeys preserved verbatim (not regenerated
    // to S1 / Q1 etc).
    expect(body.sections).toEqual(ROCKEFELLER_SERVER_JSON.sections);
    expect(body.questions).toEqual(ROCKEFELLER_SERVER_JSON.questions);
    const sc = body.scoringConfig as Record<string, unknown>;
    const tiers = sc.tiers as Array<Record<string, unknown>>;
    expect(tiers[0].label).toBe("Low (edited)");
    expect(tiers[1].label).toBe("OK");
    expect(tiers[2].label).toBe("Great");
  });

  it("modify a per-domain tier on SU Full → updated domain tier + everything else preserved", async () => {
    const calls = mountWithServerJson(SU_FULL_SERVER_JSON);
    await renderAndWaitForLoad();
    const peopleMin = screen.getByTestId(
      "domain-people-tier-min-1",
    ) as HTMLInputElement;
    // The original tier 1 of the People domain has minMetric: 3. Bump to 4.
    fireEvent.change(peopleMin, { target: { value: "4" } });
    // Also have to keep tier-touching consistent with the bumped value;
    // change tier 0's max to 4 to preserve touching.
    const peopleMax0 = screen.getByTestId(
      "domain-people-tier-max-0",
    ) as HTMLInputElement;
    fireEvent.change(peopleMax0, { target: { value: "4" } });
    await clickSave();
    await waitFor(() => {
      expect(calls.patchCallCount).toBe(1);
    });
    const body = calls.patchBody as Record<string, unknown>;
    // sections + questions preserved.
    expect(body.sections).toEqual(SU_FULL_SERVER_JSON.sections);
    expect(body.questions).toEqual(SU_FULL_SERVER_JSON.questions);
    // rollup + scaleUpScore preserved.
    const sc = body.scoringConfig as Record<string, unknown>;
    expect(sc.rollup).toEqual({ overall: "meanOfDomains" });
    expect(sc.scaleUpScore).toBe(true);
    // The People domain's tier 1 minMetric is 4, tier 0 max is 4.
    const domains = sc.domains as Array<Record<string, unknown>>;
    const people = domains.find((d) => d.key === "people")!;
    const peopleTiers = people.tiers as Array<Record<string, unknown>>;
    expect(peopleTiers[0].maxMetric).toBe(4);
    expect(peopleTiers[1].minMetric).toBe(4);
    // Strategy domain untouched.
    const strategy = domains.find((d) => d.key === "strategy")!;
    expect(strategy.tiers).toEqual(
      SU_FULL_SERVER_JSON.scoringConfig.domains[1].tiers,
    );
  });
});
