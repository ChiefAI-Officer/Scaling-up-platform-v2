import type { ApiActor } from "@/lib/auth/access-control";
import {
  campaignPickerTemplateWhere,
  type CampaignPickerTemplateScopeDb,
} from "@/lib/assessments/campaign-picker-template-scope";

const adminActor: ApiActor = {
  userId: "admin-1",
  email: "admin@example.com",
  role: "ADMIN",
  coachId: null,
};

const coachActor: ApiActor = {
  userId: "coach-user-1",
  email: "coach@example.com",
  role: "COACH",
  coachId: "coach-1",
};

function createDb(): {
  db: CampaignPickerTemplateScopeDb;
  accessGroupCoachFindMany: jest.Mock;
  accessGroupTemplateFindMany: jest.Mock;
} {
  const accessGroupCoachFindMany = jest.fn();
  const accessGroupTemplateFindMany = jest.fn();

  return {
    db: {
      accessGroupCoach: { findMany: accessGroupCoachFindMany },
      accessGroupTemplate: { findMany: accessGroupTemplateFindMany },
    } as unknown as CampaignPickerTemplateScopeDb,
    accessGroupCoachFindMany,
    accessGroupTemplateFindMany,
  };
}

describe("campaignPickerTemplateWhere", () => {
  it("keeps the live template predicate for privileged actors", async () => {
    const { db } = createDb();

    await expect(campaignPickerTemplateWhere(db, adminActor)).resolves.toEqual({
      deletedAt: null,
      disabledAt: null,
    });
  });

  it("returns only templates granted by every active coach group", async () => {
    const {
      db,
      accessGroupCoachFindMany,
      accessGroupTemplateFindMany,
    } = createDb();
    accessGroupCoachFindMany.mockResolvedValue([
      {
        accessGroupId: "group-one",
        coachId: "coach-1",
        accessGroup: { id: "group-one", deletedAt: null },
      },
      {
        accessGroupId: "group-two",
        coachId: "coach-1",
        accessGroup: { id: "group-two", deletedAt: null },
      },
      {
        accessGroupId: "deleted-group",
        coachId: "coach-1",
        accessGroup: { id: "deleted-group", deletedAt: new Date("2026-01-01") },
      },
    ]);
    accessGroupTemplateFindMany.mockResolvedValue([
      { accessGroupId: "group-one", templateId: "tpl-shared" },
      { accessGroupId: "group-two", templateId: "tpl-shared" },
      { accessGroupId: "group-one", templateId: "tpl-one-group-only" },
      { accessGroupId: "deleted-group", templateId: "tpl-deleted-group-only" },
    ]);

    await expect(campaignPickerTemplateWhere(db, coachActor)).resolves.toEqual({
      id: { in: ["tpl-shared"] },
      deletedAt: null,
      disabledAt: null,
    });
  });

  it("returns an empty template scope when an ordinary actor has no coach", async () => {
    const { db } = createDb();
    const actorWithoutCoach: ApiActor = {
      ...coachActor,
      coachId: null,
    };

    await expect(
      campaignPickerTemplateWhere(db, actorWithoutCoach),
    ).resolves.toEqual({
      id: { in: [] },
      deletedAt: null,
      disabledAt: null,
    });
  });

  it("returns an empty template scope when a coach has no active groups", async () => {
    const { db, accessGroupCoachFindMany } = createDb();
    accessGroupCoachFindMany.mockResolvedValue([
      {
        accessGroupId: "deleted-group",
        coachId: "coach-1",
        accessGroup: { id: "deleted-group", deletedAt: new Date("2026-01-01") },
      },
    ]);

    await expect(campaignPickerTemplateWhere(db, coachActor)).resolves.toEqual({
      id: { in: [] },
      deletedAt: null,
      disabledAt: null,
    });
  });

  it("returns an empty template scope when no template grant intersects every active group", async () => {
    const {
      db,
      accessGroupCoachFindMany,
      accessGroupTemplateFindMany,
    } = createDb();
    accessGroupCoachFindMany.mockResolvedValue([
      {
        accessGroupId: "group-one",
        coachId: "coach-1",
        accessGroup: { id: "group-one", deletedAt: null },
      },
      {
        accessGroupId: "group-two",
        coachId: "coach-1",
        accessGroup: { id: "group-two", deletedAt: null },
      },
    ]);
    accessGroupTemplateFindMany.mockResolvedValue([
      { accessGroupId: "group-one", templateId: "tpl-one-group-only" },
    ]);

    await expect(campaignPickerTemplateWhere(db, coachActor)).resolves.toEqual({
      id: { in: [] },
      deletedAt: null,
      disabledAt: null,
    });
  });
});
