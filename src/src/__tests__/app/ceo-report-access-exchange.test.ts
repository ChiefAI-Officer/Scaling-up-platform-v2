jest.mock("next/server", () => ({
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) =>
      new Response(JSON.stringify(body), {
        status: init?.status ?? 200,
        headers: init?.headers,
      }),
  },
}));

const mockRouterReplace = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockRouterReplace }),
}));

const mockVerify = jest.fn();
const mockAuthorize = jest.fn();
const mockSession = { save: jest.fn() };
const mockGetSession = jest.fn();
const mockAudit = jest.fn();

jest.mock("@/lib/assessments/ceo-report-access-token", () => ({
  verifyCeoReportAccessToken: (...args: unknown[]) => mockVerify(...args),
}));
jest.mock("@/lib/assessments/ceo-report-access", () => ({
  authorizeCeoReportAccess: (...args: unknown[]) => mockAuthorize(...args),
}));
jest.mock("@/lib/assessments/ceo-report-access-cookie", () => ({
  getCeoReportAccessSession: (...args: unknown[]) => mockGetSession(...args),
}));
jest.mock("@/lib/audit", () => ({
  logAuditStrict: (...args: unknown[]) => mockAudit(...args),
}));
jest.mock("@/lib/db", () => ({ db: { marker: "db" } }));

import { POST } from "@/app/(report)/assessments/self-report/exchange/route";
import { render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { CeoReportAccessExchange } from "@/components/assessments/CeoReportAccessExchange";

const rawToken = "raw-secret-token-must-never-escape";
const claims = {
  version: 1,
  purpose: "assessment-report-comparison-self",
  focusCampaignId: "campaign / 1",
  invitationId: "invitation-1",
  respondentId: "respondent / 1",
  expiresAt: 2_000_000_000,
} as const;
const payload = {
  focusCampaignId: "campaign / 1",
  focusSubmissionId: "submission-1",
  invitationId: "invitation-1",
  respondentId: "respondent / 1",
  expiresAt: "2033-05-18T03:33:20.000Z",
};

function request(body: string): Parameters<typeof POST>[0] {
  return new Request("https://platform.example/assessments/self-report/exchange", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  }) as Parameters<typeof POST>[0];
}

async function expectUnavailable(response: Response) {
  expect(response.status).toBe(410);
  expect(response.headers.get("Cache-Control")).toBe("no-store, private");
  expect(response.headers.get("Referrer-Policy")).toBe("no-referrer");
  await expect(response.json()).resolves.toEqual({ error: "This report link is no longer available." });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockVerify.mockReturnValue(claims);
  mockAuthorize.mockResolvedValue(payload);
  mockGetSession.mockResolvedValue(mockSession);
  mockAudit.mockResolvedValue(undefined);
  mockSession.save.mockResolvedValue(undefined);
});

