/**
 * Wave N (#23) — per-respondent longitudinal PAGE tests.
 *
 * Leaf-mocked integration suite (mirrors assessment-respondent-report-page.test.tsx):
 * mocks ONLY the leaves — next/navigation (notFound/redirect digests +
 * unstable_rethrow), requireCoach, the loader, db.auditLog.create, the metrics
 * emitter, and the View component — and drives the REAL page.
 *
 * Behavior asserted (per the IMPLEMENT spec):
 *  - flag-off → notFound() (404), loader never called
 *  - missing templateId/organizationId → notFound() (404)
 *  - forbidden outcome → notFound() (404), no audit row
 *  - notApplicable (qualitative) → renders the qualitative card, no audit row
 *  - empty → renders empty, no audit row
 *  - ok → renders the view + EXACTLY ONE RESPONDENT_LONGITUDINAL_VIEW audit row
 *    whose JSON payload contains NO email / "@", carries the audit-safe counts
 *  - the page exports no-store + no-referrer metadata
 */

const ORIGINAL_ENV = { ...process.env };

jest.mock("next/navigation", () => ({
  redirect: jest.fn().mockImplementation((url: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), {
      digest: `NEXT_REDIRECT;${url}`,
    });
  }),
  notFound: jest.fn().mockImplementation(() => {
    throw Object.assign(new Error("NEXT_HTTP_ERROR_FALLBACK;404"), {
      digest: "NEXT_HTTP_ERROR_FALLBACK;404",
    });
  }),
  // Re-throw Next control-flow errors (NEXT_REDIRECT / NEXT_HTTP_ERROR_FALLBACK);
  // swallow everything else (mirrors the real unstable_rethrow contract).
  unstable_rethrow: jest.fn().mockImplementation((err: unknown) => {
    const digest = (err as { digest?: string } | undefined)?.digest;
    if (typeof digest === "string" && digest.startsWith("NEXT_")) {
      throw err;
    }
  }),
}));

jest.mock("@/lib/auth/authorization", () => ({
  requireCoach: jest.fn(),
}));

jest.mock("@/lib/assessments/respondent-longitudinal", () => ({
  getRespondentLongitudinal: jest.fn(),
  // identity bridge so the real db (mocked) flows through
  asRespondentLongitudinalDb: (x: unknown) => x,
}));

const mockEmitMetric = jest.fn();
jest.mock("@/lib/assessments/respondent-longitudinal-metrics", () => ({
  emitRespondentLongitudinalMetric: (...args: unknown[]) =>
    mockEmitMetric(...args),
}));

const mockAuditCreate = jest.fn().mockResolvedValue({ id: "audit-1" });
jest.mock("@/lib/db", () => ({
  db: {
    auditLog: { create: (...args: unknown[]) => mockAuditCreate(...args) },
  },
}));

jest.mock("@/components/assessments/RespondentLongitudinalView", () => ({
  RespondentLongitudinalView: ({
    outcome,
  }: {
    outcome: { kind: string };
  }) => (
    <div data-testid="longitudinal-view" data-kind={outcome.kind}>
      view
    </div>
  ),
}));

import { renderToStaticMarkup } from "react-dom/server";
import { notFound } from "next/navigation";
import { requireCoach } from "@/lib/auth/authorization";
import { getRespondentLongitudinal } from "@/lib/assessments/respondent-longitudinal";
import Page, {
  metadata,
} from "@/app/(portal)/portal/assessments/respondents/[respondentId]/longitudinal/page";

const mockNotFound = notFound as unknown as jest.Mock;
const mockRequireCoach = requireCoach as unknown as jest.Mock;
const mockLoader = getRespondentLongitudinal as unknown as jest.Mock;

const RESPONDENT_ID = "resp-1";
const TEMPLATE_ID = "tpl-rock";
const ORG_ID = "org-1";

function makeProps(
  overrides: {
    respondentId?: string;
    templateId?: string | undefined;
    organizationId?: string | undefined;
  } = {},
) {
  return {
    params: Promise.resolve({
      respondentId: overrides.respondentId ?? RESPONDENT_ID,
    }),
    searchParams: Promise.resolve({
      templateId:
        "templateId" in overrides ? overrides.templateId : TEMPLATE_ID,
      organizationId:
        "organizationId" in overrides ? overrides.organizationId : ORG_ID,
    }),
  };
}

