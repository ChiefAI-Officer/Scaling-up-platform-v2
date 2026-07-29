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

const pinned = {
  versionNumber: 3,
  publishedAt: new Date("2026-07-02T09:00:00.000Z"),
  language: "en",
};

const published = (
  versionNumber: number,
  language = "en",
  archivedAt: Date | null = null,
) => ({
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
    const s = resolveEditionStanding(pinned, [published(2)]);
    expect(s.newerEditionAvailable).toBe(false);
  });

  it("reports current when the same version number is echoed back", () => {
    const s = resolveEditionStanding(pinned, [published(3)]);
    expect(s.newerEditionAvailable).toBe(false);
  });
});

describe("behind a newer edition", () => {
  it("flags a newer published version", () => {
    const s = resolveEditionStanding(pinned, [published(4)]);
    expect(s.newerEditionAvailable).toBe(true);
  });

  it("flags when several newer versions exist", () => {
    const s = resolveEditionStanding(pinned, [published(4), published(5)]);
    expect(s.newerEditionAvailable).toBe(true);
  });

  it("still reports the edition the campaign is actually serving, not the newest", () => {
    const s = resolveEditionStanding(pinned, [published(9)]);
    expect(s.versionNumber).toBe(3);
    expect(s.publishedAt).toEqual(pinned.publishedAt);
  });
});

describe("a newer edition must be genuinely available", () => {
  it("ignores an UNPUBLISHED newer version — a draft is not available to anyone", () => {
    const draft = {
      versionNumber: 4,
      language: "en",
      publishedAt: null,
      archivedAt: null,
    };
    expect(resolveEditionStanding(pinned, [draft]).newerEditionAvailable).toBe(
      false,
    );
  });

  it("ignores an ARCHIVED newer version (Wave ED8) — it has been retired", () => {
    const archived = published(4, "en", new Date("2026-07-28T00:00:00.000Z"));
    expect(
      resolveEditionStanding(pinned, [archived]).newerEditionAvailable,
    ).toBe(false);
  });

  it("ignores a newer version in a DIFFERENT language", () => {
    // Versions are unique per [templateId, versionNumber, language], so a
    // Spanish edition 5 must never flag an English edition 3 as behind.
    expect(
      resolveEditionStanding(pinned, [published(5, "es")]).newerEditionAvailable,
    ).toBe(false);
  });

  it("flags a newer version in the SAME language when both languages exist", () => {
    const s = resolveEditionStanding(pinned, [
      published(5, "es"),
      published(4, "en"),
    ]);
    expect(s.newerEditionAvailable).toBe(true);
  });
});

describe("degrades rather than lying when the pinned edition is unknowable", () => {
  it("returns null when the pinned version was never published", () => {
    // A campaign on an unpublished version is an anomaly; claiming an edition
    // number for it would assert something we cannot stand behind.
    const unpublished = { versionNumber: 3, publishedAt: null, language: "en" };
    expect(resolveEditionStanding(unpublished, [published(4)])).toBeNull();
  });

  it("never throws on a malformed sibling list", () => {
    expect(() =>
      resolveEditionStanding(pinned, [
        { versionNumber: NaN, language: "en", publishedAt: null, archivedAt: null },
      ]),
    ).not.toThrow();
  });
});
