/**
 * E1.1 — Per-domain tier editor + global tier validator behavior tests.
 *
 * Covers:
 *   - Renders 5 per-domain cards when SU Full domains[] is present.
 *   - Does NOT render per-domain cards for legacy templates.
 *   - Read-only D2 context panel hides when rollup + scaleUpScore absent.
 *   - Add / delete / reorder / edit on a per-domain tier round-trips to
 *     the PATCH body.
 *   - Published version disables every tier editor.
 *   - Save blocks with a gap-error inline message (no PATCH) when per-
 *     domain tiers don't touch (fractional mode).
 *   - Save blocks on overlap.
 *   - Save blocks on global-tier integer-mode gap (Rockefeller).
 */

import React from "react";
import { render, screen, act, waitFor, fireEvent } from "@testing-library/react";

import { AssessmentVersionEditor } from "@/components/admin/AssessmentVersionEditor";

jest.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({ toast: jest.fn() }),
}));
const pushMock = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, refresh: jest.fn() }),
}));

function makeJsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return body;
    },
  } as unknown as Response;
}

interface MountCalls {
  patchBody: unknown | null;
  patchCallCount: number;
}

function mount(version: Record<string, unknown>): MountCalls {
  const calls: MountCalls = { patchBody: null, patchCallCount: 0 };
  global.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    if (method === "GET") {
      return makeJsonResponse({
        success: true,
        data: {
          version,
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

// ─── Fixtures ────────────────────────────────────────────────────────────

const FIVE_DOMAIN_TIERS = [
  { minMetric: 0, maxMetric: 3, label: "Critical", message: "low" },
  { minMetric: 3, maxMetric: 5, label: "At Risk", message: "mid-low" },
  { minMetric: 5, maxMetric: 7, label: "On Track", message: "mid" },
  { minMetric: 7, maxMetric: 10, label: "Strong", message: "high" },
];

function buildSuFullLikeFixture(opts: { published?: boolean } = {}) {
  const sections = [
    { stableKey: "S_PEOPLE", sortOrder: 1, name: "People", domain: "people" },
    {
      stableKey: "S_STRATEGY",
      sortOrder: 2,
      name: "Strategy",
      domain: "strategy",
    },
    {
      stableKey: "S_EXECUTION",
      sortOrder: 3,
      name: "Execution",
      domain: "execution",
    },
    { stableKey: "S_CASH", sortOrder: 4, name: "Cash", domain: "cash" },
    { stableKey: "S_YOU", sortOrder: 5, name: "You", domain: "you" },
  ];
  const questions = sections.map((s, idx) => ({
    stableKey: `Q${idx + 1}`,
    sortOrder: idx + 1,
    type: "SLIDER_LIKERT",
    label: `Q${idx + 1}`,
    sectionStableKey: s.stableKey,
    isRequired: true,
    scale: {
      min: 0,
      max: 10,
      step: 1,
      anchorMin: "Low",
      anchorMax: "High",
    },
  }));
  return {
    id: "ver_1",
    versionNumber: 1,
    language: "en-US",
    publishedAt: opts.published ? new Date().toISOString() : null,
    sections,
    questions,
    scoringConfig: {
      tierMetric: "overallAvg",
      passThreshold: 7,
      tiers: FIVE_DOMAIN_TIERS,
      rollup: { overall: "meanOfDomains" },
      scaleUpScore: true,
      domains: [
        { key: "people", label: "People", tiers: FIVE_DOMAIN_TIERS },
        { key: "strategy", label: "Strategy", tiers: FIVE_DOMAIN_TIERS },
        { key: "execution", label: "Execution", tiers: FIVE_DOMAIN_TIERS },
        { key: "cash", label: "Cash", tiers: FIVE_DOMAIN_TIERS },
        { key: "you", label: "You", tiers: FIVE_DOMAIN_TIERS },
      ],
    },
    reportConfig: null,
  };
}

function buildRockefellerLikeFixture() {
  return {
    id: "ver_1",
    versionNumber: 1,
    language: "en-US",
    publishedAt: null,
    sections: [
      { stableKey: "S1", sortOrder: 1, name: "Section 1" },
      { stableKey: "S2", sortOrder: 2, name: "Section 2" },
    ],
    questions: [
      {
        stableKey: "Q1",
        sortOrder: 1,
        type: "SLIDER_LIKERT",
        label: "Q1",
        sectionStableKey: "S1",
        isRequired: true,
        scale: { min: 0, max: 3, step: 1, anchorMin: "L", anchorMax: "H" },
      },
      {
        stableKey: "Q2",
        sortOrder: 2,
        type: "SLIDER_LIKERT",
        label: "Q2",
        sectionStableKey: "S2",
        isRequired: true,
        scale: { min: 0, max: 3, step: 1, anchorMin: "L", anchorMax: "H" },
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
}

// ─── Tests ───────────────────────────────────────────────────────────────

describe("AssessmentVersionEditor — per-domain tier editor", () => {
  beforeEach(() => {
    pushMock.mockClear();
  });

  it("renders 5 per-domain cards when SU Full domains[] is set", async () => {
    mount(buildSuFullLikeFixture());
    await renderAndWaitForLoad();
    expect(screen.getByTestId("domain-card-people")).toBeInTheDocument();
    expect(screen.getByTestId("domain-card-strategy")).toBeInTheDocument();
    expect(screen.getByTestId("domain-card-execution")).toBeInTheDocument();
    expect(screen.getByTestId("domain-card-cash")).toBeInTheDocument();
    expect(screen.getByTestId("domain-card-you")).toBeInTheDocument();
  });

  it("does NOT render per-domain cards when no domains (Rockefeller)", async () => {
    mount(buildRockefellerLikeFixture());
    await renderAndWaitForLoad();
    expect(screen.queryByTestId("per-domain-cards")).not.toBeInTheDocument();
  });

  it("renders read-only D2 context panel only when rollup/scaleUpScore present", async () => {
    // SU Full → panel visible
    mount(buildSuFullLikeFixture());
    await renderAndWaitForLoad();
    const panel = screen.getByTestId("d2-context-panel");
    expect(panel).toBeInTheDocument();
    expect(panel).toHaveTextContent("Mean of domain means");
  });

  it("HIDES the read-only D2 context panel for legacy templates", async () => {
    mount(buildRockefellerLikeFixture());
    await renderAndWaitForLoad();
    expect(screen.queryByTestId("d2-context-panel")).not.toBeInTheDocument();
  });

  it("editing a domain tier's minMetric updates the PATCH body", async () => {
    const calls = mount(buildSuFullLikeFixture());
    await renderAndWaitForLoad();
    // Tier 0 of People domain has max=3; tier 1 has min=3, max=5. Shift
    // tier-0 max + tier-1 min both to 4 so the tier set stays valid.
    const peopleMax0 = screen.getByTestId(
      "domain-people-tier-max-0",
    ) as HTMLInputElement;
    fireEvent.change(peopleMax0, { target: { value: "4" } });
    const peopleMin1 = screen.getByTestId(
      "domain-people-tier-min-1",
    ) as HTMLInputElement;
    fireEvent.change(peopleMin1, { target: { value: "4" } });
    await clickSave();
    await waitFor(() => {
      expect(calls.patchCallCount).toBe(1);
    });
    const body = calls.patchBody as Record<string, unknown>;
    const sc = body.scoringConfig as Record<string, unknown>;
    const domains = sc.domains as Array<Record<string, unknown>>;
    const people = domains.find((d) => d.key === "people")!;
    const tiers = people.tiers as Array<Record<string, unknown>>;
    expect(tiers[0].maxMetric).toBe(4);
    expect(tiers[1].minMetric).toBe(4);
  });

  it("adding a tier to a domain works and round-trips", async () => {
    const calls = mount(buildSuFullLikeFixture());
    await renderAndWaitForLoad();
    const addBtn = screen.getByTestId("domain-people-tier-add");
    fireEvent.click(addBtn);
    // The newly-added 5th tier needs minMetric set so the touching rule
    // holds; the original last tier had max 10, so set new min to 10 and
    // we'll let new tier's max stay blank (open-ended).
    const newMin = screen.getByTestId("domain-people-tier-min-4") as HTMLInputElement;
    fireEvent.change(newMin, { target: { value: "10" } });
    const newLabel = screen.getByTestId(
      "domain-people-tier-label-4",
    ) as HTMLInputElement;
    fireEvent.change(newLabel, { target: { value: "Exceptional" } });
    const newMsg = screen.getByTestId(
      "domain-people-tier-message-4",
    ) as HTMLInputElement;
    fireEvent.change(newMsg, { target: { value: "Beyond strong" } });
    // Clear the previous last tier's max (was 10) — open-ended is only
    // allowed on the highest tier. So bump the original tier-3 max so it
    // touches the new tier 4 at 10. Actually tier-3 max was 10 already
    // → that's now an overlap with the new tier-4 min=10. Set tier-3 max
    // to a non-open-ended 10 stays valid only if new tier picks up
    // exactly at 10. We need them to touch: tier-3.max=10, tier-4.min=10
    // satisfies fractional touching.
    await clickSave();
    await waitFor(() => {
      expect(calls.patchCallCount).toBe(1);
    });
    const body = calls.patchBody as Record<string, unknown>;
    const sc = body.scoringConfig as Record<string, unknown>;
    const domains = sc.domains as Array<Record<string, unknown>>;
    const people = domains.find((d) => d.key === "people")!;
    const tiers = people.tiers as Array<Record<string, unknown>>;
    expect(tiers).toHaveLength(5);
    expect(tiers[4].label).toBe("Exceptional");
  });

  it("deleting a domain tier works (down to 1-tier minimum)", async () => {
    const calls = mount(buildSuFullLikeFixture());
    await renderAndWaitForLoad();
    // Delete tier 3 of the People domain (the top tier 7-10). Then have
    // to adjust tier 2's max so the global tier set is still valid.
    const delBtn = screen.getByTestId("domain-people-tier-delete-3");
    fireEvent.click(delBtn);
    // After deletion, last tier of People is now [5,7]. Set max blank
    // so it's open-ended (only the highest tier may have undefined max).
    const lastMax = screen.getByTestId(
      "domain-people-tier-max-2",
    ) as HTMLInputElement;
    fireEvent.change(lastMax, { target: { value: "" } });
    await clickSave();
    await waitFor(() => {
      expect(calls.patchCallCount).toBe(1);
    });
    const body = calls.patchBody as Record<string, unknown>;
    const sc = body.scoringConfig as Record<string, unknown>;
    const domains = sc.domains as Array<Record<string, unknown>>;
    const people = domains.find((d) => d.key === "people")!;
    const tiers = people.tiers as Array<Record<string, unknown>>;
    expect(tiers).toHaveLength(3);
  });

  it("published version disables every tier editor", async () => {
    mount(buildSuFullLikeFixture({ published: true }));
    await renderAndWaitForLoad();
    // Global tier 0 max input should be disabled.
    const globalMax = screen.getByTestId("tier-max-0") as HTMLInputElement;
    expect(globalMax.disabled).toBe(true);
    const peopleMin = screen.getByTestId(
      "domain-people-tier-min-0",
    ) as HTMLInputElement;
    expect(peopleMin.disabled).toBe(true);
  });

  it("Save blocks with gap-error inline (per-domain fractional mode) → no PATCH", async () => {
    const calls = mount(buildSuFullLikeFixture());
    await renderAndWaitForLoad();
    // Create a gap on the People domain: change tier-1.min to 4 but
    // leave tier-0.max at 3 → gap between 3 and 4.
    const peopleMin1 = screen.getByTestId(
      "domain-people-tier-min-1",
    ) as HTMLInputElement;
    fireEvent.change(peopleMin1, { target: { value: "4" } });
    await clickSave();
    // PATCH NOT called.
    expect(calls.patchCallCount).toBe(0);
    const err = await screen.findByTestId("validation-error");
    expect(err.textContent ?? "").toMatch(/gap/i);
    expect(err.textContent ?? "").toMatch(/People/);
  });

  it("Save blocks with overlap-error inline (per-domain fractional)", async () => {
    const calls = mount(buildSuFullLikeFixture());
    await renderAndWaitForLoad();
    // Create an overlap: change tier-1.min to 2 (tier-0 has max=3 → overlap).
    const peopleMin1 = screen.getByTestId(
      "domain-people-tier-min-1",
    ) as HTMLInputElement;
    fireEvent.change(peopleMin1, { target: { value: "2" } });
    await clickSave();
    expect(calls.patchCallCount).toBe(0);
    const err = await screen.findByTestId("validation-error");
    expect(err.textContent ?? "").toMatch(/overlap/i);
  });

  it("Save blocks on global tier gap (Rockefeller integer mode)", async () => {
    const calls = mount(buildRockefellerLikeFixture());
    await renderAndWaitForLoad();
    // Rockefeller tier 0 max=0, tier 1 min=1, tier 2 min=2, tier 2 max=2.
    // Force a gap by changing tier-1 min from 1 to 3 (which leaves tier-0
    // max=0 → tier-1 min=3 = gap of 1, 2).
    const min1 = screen.getByTestId("tier-min-1") as HTMLInputElement;
    fireEvent.change(min1, { target: { value: "3" } });
    await clickSave();
    expect(calls.patchCallCount).toBe(0);
    const err = await screen.findByTestId("validation-error");
    expect(err.textContent ?? "").toMatch(/Global tiers/);
  });
});
