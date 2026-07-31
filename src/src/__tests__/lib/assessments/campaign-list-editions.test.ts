import { activePublishedWhere } from "@/lib/assessments/active-version";
import {
  resolveCampaignListEditions,
  type CampaignListEditionDb,
} from "@/lib/assessments/campaign-list-editions";
import type {
  PinnedVersion,
  SiblingVersion,
} from "@/lib/assessments/edition-standing";

function pinned(
  templateId: string,
  versionNumber: number,
  language = "enUS",
  archivedAt: Date | null = null,
): PinnedVersion {
  return {
    templateId,
    versionNumber,
    language,
    publishedAt: new Date("2026-07-01T00:00:00.000Z"),
    archivedAt,
  };
}

function candidate(
  templateId: string,
  versionNumber: number,
  language = "enUS",
): SiblingVersion {
  return {
    templateId,
    versionNumber,
    language,
    publishedAt: new Date("2026-07-02T00:00:00.000Z"),
    archivedAt: null,
  };
}

function buildDb(rows: SiblingVersion[] = []): CampaignListEditionDb {
  return {
    assessmentTemplateVersion: {
      findMany: jest.fn().mockResolvedValue(rows),
    },
  };
}

describe("resolveCampaignListEditions", () => {
  it("deduplicates exact pairs and loads every pair once", async () => {
    const db = buildDb([
      candidate("tpl-a", 2),
      candidate("tpl-b", 4, "es"),
    ]);
    await resolveCampaignListEditions(db, [
      { id: "a1", version: pinned("tpl-a", 2) },
      { id: "a2", version: pinned("tpl-a", 2) },
      { id: "b1", version: pinned("tpl-b", 3, "es") },
    ]);

    expect(db.assessmentTemplateVersion.findMany).toHaveBeenCalledTimes(1);
    expect(
      (db.assessmentTemplateVersion.findMany as jest.Mock).mock.calls[0][0],
    ).toEqual({
      where: {
        ...activePublishedWhere,
        OR: [
          { templateId: "tpl-a", language: "enUS" },
          { templateId: "tpl-b", language: "es" },
        ],
      },
      select: {
        templateId: true,
        versionNumber: true,
        language: true,
        publishedAt: true,
        archivedAt: true,
      },
    });
  });

  it("reports current, stale, and retired pins through the shared contract", async () => {
    const retiredAt = new Date("2026-07-30T00:00:00.000Z");
    const db = buildDb([
      candidate("tpl-current", 3),
      candidate("tpl-stale", 2),
      candidate("tpl-stale", 4),
      candidate("tpl-retired", 5),
    ]);
    const result = await resolveCampaignListEditions(db, [
      { id: "current", version: pinned("tpl-current", 3) },
      { id: "stale", version: pinned("tpl-stale", 2) },
      { id: "retired", version: pinned("tpl-retired", 3, "enUS", retiredAt) },
    ]);

    expect(result.get("current")).toMatchObject({
      versionNumber: 3,
      pinnedRetired: false,
      newerEditionAvailable: false,
    });
    expect(result.get("stale")).toMatchObject({
      versionNumber: 2,
      pinnedRetired: false,
      newerEditionAvailable: true,
    });
    expect(result.get("retired")).toMatchObject({
      versionNumber: 3,
      pinnedRetired: true,
      newerEditionAvailable: true,
    });
  });

  it("isolates candidates by exact template and language", async () => {
    const db = buildDb([
      candidate("tpl-a", 2, "enUS"),
      candidate("tpl-a", 3, "es"),
      candidate("tpl-a", 5, "es"),
    ]);
    const result = await resolveCampaignListEditions(db, [
      { id: "english", version: pinned("tpl-a", 2, "enUS") },
      { id: "spanish", version: pinned("tpl-a", 3, "es") },
    ]);

    expect(result.get("english")?.newerEditionAvailable).toBe(false);
    expect(result.get("spanish")?.newerEditionAvailable).toBe(true);
  });

  it("does not query when every pinned version is invalid", async () => {
    const db = buildDb();
    const unpublished = {
      ...pinned("tpl-a", 1),
      publishedAt: null,
    };
    const nonFinite = {
      ...pinned("tpl-b", 1),
      versionNumber: Number.NaN,
    };
    const result = await resolveCampaignListEditions(db, [
      { id: "missing", version: null },
      { id: "unpublished", version: unpublished },
      { id: "non-finite", version: nonFinite },
    ]);

    expect(db.assessmentTemplateVersion.findMany).not.toHaveBeenCalled();
    expect([...result.entries()]).toEqual([
      ["missing", null],
      ["unpublished", null],
      ["non-finite", null],
    ]);
  });

  it("degrades only an incomplete nonretired group", async () => {
    const retiredAt = new Date("2026-07-30T00:00:00.000Z");
    const db = buildDb([candidate("tpl-good", 2)]);
    const result = await resolveCampaignListEditions(db, [
      { id: "good", version: pinned("tpl-good", 2) },
      { id: "missing-active-group", version: pinned("tpl-missing", 1) },
      {
        id: "retired-without-own-active-row",
        version: pinned("tpl-retired", 1, "enUS", retiredAt),
      },
    ]);

    expect(result.get("good")).toMatchObject({
      pinnedRetired: false,
      newerEditionAvailable: false,
    });
    expect(result.get("missing-active-group")).toBeNull();
    expect(result.get("retired-without-own-active-row")).toMatchObject({
      versionNumber: 1,
      pinnedRetired: true,
      newerEditionAvailable: false,
    });
  });

  it("logs once without identifiers and returns all-null on query failure", async () => {
    const error = new TypeError("connection detail must not be logged");
    const db = buildDb();
    (db.assessmentTemplateVersion.findMany as jest.Mock).mockRejectedValue(error);
    const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});

    const result = await resolveCampaignListEditions(db, [
      { id: "a", version: pinned("tpl-a", 1) },
      { id: "b", version: pinned("tpl-b", 2) },
    ]);

    expect([...result.entries()]).toEqual([
      ["a", null],
      ["b", null],
    ]);
    expect(consoleSpy).toHaveBeenCalledTimes(1);
    expect(consoleSpy).toHaveBeenCalledWith(
      "[campaign-list-editions] lookup failed",
      { pairCount: 2, errorName: "TypeError" },
    );
    expect(JSON.stringify(consoleSpy.mock.calls)).not.toContain("tpl-a");
    expect(JSON.stringify(consoleSpy.mock.calls)).not.toContain(
      "connection detail",
    );
    consoleSpy.mockRestore();
  });
});
