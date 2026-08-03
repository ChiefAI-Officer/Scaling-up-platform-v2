import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AssessmentEmailDeliveryHolds } from "@/components/admin/AssessmentEmailDeliveryHolds";

const PREVIEW_DOCUMENT = `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; base-uri 'none'; connect-src 'none'; font-src 'none'; form-action 'none'; frame-src 'none'; img-src data:; media-src 'none'; object-src 'none'; script-src 'none'; style-src 'unsafe-inline'; navigate-to 'none';"><meta name="referrer" content="no-referrer"></head><body><p>Frozen report</p></body></html>`;

const LIST_ROW = {
  id: "intent-1",
  version: 7,
  submissionId: "submission-1",
  campaignId: "campaign-1",
  recipientRole: "RESPONDENT",
  emailType: "ASSESSMENT_RESULTS",
  maskedRecipient: "p***@example.com",
  holdReason: "CAMPAIGN_STATUS_CHANGED",
  createdAt: "2026-08-01T10:00:00.000Z",
  heldAt: "2026-08-03T04:00:00.000Z",
  expiresAt: "2026-09-02T10:00:00.000Z",
  provenance: {
    templateId: "template-1",
    versionId: "version-1",
    templateAlias: "qsp-v2",
    reportType: "ASSESSMENT_RESULTS",
    rendererContractVersion: 1,
  },
};

const DETAIL = {
  id: "intent-1",
  submissionId: "submission-1",
  campaignId: "campaign-1",
  invitationId: "invitation-1",
  respondentId: "respondent-1",
  recipientRole: "RESPONDENT",
  emailType: "ASSESSMENT_RESULTS",
  recipientEmail: "person@example.com",
  subject: "Frozen private subject",
  previewDocument: PREVIEW_DOCUMENT,
  payloadHash: "a".repeat(64),
  snapshotSchemaVersion: 1,
  rendererContractVersion: 1,
  authorizationSnapshot: {
    schemaVersion: 1,
    common: {
      campaignStatus: "ACTIVE",
      closeAt: "2026-08-30T00:00:00.000Z",
      invitationStatus: "SUBMITTED",
      invitationExpiresAt: "2026-08-20T00:00:00.000Z",
      templateAlias: "qsp-v2",
      versionId: "version-1",
    },
    respondentResults: {
      canonicalRecipientMailbox: "person@example.com",
      sendResultsToRespondent: true,
      approved: true,
    },
  },
  contentProvenance: {
    templateId: "template-1",
    versionId: "version-1",
    templateAlias: "qsp-v2",
    reportType: "ASSESSMENT_RESULTS",
    rendererContractVersion: 1,
  },
  status: "HELD",
  version: 7,
  holdReason: "CAMPAIGN_STATUS_CHANGED",
  holdReasons: ["CAMPAIGN_STATUS_CHANGED"],
  heldAt: "2026-08-03T04:00:00.000Z",
  expiresAt: "2026-09-02T10:00:00.000Z",
  current: {
    campaign: {
      exists: true,
      status: "CLOSED",
      closeAt: "2026-08-30T00:00:00.000Z",
      templateId: "template-1",
      versionId: "version-1",
    },
    invitation: {
      exists: true,
      status: "SUBMITTED",
      expiresAt: "2026-08-20T00:00:00.000Z",
    },
    respondent: {
      exists: true,
      canonicalMailbox: "person@example.com",
    },
    template: {
      exists: true,
      alias: "qsp-v2",
      resultsEmailApproved: true,
    },
    features: {
      resultsEmailEnabled: true,
      coachNotifyEnabled: true,
    },
  },
  drift: {
    kind: "HELD",
    primaryReason: "CAMPAIGN_STATUS_CHANGED",
    reasons: ["CAMPAIGN_STATUS_CHANGED"],
  },
  reviewContextHash: "b".repeat(64),
  reviewToken: "opaque-review-token",
};

type MockResponse = {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
};

