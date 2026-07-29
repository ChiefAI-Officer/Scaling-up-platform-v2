/**
 * Wave EV — the Edition line + "Newer edition available" chip on the campaign
 * screen's Template tile.
 *
 * This is the customer-visible half of the #40/#43 fix: a campaign pins a
 * template version at creation and can never move off it, and until now the
 * screen said nothing about it. These tests pin the three states a coach or
 * admin can land on — current, behind, and unknowable.
 */

import React from "react";
import { render, screen } from "@testing-library/react";
import { CampaignDetail } from "@/components/assessments/CampaignDetail";
import type { CampaignOverview } from "@/lib/assessments/campaign-detail";

jest.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({ toast: jest.fn() }),
}));

function overview(
  edition: CampaignOverview["campaign"]["edition"],
): CampaignOverview {
  return {
    campaign: {
      id: "camp-1",
      name: "QSP v2 for Spectrum 2026",
      alias: "qsp_spectrum_2026",
      status: "ACTIVE",
      openAt: new Date("2026-07-05T09:00:00.000Z"),
      closeAt: null,
      createdAt: new Date("2026-07-05T08:00:00.000Z"),
      templateId: "tpl-1",
      templateName: "Quarterly Session Prep v2",
      organizationId: "org-1",
      organizationName: "Spectrum Health",
      invitationSubject: null,
      invitationBodyMarkdown: null,
      invitationBodyHtml: null,
      isImported: false,
      edition,
    },
    stats: {
      totalParticipants: 3,
      invited: 3,
      viewed: 2,
      submitted: 1,
      completionPct: 33,
    },
  };
}

function renderDetail(edition: CampaignOverview["campaign"]["edition"]) {
  global.fetch = jest.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ success: true, data: [] }),
  })) as unknown as typeof fetch;

  render(
    <CampaignDetail
      initialOverview={overview(edition)}
      initialRespondents={[]}
      basePath="/admin/assessments/campaigns"
    />,
  );
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe("on the newest edition", () => {
  const current = {
    versionNumber: 4,
    publishedAt: new Date("2026-07-27T09:00:00.000Z"),
    newerEditionAvailable: false,
  };

  it("names the edition it is serving, with the date that edition published", () => {
    renderDetail(current);
    const line = screen.getByTestId("campaign-edition-line");
    expect(line).toHaveTextContent("Edition 4");
    expect(line).toHaveTextContent("Jul 27, 2026");
  });

  it("stays quiet — no stale chip when nothing is wrong", () => {
    renderDetail(current);
    expect(
      screen.queryByTestId("campaign-edition-stale"),
    ).not.toBeInTheDocument();
  });
});

describe("behind a newer edition", () => {
  const behind = {
    versionNumber: 3,
    publishedAt: new Date("2026-07-02T09:00:00.000Z"),
    newerEditionAvailable: true,
  };

  it("warns that a newer edition exists", () => {
    renderDetail(behind);
    expect(screen.getByTestId("campaign-edition-stale")).toHaveTextContent(
      "Newer edition available",
    );
  });

  it("still dates the edition ACTUALLY being served, not the newer one", () => {
    // The load-bearing fact: "this campaign is serving content from 2 Jul" is
    // what lets a tester reason "the fix shipped later, so of course it is not
    // here" — which is the reasoning step that prevents the wasted round trip.
    renderDetail(behind);
    const line = screen.getByTestId("campaign-edition-line");
    expect(line).toHaveTextContent("Edition 3");
    expect(line).toHaveTextContent("Jul 2, 2026");
  });

  it("shows exactly ONE date — the chip states existence, not a second timestamp", () => {
    // The first cut of this design printed the pinned edition's date AND the
    // newer edition's date side by side, with nothing saying which belonged to
    // which. Assert against the two elements this feature owns rather than
    // walking the DOM, so the test can't drift with the tile's markup.
    renderDetail(behind);
    const text =
      screen.getByTestId("campaign-edition-line").textContent +
      " " +
      screen.getByTestId("campaign-edition-stale").textContent;
    const dates = text.match(/\w{3} \d{1,2}, \d{4}/g) ?? [];
    expect(dates).toEqual(["Jul 2, 2026"]);
  });
});

describe("unknowable / degraded", () => {
  it("renders nothing when there is no edition info (pinned to a draft, or lookup failed)", () => {
    renderDetail(null);
    expect(
      screen.queryByTestId("campaign-edition-line"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("campaign-edition-stale"),
    ).not.toBeInTheDocument();
  });

  it("leaves the rest of the Template tile intact when edition info is absent", () => {
    renderDetail(null);
    expect(screen.getByText("Quarterly Session Prep v2")).toBeInTheDocument();
  });

  it("renders nothing when the field is omitted entirely (older payloads)", () => {
    renderDetail(undefined);
    expect(
      screen.queryByTestId("campaign-edition-line"),
    ).not.toBeInTheDocument();
  });
});

describe("wording", () => {
  it('says "Edition", never "Version" — "version" is spent on the instrument name', () => {
    renderDetail({
      versionNumber: 3,
      publishedAt: new Date("2026-07-02T09:00:00.000Z"),
      newerEditionAvailable: true,
    });
    const line = screen.getByTestId("campaign-edition-line");
    expect(line.textContent).toMatch(/edition/i);
    expect(line.textContent).not.toMatch(/version/i);
  });
});
