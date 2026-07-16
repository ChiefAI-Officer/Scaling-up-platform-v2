/**
 * Wave ED8 (spec 19ak §4, Task T3) — `resolvePublishedTemplateVersion`
 * archived-exclusion unit tests.
 *
 * Campaign create resolves the ACTIVE version: highest `versionNumber` that is
 * published AND non-archived (`activePublishedWhere` spread from
 * `active-version.ts`). Archived-exclusion is PERSISTED admin intent (Wave-Q
 * doctrine) — it lives in the DB `where`, never behind the ED8 flag.
 *
 * The stub here MODELS the DB: `findFirst` applies the exact filters it is
 * handed to an in-memory row set (publishedAt not-null / archivedAt null when
 * present in the where) and orders by versionNumber desc — so "archived-active
 * falls through to the previous published version" is proven behaviorally,
 * not just by asserting call args.
 */

import {
  resolvePublishedTemplateVersion,
  CampaignCreateError,
  type CampaignCreateDb,
} from "@/lib/assessments/campaign-create-service";

// ─── Filtering stub ────────────────────────────────────────────────────────

interface VersionFixture {
  id: string;
  templateId: string;
  language: string;
  versionNumber: number;
  publishedAt: Date | null;
  archivedAt: Date | null;
}

interface RecordedCall {
  where: Record<string, unknown>;
  orderBy: Record<string, unknown>;
}

function makeDb(rows: VersionFixture[]): {
  db: CampaignCreateDb;
  calls: RecordedCall[];
} {
  const calls: RecordedCall[] = [];
  const db: CampaignCreateDb = {
    assessmentTemplateVersion: {
      findFirst: async (args) => {
        calls.push({
          where: args.where as unknown as Record<string, unknown>,
          orderBy: args.orderBy as unknown as Record<string, unknown>,
        });
        // Model the DB: apply exactly the filters present in the where.
        const w = args.where as {
          templateId: string;
          language: string;
          publishedAt?: { not: null };
          archivedAt?: null;
        };
        const matches = rows
          .filter((r) => r.templateId === w.templateId)
          .filter((r) => r.language === w.language)
          .filter((r) => (w.publishedAt ? r.publishedAt !== null : true))
          .filter((r) => ("archivedAt" in w ? r.archivedAt === null : true))
          .sort((a, b) => b.versionNumber - a.versionNumber);
        return matches[0] ?? null;
      },
    },
  };
  return { db, calls };
}

function version(overrides: Partial<VersionFixture>): VersionFixture {
  return {
    id: "ver-x",
    templateId: "tpl-1",
    language: "enUS",
    versionNumber: 1,
    publishedAt: new Date("2026-01-01T00:00:00Z"),
    archivedAt: null,
    ...overrides,
  };
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe("resolvePublishedTemplateVersion — ED8 archived exclusion", () => {
  it("resolves the highest-versionNumber published version (baseline)", async () => {
    const { db } = makeDb([
      version({ id: "ver-1", versionNumber: 1 }),
      version({ id: "ver-2", versionNumber: 2 }),
    ]);

    const out = await resolvePublishedTemplateVersion(db, "tpl-1", "enUS");
    expect(out.id).toBe("ver-2");
  });

  it("archived Active falls through to the previous published version", async () => {
    const { db } = makeDb([
      version({ id: "ver-1", versionNumber: 1 }),
      version({ id: "ver-2", versionNumber: 2 }),
      version({
        id: "ver-3",
        versionNumber: 3,
        archivedAt: new Date("2026-07-01T00:00:00Z"),
      }),
    ]);

    const out = await resolvePublishedTemplateVersion(db, "tpl-1", "enUS");
    expect(out.id).toBe("ver-2");
  });

  it("throws TEMPLATE_VERSION_NOT_PUBLISHED when ALL published versions are archived", async () => {
    const archivedAt = new Date("2026-07-01T00:00:00Z");
    const { db } = makeDb([
      version({ id: "ver-1", versionNumber: 1, archivedAt }),
      version({ id: "ver-2", versionNumber: 2, archivedAt }),
    ]);

    await expect(
      resolvePublishedTemplateVersion(db, "tpl-1", "enUS"),
    ).rejects.toThrow(CampaignCreateError);
    await expect(
      resolvePublishedTemplateVersion(db, "tpl-1", "enUS"),
    ).rejects.toMatchObject({ code: "TEMPLATE_VERSION_NOT_PUBLISHED" });
  });

  it("passes the exact shared Active where (published + non-archived) + versionNumber desc", async () => {
    const { db, calls } = makeDb([version({ id: "ver-1" })]);

    await resolvePublishedTemplateVersion(db, "tpl-1", "enUS");

    expect(calls).toHaveLength(1);
    expect(calls[0].where).toEqual({
      templateId: "tpl-1",
      language: "enUS",
      publishedAt: { not: null },
      archivedAt: null,
    });
    expect(calls[0].orderBy).toEqual({ versionNumber: "desc" });
  });
});
