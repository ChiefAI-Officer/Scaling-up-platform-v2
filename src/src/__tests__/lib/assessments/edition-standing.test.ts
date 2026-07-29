/**
 * Wave EV — edition standing on the campaign screen.
 *
 * A campaign locks to one template version when it is created and can never move
 * off it (there is no write path for `versionId`). Until now nothing on the
 * campaign screen said so, which is how two of Jeff's July-10 rows (#40, #43)
 * were reported as broken weeks after the fix shipped: he opened a campaign,
 * read frozen content, and had no cue it was frozen.
 *
 * `resolveEditionStanding` is the pure decision: given the pinned version and
 * the template's other versions, is this campaign on the newest edition or
 * behind one?
 */

import { resolveEditionStanding } from "@/lib/assessments/edition-standing";

const TPL = "tpl-1";

const pinned = {
  templateId: TPL,
  versionNumber: 3,
  publishedAt: new Date("2026-07-02T09:00:00.000Z"),
  // Real data is "enUS" on every seeded published row (see active-version.ts's
  // C4 note) — using "en" in fixtures teaches a string the repo warns about.
  language: "enUS",
};

const published = (
  versionNumber: number,
  language = "enUS",
  archivedAt: Date | null = null,
  templateId = TPL,
) => ({
  templateId,
  versionNumber,
  language,
  publishedAt: new Date("2026-07-27T09:00:00.000Z"),
  archivedAt,
});

describe("on the newest edition", () => {
  it("reports current when no other version exists", () => {
    expect(resolveEditionStanding(pinned, [])).toEqual({
      versionNumber: 3,
      publishedAt: pinned.publishedAt,
      newerEditionAvailable: false,
    });
  });

  it("reports current when the only other published version is OLDER", () => {
    const st = resolveEditionStanding(pinned, [published(2)]);
    expect(st?.newerEditionAvailable).toBe(false);
  });

  it("reports current when the same version number is echoed back", () => {
    const st = resolveEditionStanding(pinned, [published(3)]);
    expect(st?.newerEditionAvailable).toBe(false);
  });
});

describe("behind a newer edition", () => {
  it("flags a newer published version", () => {
    const st = resolveEditionStanding(pinned, [published(4)]);
    expect(st?.newerEditionAvailable).toBe(true);
  });

  it("flags when several newer versions exist", () => {
    const st = resolveEditionStanding(pinned, [published(4), published(5)]);
    expect(st?.newerEditionAvailable).toBe(true);
  });

  it("still reports the edition the campaign is actually serving, not the newest", () => {
    const st = resolveEditionStanding(pinned, [published(9)]);
    expect(st?.versionNumber).toBe(3);
    expect(st?.publishedAt).toEqual(pinned.publishedAt);
  });
});

describe("a newer edition must be genuinely available", () => {
  it("ignores an UNPUBLISHED newer version — a draft is not available to anyone", () => {
    const draft = {
      templateId: TPL,
      versionNumber: 4,
      language: "enUS",
      publishedAt: null,
      archivedAt: null,
    };
    expect(resolveEditionStanding(pinned, [draft])?.newerEditionAvailable).toBe(
      false,
    );
  });

  it("ignores an ARCHIVED newer version (Wave ED8) — it has been retired", () => {
    const archived = published(4, "enUS", new Date("2026-07-28T00:00:00.000Z"));
    expect(
      resolveEditionStanding(pinned, [archived])?.newerEditionAvailable,
    ).toBe(false);
  });

  it("ignores a newer version in a DIFFERENT language", () => {
    // Versions are unique per [templateId, versionNumber, language], so a
    // Spanish edition 5 must never flag an English edition 3 as behind.
    expect(
      resolveEditionStanding(pinned, [published(5, "es")])?.newerEditionAvailable,
    ).toBe(false);
  });

  it("flags a newer version in the SAME language when both languages exist", () => {
    const st = resolveEditionStanding(pinned, [
      published(5, "es"),
      published(4, "enUS"),
    ]);
    expect(st?.newerEditionAvailable).toBe(true);
  });
});

describe("template scoping", () => {
  it("ignores a newer version belonging to a DIFFERENT template", () => {
    // Checked in the pure function too, not only in the query — template scoping
    // is the predicate that decides WHICH instrument is being compared.
    const other = published(9, "enUS", null, "tpl-other");
    expect(
      resolveEditionStanding(pinned, [other])?.newerEditionAvailable,
    ).toBe(false);
  });
});

describe("degrades rather than lying when the pinned edition is unknowable", () => {
  it("returns null when the pinned version was never published", () => {
    // A campaign on an unpublished version is an anomaly; claiming an edition
    // number for it would assert something we cannot stand behind.
    const unpublished = {
      templateId: TPL,
      versionNumber: 3,
      publishedAt: null,
      language: "enUS",
    };
    expect(resolveEditionStanding(unpublished, [published(4)])).toBeNull();
  });

  it("never throws on a malformed sibling list", () => {
    expect(() =>
      resolveEditionStanding(pinned, [
        {
          templateId: TPL,
          versionNumber: NaN,
          language: "enUS",
          publishedAt: null,
          archivedAt: null,
        },
      ]),
    ).not.toThrow();
  });
});
