import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
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

const LIST_ROW_B = {
  ...LIST_ROW,
  id: "intent-2",
  version: 11,
  submissionId: "submission-2",
  campaignId: "campaign-2",
  maskedRecipient: "s***@example.net",
};

const DETAIL_B = {
  ...DETAIL,
  id: "intent-2",
  submissionId: "submission-2",
  campaignId: "campaign-2",
  invitationId: "invitation-2",
  respondentId: "respondent-2",
  recipientEmail: "second@example.net",
  subject: "Second frozen subject",
  version: 11,
  reviewToken: "second-review-token",
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

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolver) => {
    resolve = resolver;
  });
  return { promise, resolve };
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

  it.each([
    ["a mismatched intent id", { ...DETAIL, id: "intent-other" }],
    ["a non-held status", { ...DETAIL, status: "HANDED_OFF" }],
    [
      "a raw payload field",
      { ...DETAIL, bodyHtml: "<p>raw payload must not cross the boundary</p>" },
    ],
  ])("rejects detail response with %s", async (_label, unsafeDetail) => {
    mockedFetch()
      .mockResolvedValueOnce(
        response({ data: [LIST_ROW], nextCursor: null }) as Response,
      )
      .mockResolvedValueOnce(response({ data: unsafeDetail }) as Response);

    render(<AssessmentEmailDeliveryHolds />);
    expect(await screen.findByText("p***@example.com")).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Review p***@example.com" }),
    );

    expect(
      await screen.findByText(
        "The audited held-intent detail could not be loaded. Try again.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("Frozen private subject")).not.toBeInTheDocument();
    expect(screen.queryByTitle("Frozen email preview")).not.toBeInTheDocument();
    expect(
      screen.queryByText("raw payload must not cross the boundary"),
    ).not.toBeInTheDocument();
  });

  it.each(["release", "cancel"] as const)(
    "keeps the selected and resolvable intent bound to B when A detail resolves late before %s",
    async (action) => {
      const a = deferred<Response>();
      const b = deferred<Response>();
      mockedFetch()
        .mockResolvedValueOnce(
          response({ data: [LIST_ROW, LIST_ROW_B], nextCursor: null }) as Response,
        )
        .mockReturnValueOnce(a.promise)
        .mockReturnValueOnce(b.promise);

      render(<AssessmentEmailDeliveryHolds />);
      expect(await screen.findByText("p***@example.com")).toBeInTheDocument();
      expect(screen.getByText("s***@example.net")).toBeInTheDocument();

      fireEvent.click(
        screen.getByRole("button", { name: "Review p***@example.com" }),
      );
      fireEvent.click(
        screen.getByRole("button", { name: "Review s***@example.net" }),
      );

      await act(async () => {
        b.resolve(response({ data: DETAIL_B }) as Response);
        await b.promise;
      });
      expect(await screen.findByText("Second frozen subject")).toBeInTheDocument();

      await act(async () => {
        a.resolve(response({ data: DETAIL }) as Response);
        await a.promise;
      });
      await waitFor(() => {
        expect(screen.getByText("Second frozen subject")).toBeInTheDocument();
        expect(
          screen.queryByText("Frozen private subject"),
        ).not.toBeInTheDocument();
      });
      expect(
        screen.getByRole("button", { name: "Review s***@example.net" }),
      ).toHaveAttribute("aria-pressed", "true");
      expect(
        screen.getByRole("button", { name: "Review p***@example.com" }),
      ).toHaveAttribute("aria-pressed", "false");

      mockedFetch().mockResolvedValueOnce(
        response({
          data: {
            intentId: "intent-2",
            status: action === "release" ? "HANDED_OFF" : "CANCELLED",
            version: 12,
            outboxId: action === "release" ? "outbox-2" : null,
            existingOutboxWon: false,
          },
        }) as Response,
      );
      if (action === "release") {
        fireEvent.click(
          screen.getByRole("button", { name: "Release frozen payload" }),
        );
      } else {
        fireEvent.change(screen.getByLabelText("Cancellation reason"), {
          target: { value: "POLICY_DECISION" },
        });
        fireEvent.click(
          screen.getByRole("button", { name: "Cancel permanently" }),
        );
      }

      await waitFor(() =>
        expect(screen.queryByText("s***@example.net")).not.toBeInTheDocument(),
      );
      expect(screen.getByText("p***@example.com")).toBeInTheDocument();
      expect(mockedFetch()).toHaveBeenLastCalledWith(
        `/api/admin/assessment-email-delivery-intents/intent-2/${action}`,
        expect.objectContaining({ method: "POST" }),
      );
      expect(
        mockedFetch().mock.calls.some(
          ([url]) =>
            url ===
            `/api/admin/assessment-email-delivery-intents/intent-1/${action}`,
        ),
      ).toBe(false);
    },
  );

  it("shows every multi-reason respondent hold and the complete frozen/current safety evidence", async () => {
    const frozenApprovalHash = "f".repeat(64);
    const storedApprovalHash = "c".repeat(64);
    const liveApprovalHash = "d".repeat(64);
    const multiReasonDetail = {
      ...DETAIL,
      authorizationSnapshot: {
        schemaVersion: 1,
        common: {
          campaignId: "campaign-1",
          invitationId: "invitation-1",
          respondentId: "respondent-1",
          templateId: "template-1",
          templateAlias: "qsp-v2",
          versionId: "version-1",
          accessMode: "INVITED",
          campaignStatus: "ACTIVE",
          campaignDeleted: false,
          invitationStatus: "SUBMITTED",
          invitationRevoked: false,
          closeAt: "2026-08-30T00:00:00.000Z",
          invitationExpiresAt: "2026-08-20T00:00:00.000Z",
          recipientRole: "RESPONDENT",
          emailType: "ASSESSMENT_RESULTS",
          phase2Fingerprint: "a".repeat(64),
        },
        respondentResults: {
          canonicalRecipientMailbox: "person@example.com",
          sendResultsToRespondent: true,
          featureKey: "WAVE_D_RESULTS_EMAIL_ENABLED",
          featureEnabled: true,
          approved: true,
          approvedContentHash: frozenApprovalHash,
        },
      },
      current: {
        submission: {
          exists: true,
          campaignId: "campaign-1",
          invitationId: "invitation-1",
          respondentId: "respondent-relinked",
        },
        campaign: {
          exists: true,
          templateId: "template-current",
          versionId: "version-current",
          accessMode: "PUBLIC",
          status: "ACTIVE",
          deleted: true,
          closeAt: "2026-08-31T00:00:00.000Z",
          sendResultsToRespondent: false,
          notifyCoachOnCompletion: true,
          createdByCoachId: "coach-current",
        },
        invitation: {
          exists: true,
          campaignId: "campaign-1",
          respondentId: "respondent-relinked",
          status: "REVOKED",
          revoked: true,
          expiresAt: "2026-08-21T00:00:00.000Z",
        },
        respondent: {
          exists: true,
          canonicalMailbox: "changed@example.com",
        },
        template: {
          exists: true,
          alias: "qsp-current",
          resultsEmailApproved: false,
          storedApprovedContentHash: storedApprovalHash,
          liveContentHash: liveApprovalHash,
        },
        version: { exists: true, templateId: "template-current" },
        coach: null,
        features: {
          resultsEmailEnabled: false,
          coachNotifyEnabled: true,
        },
      },
      drift: {
        kind: "HELD",
        primaryReason: "APPROVAL_HASH_CHANGED",
        reasons: [
          "CAMPAIGN_DELETED",
          "CAMPAIGN_STATUS_CHANGED",
          "CAMPAIGN_DEADLINE_CHANGED",
          "INVITATION_REVOKED",
          "INVITATION_EXPIRY_CHANGED",
          "IDENTITY_LINK_CHANGED",
          "RESPONDENT_EMAIL_CHANGED",
          "TEMPLATE_CHANGED",
          "VERSION_CHANGED",
          "APPROVAL_REVOKED",
          "APPROVAL_HASH_CHANGED",
          "FEATURE_DISABLED",
        ],
      },
    };
    mockedFetch()
      .mockResolvedValueOnce(
        response({ data: [LIST_ROW], nextCursor: null }) as Response,
      )
      .mockResolvedValueOnce(response({ data: multiReasonDetail }) as Response);

    render(<AssessmentEmailDeliveryHolds />);
    expect(await screen.findByText("p***@example.com")).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Review p***@example.com" }),
    );
    expect(await screen.findByText("APPROVAL_HASH_CHANGED")).toBeInTheDocument();

    for (const code of multiReasonDetail.drift.reasons) {
      expect(screen.getByText(code)).toBeInTheDocument();
    }
    expect(screen.getByText("Approved content hash changed")).toBeInTheDocument();
    expect(screen.getByText("Feature gate disabled")).toBeInTheDocument();
    expect(screen.getByText("Identity link changed")).toBeInTheDocument();

    const expectFact = (label: string, frozen: string, current: string) => {
      const row = screen.getByRole("row", { name: new RegExp(label, "i") });
      expect(within(row).getByText(frozen)).toBeInTheDocument();
      expect(within(row).getByText(current)).toBeInTheDocument();
    };
    expectFact("Campaign deleted", "No", "Yes");
    expectFact("Campaign access mode", "INVITED", "PUBLIC");
    expectFact(
      "Submission respondent ID",
      "respondent-1",
      "respondent-relinked",
    );
    expectFact("Invitation revoked", "No", "Yes");
    expectFact("Template approved", "Yes", "No");
    expectFact(
      "Stored approved content hash",
      frozenApprovalHash,
      storedApprovalHash,
    );
    expectFact(
      "Live approved content hash",
      frozenApprovalHash,
      liveApprovalHash,
    );
    expectFact("Results email feature", "Yes", "No");
    expectFact(
      "Phase 2 fingerprint",
      "a".repeat(64),
      "Frozen provenance only",
    );
    expectFact(
      "Feature key",
      "WAVE_D_RESULTS_EMAIL_ENABLED",
      "resultsEmailEnabled",
    );
  });

  it("shows owning-coach drift reasons with frozen/current ownership evidence", async () => {
    const coachDetail = {
      ...DETAIL,
      recipientRole: "OWNING_COACH",
      emailType: "COACH_COMPLETION",
      authorizationSnapshot: {
        schemaVersion: 1,
        common: {
          ...(DETAIL.authorizationSnapshot.common as Record<string, unknown>),
          campaignId: "campaign-1",
          invitationId: "invitation-1",
          respondentId: "respondent-1",
          templateId: "template-1",
          accessMode: "INVITED",
          campaignDeleted: false,
          invitationRevoked: false,
          recipientRole: "OWNING_COACH",
          emailType: "COACH_COMPLETION",
        },
        coachCompletion: {
          canonicalRecipientMailbox: "frozen-coach@example.com",
          notifyCoachOnCompletion: true,
          featureKey: "WAVE_D_COACH_NOTIFY_ENABLED",
          featureEnabled: true,
          coachId: "coach-frozen",
        },
      },
      current: {
        ...DETAIL.current,
        campaign: {
          ...DETAIL.current.campaign,
          createdByCoachId: "coach-current",
          notifyCoachOnCompletion: false,
        },
        coach: {
          exists: true,
          id: "coach-current",
          canonicalMailbox: "current-coach@example.com",
        },
        features: {
          resultsEmailEnabled: true,
          coachNotifyEnabled: false,
        },
      },
      drift: {
        kind: "HELD",
        primaryReason: "COACH_OWNER_CHANGED",
        reasons: [
          "COACH_OWNER_CHANGED",
          "COACH_EMAIL_CHANGED",
          "FEATURE_DISABLED",
        ],
      },
    };
    mockedFetch()
      .mockResolvedValueOnce(
        response({ data: [LIST_ROW], nextCursor: null }) as Response,
      )
      .mockResolvedValueOnce(response({ data: coachDetail }) as Response);

    render(<AssessmentEmailDeliveryHolds />);
    expect(await screen.findByText("p***@example.com")).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Review p***@example.com" }),
    );

    expect(await screen.findByText("COACH_OWNER_CHANGED")).toBeInTheDocument();
    expect(screen.getByText("Owning coach changed")).toBeInTheDocument();
    expect(screen.getByText("COACH_EMAIL_CHANGED")).toBeInTheDocument();
    expect(screen.getByText("Owning coach email changed")).toBeInTheDocument();
    const ownerRow = screen.getByRole("row", { name: /Owning coach ID/i });
    expect(within(ownerRow).getByText("coach-frozen")).toBeInTheDocument();
    expect(within(ownerRow).getByText("coach-current")).toBeInTheDocument();
    const mailboxRow = screen.getByRole("row", {
      name: /Owning coach mailbox/i,
    });
    expect(
      within(mailboxRow).getByText("frozen-coach@example.com"),
    ).toBeInTheDocument();
    expect(
      within(mailboxRow).getByText("current-coach@example.com"),
    ).toBeInTheDocument();
    const featureRow = screen.getByRole("row", {
      name: /Coach notification feature/i,
    });
    expect(within(featureRow).getByText("Yes")).toBeInTheDocument();
    expect(within(featureRow).getByText("No")).toBeInTheDocument();
  });

  it("keeps a stored retry-exhausted hold reason visible when current facts reauthorize", async () => {
    const retryDetail = {
      ...DETAIL,
      holdReason: "RETRY_EXHAUSTED",
      holdReasons: ["RETRY_EXHAUSTED"],
      drift: { kind: "AUTHORIZED" },
    };
    mockedFetch()
      .mockResolvedValueOnce(
        response({ data: [LIST_ROW], nextCursor: null }) as Response,
      )
      .mockResolvedValueOnce(response({ data: retryDetail }) as Response);

    render(<AssessmentEmailDeliveryHolds />);
    expect(await screen.findByText("p***@example.com")).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Review p***@example.com" }),
    );

    expect(await screen.findByText("RETRY_EXHAUSTED")).toBeInTheDocument();
    expect(
      screen.getByText("Automatic retry budget exhausted"),
    ).toBeInTheDocument();
  });
});