function response(body: unknown, status = 200): MockResponse {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

function mockedFetch(): jest.MockedFunction<typeof fetch> {
  return global.fetch as jest.MockedFunction<typeof fetch>;
}

async function renderQueueAndOpenDetail() {
  mockedFetch()
    .mockResolvedValueOnce(response({ data: [LIST_ROW], nextCursor: null }) as Response)
    .mockResolvedValueOnce(response({ data: DETAIL }) as Response);

  render(<AssessmentEmailDeliveryHolds />);
  expect(await screen.findByText("p***@example.com")).toBeInTheDocument();
  expect(screen.queryByText("person@example.com")).not.toBeInTheDocument();

  fireEvent.click(
    screen.getByRole("button", { name: "Review p***@example.com" }),
  );
  expect(
    (await screen.findAllByText("person@example.com")).length,
  ).toBeGreaterThan(0);
}

beforeEach(() => {
  global.fetch = jest.fn();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("AssessmentEmailDeliveryHolds", () => {
  it("keeps the list masked and reveals one audited frozen preview with drift after selection", async () => {
    await renderQueueAndOpenDetail();

    expect(screen.getByText("Frozen private subject")).toBeInTheDocument();
    expect(screen.getByText("Frozen payload — review only")).toBeInTheDocument();
    expect(screen.getByText("ACTIVE")).toBeInTheDocument();
    expect(screen.getByText("CLOSED")).toBeInTheDocument();

    const preview = screen.getByTitle("Frozen email preview");
    expect(preview).toHaveAttribute("sandbox", "");
    expect(preview).toHaveAttribute("referrerpolicy", "no-referrer");
    expect(preview.getAttribute("srcdoc")).toContain("default-src 'none'");
    expect(preview.getAttribute("srcdoc")).not.toContain(
      "https://tracker.example",
    );

    for (const forbidden of [/edit/i, /download/i, /export/i, /copy/i]) {
      expect(
        screen.queryByRole("button", { name: forbidden }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("link", { name: forbidden }),
      ).not.toBeInTheDocument();
    }
  });

  it("releases the exact reviewed version and token, then removes the resolved row", async () => {
    await renderQueueAndOpenDetail();
    mockedFetch().mockResolvedValueOnce(
      response({
        data: {
          intentId: "intent-1",
          status: "HANDED_OFF",
          version: 8,
          outboxId: "outbox-1",
          existingOutboxWon: false,
        },
      }) as Response,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Release frozen payload" }),
    );

    await waitFor(() =>
      expect(screen.queryByText("p***@example.com")).not.toBeInTheDocument(),
    );
    expect(screen.queryByTitle("Frozen email preview")).not.toBeInTheDocument();
    expect(mockedFetch()).toHaveBeenLastCalledWith(
      "/api/admin/assessment-email-delivery-intents/intent-1/release",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          expectedVersion: 7,
          reasonCode: "DRIFT_REVIEWED_SEND_FROZEN",
          reviewToken: "opaque-review-token",
        }),
      }),
    );
  });

  it("cancels with one fixed reason and never submits the review token", async () => {
    await renderQueueAndOpenDetail();
    mockedFetch().mockResolvedValueOnce(
      response({
        data: {
          intentId: "intent-1",
          status: "CANCELLED",
          version: 8,
          outboxId: null,
          existingOutboxWon: false,
        },
      }) as Response,
    );

    fireEvent.change(screen.getByLabelText("Cancellation reason"), {
      target: { value: "POLICY_DECISION" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Cancel permanently" }));

    await waitFor(() =>
      expect(screen.queryByText("p***@example.com")).not.toBeInTheDocument(),
    );
    expect(mockedFetch()).toHaveBeenLastCalledWith(
      "/api/admin/assessment-email-delivery-intents/intent-1/cancel",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          expectedVersion: 7,
          reasonCode: "POLICY_DECISION",
        }),
      }),
    );
    const init = mockedFetch().mock.calls.at(-1)?.[1] as RequestInit;
    expect(init.body).not.toContain("reviewToken");
  });

  it("blocks stale release state and prompts an audited detail refresh", async () => {
    await renderQueueAndOpenDetail();
    mockedFetch().mockResolvedValueOnce(
      response({ error: "VERSION_CONFLICT" }, 409) as Response,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Release frozen payload" }),
    );

    expect(
      await screen.findByText(
        "This review is stale. Refresh the held intent before resolving it.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Refresh review" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Release frozen payload" }),
    ).toBeDisabled();
  });

  it("fails closed when a nominal resolution response has an invalid shape", async () => {
    await renderQueueAndOpenDetail();
    mockedFetch().mockResolvedValueOnce(response({ data: {} }) as Response);

    fireEvent.click(
      screen.getByRole("button", { name: "Release frozen payload" }),
    );

    expect(
      await screen.findByText(
        "The held intent was not resolved. Refresh its detail and try again.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("p***@example.com")).toBeInTheDocument();
    expect(screen.getByTitle("Frozen email preview")).toBeInTheDocument();
  });
});