function coachSession() {
  return {
    coach: { id: "coach-1" },
    session: {
      user: { id: "user-1", email: "coach@example.com", role: "COACH" },
    },
  };
}

function okOutcome() {
  return {
    kind: "ok",
    data: {
      respondent: { id: RESPONDENT_ID, name: "Alice Smith", jobTitle: "CEO" },
      companyName: "Acme Corp",
      assessment: {
        templateId: TEMPLATE_ID,
        alias: "RockHabits",
        name: "Rockefeller Habits Checklist",
      },
      matchedRespondentCount: 2,
      submissionCount: 3,
      points: [
        { campaignId: "c1", degraded: false, overall: { average: 2.1, deltaComparable: false }, rows: [] },
        { campaignId: "c2", degraded: false, overall: { average: 2.4, deltaComparable: true, delta: 0.3 }, rows: [] },
      ],
      comparableCount: 1,
      hasMultipleVersions: false,
    },
  };
}

async function renderPage(props: ReturnType<typeof makeProps>): Promise<string> {
  const element = await Page(props);
  return renderToStaticMarkup(element);
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env = { ...ORIGINAL_ENV };
  mockRequireCoach.mockResolvedValue(coachSession());
  mockAuditCreate.mockResolvedValue({ id: "audit-1" });
  // Flag ON by default; individual tests turn it off.
  process.env.WAVE_N_RESPONDENT_LONGITUDINAL_ENABLED = "1";
});

afterAll(() => {
  process.env = ORIGINAL_ENV;
});

