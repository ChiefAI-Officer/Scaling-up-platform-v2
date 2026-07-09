/**
 * Wave Z (Z-2) — shared toCampaignListItems mapper.
 *
 * Verifies the row → CampaignListItem projection and staged-metrics computation
 * shared by the coach portal list and the admin oversight list (the mapping the
 * two pages must NOT drift on).
 */
import {
  toCampaignListItems,
  type CampaignListRow,
} from "@/lib/assessments/campaign-list-items";

function row(overrides: Partial<CampaignListRow> = {}): CampaignListRow {
  return {
    id: "c1",
    name: "Acme Q3",
    alias: "acme-q3",
    status: "ACTIVE",
    openAt: new Date("2026-06-01T00:00:00.000Z"),
    template: { name: "QSP v2" },
    organization: { id: "org-1", name: "Acme Corp" },
    participants: [],
    invitations: [],
    ...overrides,
  };
}

describe("toCampaignListItems", () => {
  it("projects the flat fields + ISO openAt + org/template names", () => {
    const [item] = toCampaignListItems([row()]);
    expect(item).toMatchObject({
      id: "c1",
      name: "Acme Q3",
      alias: "acme-q3",
      status: "ACTIVE",
      templateName: "QSP v2",
      organizationId: "org-1",
      organizationName: "Acme Corp",
      openAt: "2026-06-01T00:00:00.000Z",
    });
    expect(item.metrics).toBeDefined();
  });

  it("computes staged metrics by joining invitations to participants", () => {
    const [item] = toCampaignListItems([
      row({
        participants: [
          { id: "p1", respondentId: "r1" },
          { id: "p2", respondentId: "r2" },
        ],
        invitations: [
          { respondentId: "r1", status: "SUBMITTED", sentAt: new Date(), revokedAt: null },
          { respondentId: "r2", status: "SENT", sentAt: new Date(), revokedAt: null },
        ],
      }),
    ]);
    // Two participants, both with active invitations → total counts them.
    expect(item.metrics.total).toBe(2);
  });

  it("maps an empty list to an empty list", () => {
    expect(toCampaignListItems([])).toEqual([]);
  });
});
