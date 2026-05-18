/**
 * Assessment v7.6 — AccessGroupPreviewModal render tests.
 * Mocks fetch to feed a fixture; asserts the BEFORE/AFTER diff renders
 * and that wouldDropToZero rows are highlighted destructively.
 */

import { render, screen, waitFor } from "@testing-library/react";
import {
  AccessGroupPreviewModal,
  type PreviewTarget,
} from "@/components/admin/AccessGroupPreviewModal";

interface Fixture {
  kind: string;
  accessGroupId: string;
  affectedCoachIds: string[];
  forcedZeroCoachIds: string[];
  coaches: Array<{
    coachId: string;
    firstName: string;
    lastName: string;
    email: string;
    beforeTemplates: Array<{ id: string; name: string; alias: string }>;
    afterTemplates: Array<{ id: string; name: string; alias: string }>;
    addedTemplateIds: string[];
    removedTemplateIds: string[];
    beforeCount: number;
    afterCount: number;
    wouldDropToZero: boolean;
    ownsActiveCampaigns: boolean;
  }>;
  wouldBlock: boolean;
}

const cleanFixture: Fixture = {
  kind: "REMOVE_TEMPLATE_FROM_GROUP",
  accessGroupId: "ag-1",
  affectedCoachIds: ["c1", "c2"],
  forcedZeroCoachIds: [],
  coaches: [
    {
      coachId: "c1",
      firstName: "Sarah",
      lastName: "Mitchell",
      email: "sarah@x.com",
      beforeTemplates: [
        { id: "t1", name: "Rockefeller", alias: "rkf" },
        { id: "t2", name: "Vision", alias: "vision" },
      ],
      afterTemplates: [{ id: "t1", name: "Rockefeller", alias: "rkf" }],
      addedTemplateIds: [],
      removedTemplateIds: ["t2"],
      beforeCount: 2,
      afterCount: 1,
      wouldDropToZero: false,
      ownsActiveCampaigns: false,
    },
    {
      coachId: "c2",
      firstName: "James",
      lastName: "Park",
      email: "james@x.com",
      beforeTemplates: [{ id: "t2", name: "Vision", alias: "vision" }],
      afterTemplates: [],
      addedTemplateIds: [],
      removedTemplateIds: ["t2"],
      beforeCount: 1,
      afterCount: 0,
      wouldDropToZero: true,
      ownsActiveCampaigns: true,
    },
  ],
  wouldBlock: true,
};

const target: PreviewTarget = {
  kind: "REMOVE_TEMPLATE_FROM_GROUP",
  accessGroupId: "ag-1",
  templateId: "t2",
  label: "Remove Vision from Scaling Up Coaches",
};

function mockFetchOnce(fixture: Fixture) {
  global.fetch = jest.fn().mockResolvedValueOnce({
    ok: true,
    status: 200,
    json: async () => ({ success: true, data: fixture }),
  } as unknown as Response) as unknown as typeof fetch;
}

describe("<AccessGroupPreviewModal />", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders BEFORE/AFTER rows for each coach", async () => {
    mockFetchOnce(cleanFixture);
    render(
      <AccessGroupPreviewModal
        open
        target={target}
        onClose={() => {}}
        onConfirmed={() => {}}
      />,
    );

    // Context line includes the proposed change label.
    await waitFor(() =>
      expect(
        screen.getByText(/Remove Vision from Scaling Up Coaches/i),
      ).toBeInTheDocument(),
    );

    // Each coach name appears.
    expect(await screen.findByText("Sarah Mitchell")).toBeInTheDocument();
    expect(await screen.findByText("James Park")).toBeInTheDocument();

    // Both coaches have a row.
    const rows = await screen.findAllByTestId("preview-row");
    expect(rows).toHaveLength(2);
  });

  it("highlights coaches whose AFTER drops to zero", async () => {
    mockFetchOnce(cleanFixture);
    render(
      <AccessGroupPreviewModal
        open
        target={target}
        onClose={() => {}}
        onConfirmed={() => {}}
      />,
    );

    const rows = await screen.findAllByTestId("preview-row");
    const cleanRow = rows.find(
      (r) => r.getAttribute("data-would-drop-zero") === "false",
    );
    const zeroRow = rows.find(
      (r) => r.getAttribute("data-would-drop-zero") === "true",
    );
    expect(cleanRow).toBeDefined();
    expect(zeroRow).toBeDefined();

    // Summary callout reads BLOCKED.
    expect(
      await screen.findByText(/BLOCKED_ZERO_ACCESS will fire/i),
    ).toBeInTheDocument();
  });
});