describe("RespondentLongitudinalPage", () => {
  it("exports no-store + no-referrer metadata", () => {
    expect(metadata.referrer).toBe("no-referrer");
    expect(
      (metadata.other as Record<string, string>)["Cache-Control"],
    ).toBe("no-store, private");
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });

  it("flag OFF → notFound() (404) and the loader is never called", async () => {
    process.env.WAVE_N_RESPONDENT_LONGITUDINAL_ENABLED = "";
    delete process.env.WAVE_N_RESPONDENT_LONGITUDINAL_CANARY;
    await expect(renderPage(makeProps())).rejects.toThrow(
      "NEXT_HTTP_ERROR_FALLBACK;404",
    );
    expect(mockNotFound).toHaveBeenCalled();
    expect(mockLoader).not.toHaveBeenCalled();
    expect(mockAuditCreate).not.toHaveBeenCalled();
  });

  it("KILL switch overrides ENABLED → 404", async () => {
    process.env.WAVE_N_RESPONDENT_LONGITUDINAL_ENABLED = "1";
    process.env.WAVE_N_RESPONDENT_LONGITUDINAL_KILL = "1";
    await expect(renderPage(makeProps())).rejects.toThrow(
      "NEXT_HTTP_ERROR_FALLBACK;404",
    );
    expect(mockLoader).not.toHaveBeenCalled();
  });

  it("missing templateId → 404 before any load", async () => {
    await expect(
      renderPage(makeProps({ templateId: undefined })),
    ).rejects.toThrow("NEXT_HTTP_ERROR_FALLBACK;404");
    expect(mockLoader).not.toHaveBeenCalled();
  });

  it("missing organizationId → 404 before any load", async () => {
    await expect(
      renderPage(makeProps({ organizationId: undefined })),
    ).rejects.toThrow("NEXT_HTTP_ERROR_FALLBACK;404");
    expect(mockLoader).not.toHaveBeenCalled();
  });

  it("forbidden outcome → notFound() (404), no audit row", async () => {
    mockLoader.mockResolvedValue({ kind: "forbidden" });
    await expect(renderPage(makeProps())).rejects.toThrow(
      "NEXT_HTTP_ERROR_FALLBACK;404",
    );
    expect(mockNotFound).toHaveBeenCalled();
    expect(mockAuditCreate).not.toHaveBeenCalled();
    expect(mockEmitMetric).toHaveBeenCalledWith(
      "authz_deny",
      expect.objectContaining({ role: "COACH" }),
    );
  });

  it("notApplicable (qualitative) → renders qualitative card, no audit row", async () => {
    mockLoader.mockResolvedValue({
      kind: "notApplicable",
      reason: "qualitative-template",
    });
    const html = await renderPage(makeProps());
    expect(html).toContain('data-testid="longitudinal-view"');
    expect(html).toContain('data-kind="notApplicable"');
    expect(mockAuditCreate).not.toHaveBeenCalled();
    expect(mockEmitMetric).toHaveBeenCalledWith(
      "not_applicable",
      expect.objectContaining({ reason: "qualitative-template" }),
    );
  });

  it("empty → renders empty, no audit row", async () => {
    mockLoader.mockResolvedValue({ kind: "empty" });
    const html = await renderPage(makeProps());
    expect(html).toContain('data-kind="empty"');
    expect(mockAuditCreate).not.toHaveBeenCalled();
    expect(mockEmitMetric).toHaveBeenCalledWith(
      "empty",
      expect.objectContaining({ role: "COACH" }),
    );
  });

  it("ok → renders the view + EXACTLY ONE audit row, PII-free payload", async () => {
    mockLoader.mockResolvedValue(okOutcome());
    const html = await renderPage(makeProps());

    expect(html).toContain('data-kind="ok"');

    // Exactly one audit row, with the RESPONDENT_LONGITUDINAL_VIEW action.
    expect(mockAuditCreate).toHaveBeenCalledTimes(1);
    const auditArg = mockAuditCreate.mock.calls[0][0] as {
      data: {
        action: string;
        entityType: string;
        entityId: string;
        performedBy: string;
        changes: string;
      };
    };
    expect(auditArg.data.action).toBe("RESPONDENT_LONGITUDINAL_VIEW");
    expect(auditArg.data.entityId).toBe(RESPONDENT_ID);

    // The changes payload carries the audit-safe counts...
    const changes = JSON.parse(auditArg.data.changes);
    expect(changes.organizationId).toBe(ORG_ID);
    expect(changes.templateId).toBe(TEMPLATE_ID);
    expect(changes.matchedRespondentCount).toBe(2);
    expect(changes.submissionCount).toBe(3);

    // ...and NO raw email / "@" anywhere in the serialized changes payload.
    expect(auditArg.data.changes).not.toContain("@");
    expect(auditArg.data.changes.toLowerCase()).not.toContain("alice");
    expect(auditArg.data.changes.toLowerCase()).not.toContain("acme");

    // The success view marker fired (PII-free counts).
    expect(mockEmitMetric).toHaveBeenCalledWith(
      "view",
      expect.objectContaining({
        role: "COACH",
        template: "RockHabits",
        matchedRespondentCount: 2,
        submissionCount: 3,
        comparableCount: 1,
      }),
    );
  });

  it("ok + audit write fails → still renders the view (fail-SAFE, not fail-closed)", async () => {
    mockLoader.mockResolvedValue(okOutcome());
    mockAuditCreate.mockRejectedValueOnce(new Error("db down"));
    const html = await renderPage(makeProps());
    expect(html).toContain('data-kind="ok"');
    // The success marker still fired despite the audit failure.
    expect(mockEmitMetric).toHaveBeenCalledWith(
      "view",
      expect.objectContaining({ role: "COACH" }),
    );
  });

  it("loader throws a genuine error → render_failure metric + clean 404 (no 500)", async () => {
    mockLoader.mockRejectedValue(new Error("boom"));
    await expect(renderPage(makeProps())).rejects.toThrow(
      "NEXT_HTTP_ERROR_FALLBACK;404",
    );
    expect(mockEmitMetric).toHaveBeenCalledWith(
      "render_failure",
      expect.objectContaining({ errorClass: "Error" }),
    );
  });

  it("does not swallow a notFound() thrown inside the load try (unstable_rethrow)", async () => {
    // forbidden maps to notFound() INSIDE the try; the catch must re-throw it.
    mockLoader.mockResolvedValue({ kind: "forbidden" });
    await expect(renderPage(makeProps())).rejects.toThrow(
      "NEXT_HTTP_ERROR_FALLBACK;404",
    );
    // render_failure must NOT fire for a control-flow 404.
    expect(mockEmitMetric).not.toHaveBeenCalledWith(
      "render_failure",
      expect.anything(),
    );
  });
});