describe("CEO report access exchange", () => {
  it("returns the generic no-store failure for malformed JSON without examining a token", async () => {
    const response = await POST(request("not json"));

    await expectUnavailable(response);
    expect(mockVerify).not.toHaveBeenCalled();
    expect(mockAuthorize).not.toHaveBeenCalled();
    expect(mockGetSession).not.toHaveBeenCalled();
    expect(mockAudit).not.toHaveBeenCalled();
  });

  it("exchanges a live grant into its exact-path sealed session and returns only the canonical href", async () => {
    const response = await POST(request(JSON.stringify({ token: rawToken })));

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store, private");
    expect(response.headers.get("Referrer-Policy")).toBe("no-referrer");
    await expect(response.json()).resolves.toEqual({
      href: "/assessments/campaign%20%2F%201/respondents/respondent%20%2F%201/report",
    });
    expect(mockVerify).toHaveBeenCalledWith(rawToken);
    expect(mockAuthorize).toHaveBeenCalledWith({ marker: "db" }, claims);
    expect(mockGetSession).toHaveBeenCalledWith("campaign / 1", "respondent / 1");
    expect(mockSession).toMatchObject(payload);
    expect(mockSession.save).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["expired", null],
    ["tampered", null],
    ["revoked", null],
    ["wrong CEO", null],
  ])("returns the same unavailable response for a %s capability", async (_case, authorization) => {
    mockAuthorize.mockResolvedValue(authorization);
    if (_case === "expired" || _case === "tampered") mockVerify.mockReturnValue(null);

    await expectUnavailable(await POST(request(JSON.stringify({ token: rawToken }))));
    expect(mockGetSession).not.toHaveBeenCalled();
    expect(mockAudit).not.toHaveBeenCalled();
  });

  it("keeps the raw capability out of the response, audit record, and logger", async () => {
    const logger = jest.spyOn(console, "error").mockImplementation(() => undefined);
    const response = await POST(request(JSON.stringify({ token: rawToken })));
    const body = JSON.stringify(await response.json());

    expect(body).not.toContain(rawToken);
    expect(JSON.stringify(mockAudit.mock.calls)).not.toContain(rawToken);
    expect(JSON.stringify(logger.mock.calls)).not.toContain(rawToken);
    logger.mockRestore();
  });

  it("writes the strict exchange audit before saving the sealed session", async () => {
    await POST(request(JSON.stringify({ token: rawToken })));

    expect(mockAudit).toHaveBeenCalledWith({
      entityType: "AssessmentSubmission",
      entityId: "submission-1",
      action: "CEO_REPORT_ACCESS_EXCHANGED",
      performedBy: "ceo-self-access",
      changes: {
        kind: "ceo-report-access-exchange",
        focusCampaignId: "campaign / 1",
        invitationId: "invitation-1",
        respondentId: "respondent / 1",
      },
    });
    expect(mockAudit.mock.invocationCallOrder[0]).toBeLessThan(
      mockSession.save.mock.invocationCallOrder[0],
    );
  });

  it("does not mint a session when the strict audit cannot be saved", async () => {
    mockAudit.mockRejectedValue(new Error("audit unavailable"));

    await expectUnavailable(await POST(request(JSON.stringify({ token: rawToken }))));
    expect(mockSession.save).not.toHaveBeenCalled();
  });
});

describe("CEO report fragment exchange shell", () => {
  const exchangeHref = "/assessments/campaign-1/respondents/respondent-1/report";
  let storageSetItem: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    window.history.replaceState(null, "", "/assessments/self-report#t=raw-secret-token-must-never-escape");
    (globalThis as unknown as { fetch: jest.Mock }).fetch = jest.fn();
    jest.spyOn(window.history, "replaceState");
    storageSetItem = jest.spyOn(Storage.prototype, "setItem");
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("exchanges only a #t fragment once, cleans the URL first, and redirects to the server canonical href", async () => {
    const fetchMock = (globalThis as unknown as { fetch: jest.Mock }).fetch;
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ href: exchangeHref }) });

    render(createElement(CeoReportAccessExchange));

    await waitFor(() => expect(mockRouterReplace).toHaveBeenCalledWith(exchangeHref));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("/assessments/self-report/exchange", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      cache: "no-store",
      body: JSON.stringify({ token: rawToken }),
    });
    expect(window.history.replaceState).toHaveBeenCalledWith(
      null,
      "",
      "/assessments/self-report",
    );
    expect(window.history.replaceState.mock.invocationCallOrder[0]).toBeLessThan(
      mockRouterReplace.mock.invocationCallOrder[0],
    );
    expect(storageSetItem).not.toHaveBeenCalled();
  });

  it("removes an absent or non-token fragment before rendering the generic unavailable outcome", async () => {
    window.history.replaceState(null, "", "/assessments/self-report#not-a-token=raw-secret-token-must-never-escape");

    render(createElement(CeoReportAccessExchange));

    expect(await screen.findByText("This report link is no longer available.")).toBeInTheDocument();
    expect((globalThis as unknown as { fetch: jest.Mock }).fetch).not.toHaveBeenCalled();
    expect(window.history.replaceState).toHaveBeenCalledWith(
      null,
      "",
      "/assessments/self-report",
    );
    expect(mockRouterReplace).not.toHaveBeenCalled();
  });

  it("removes a valid-looking fragment before rendering the generic unavailable outcome when exchange fails", async () => {
    const fetchMock = (globalThis as unknown as { fetch: jest.Mock }).fetch;
    fetchMock.mockResolvedValue({ ok: false });

    render(createElement(CeoReportAccessExchange));

    expect(await screen.findByText("This report link is no longer available.")).toBeInTheDocument();
    expect(window.history.replaceState).toHaveBeenCalledWith(
      null,
      "",
      "/assessments/self-report",
    );
    expect(mockRouterReplace).not.toHaveBeenCalled();
  });
});
