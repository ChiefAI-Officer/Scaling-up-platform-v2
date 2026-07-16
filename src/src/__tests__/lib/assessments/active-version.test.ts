/**
 * Wave ED8 — shared Active-version helper unit tests (spec 19ak §4, Task T2).
 *
 * Active is defined in exactly ONE place — `active-version.ts`. These tests
 * pin the contract the read paths depend on:
 *   - the exact Prisma `where` (templateId, language, published, non-archived)
 *   - orderBy versionNumber desc (highest-number wins)
 *   - language-scoped derivation (EN resolves independently of ES)
 *   - archived-exclusion (`archivedAt: null` in the where; archived-only ⇒ null)
 *   - no-throw on empty result (returns null)
 *   - the centralized default-language constant (C4 canonicalization)
 *
 * The `db` is a plain stub whose `assessmentTemplateVersion.findFirst` records
 * its args and returns a canned row — mirrors the CampaignCreateDb stub style.
 */

import {
  resolveActiveVersion,
  activePublishedWhere,
  DEFAULT_TEMPLATE_LANGUAGE,
  type ActiveVersionDb,
  type ActiveVersionRow,
} from "@/lib/assessments/active-version";

// ─── Stub factory ──────────────────────────────────────────────────────────

interface RecordedCall {
  where: Record<string, unknown>;
  orderBy: Record<string, unknown>;
}

function makeDb(row: ActiveVersionRow | null): {
  db: ActiveVersionDb;
  calls: RecordedCall[];
} {
  const calls: RecordedCall[] = [];
  const db: ActiveVersionDb = {
    assessmentTemplateVersion: {
      findFirst: async (args) => {
        calls.push({ where: args.where, orderBy: args.orderBy });
        return row;
      },
    },
  };
  return { db, calls };
}

function buildRow(overrides: Partial<ActiveVersionRow> = {}): ActiveVersionRow {
  return {
    id: "ver_active",
    language: "enUS",
    versionNumber: 3,
    publishedAt: new Date("2026-01-01T00:00:00.000Z"),
    archivedAt: null,
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────

describe("resolveActiveVersion", () => {
  it("passes the exact where (templateId, language, published, non-archived) + orderBy versionNumber desc", async () => {
    const { db, calls } = makeDb(buildRow());

    const result = await resolveActiveVersion(db, "tmpl_1", "enUS");

    expect(result).toEqual(buildRow());
    expect(calls).toHaveLength(1);
    expect(calls[0].where).toEqual({
      templateId: "tmpl_1",
      language: "enUS",
      publishedAt: { not: null },
      archivedAt: null,
    });
    expect(calls[0].orderBy).toEqual({ versionNumber: "desc" });
  });

  it("derives per-language: EN resolves independently of ES (language is in the where)", async () => {
    const en = makeDb(buildRow({ id: "ver_en", language: "enUS" }));
    const es = makeDb(buildRow({ id: "ver_es", language: "es" }));

    const enResult = await resolveActiveVersion(en.db, "tmpl_1", "enUS");
    const esResult = await resolveActiveVersion(es.db, "tmpl_1", "es");

    expect(en.calls[0].where.language).toBe("enUS");
    expect(es.calls[0].where.language).toBe("es");
    expect(enResult?.id).toBe("ver_en");
    expect(esResult?.id).toBe("ver_es");
  });

  it("excludes archived versions: where carries archivedAt: null and archived-only resolves null", async () => {
    // The stub models the DB: with archivedAt: null in the where, an
    // archived-only template returns no row.
    const { db, calls } = makeDb(null);

    const result = await resolveActiveVersion(db, "tmpl_archived", "enUS");

    expect(calls[0].where).toHaveProperty("archivedAt", null);
    expect(result).toBeNull();
  });

  it("returns null (no throw) when no active version is left", async () => {
    const { db } = makeDb(null);

    await expect(
      resolveActiveVersion(db, "tmpl_none", "enUS"),
    ).resolves.toBeNull();
  });
});

describe("activePublishedWhere", () => {
  it("has exactly the shape { publishedAt: { not: null }, archivedAt: null }", () => {
    expect(activePublishedWhere).toEqual({
      publishedAt: { not: null },
      archivedAt: null,
    });
  });
});

describe("DEFAULT_TEMPLATE_LANGUAGE", () => {
  it("matches the real data convention (all seeded versions carry enUS)", () => {
    expect(DEFAULT_TEMPLATE_LANGUAGE).toBe("enUS");
  });
});
