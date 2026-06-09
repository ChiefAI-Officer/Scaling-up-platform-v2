/**
 * Tests for the GLOBAL SOLO_LANDING Kajabi rollout — PURE core logic.
 *
 * These lock the claudex-hardened invariants the rollout depends on:
 *   - TARGETING: a row whose current customHtml == the per-workshop OLD render is
 *     a TARGET; one that matches the NEW render is a NO-OP; anything else is a
 *     SKIP (bespoke — never clobber). And two DIFFERENT workshops produce
 *     DIFFERENT old renders, so a shared raw-template hash can't be used.
 *   - CTA preflight: absolute-https-prod-host + published-registration required.
 *   - Price preflight: TBD/Free/empty FAILS unless an explicit exception.
 *   - New-value validation: rejects unresolved {{ and empty CTA.
 *   - Expected-count gate + template CAS.
 *
 * No DB. The actual interpolate/sanitize is represented by simple string
 * substitution fixtures (the runner injects the real pipeline; the core only
 * cares about SHA equality of whatever strings it is handed).
 */

import {
  sha256,
  decideRow,
  validateNewValue,
  extractCtaHref,
  checkCtaPreflight,
  checkPricePreflight,
  hasCoachPhoto,
  checkExpectedCount,
  checkTemplateCas,
  parseKajabiArgs,
  NEW_DESIGN_MARKER,
} from "../../lib/scripts/solo-landing-kajabi-core";

const EXPECTED_HOST = "scaling-up-platform-v2.vercel.app";

// A tiny stand-in "render" function: substitute {{coach_name}} / {{registration_url}}
// so two workshops with different data produce different rendered strings — which
// is exactly the property the targeting relies on.
function fakeRender(template: string, vars: Record<string, string>): string {
  let out = template;
  for (const [k, v] of Object.entries(vars)) out = out.split(`{{${k}}}`).join(v);
  return out;
}

const OLD_TEMPLATE = `<div class="old-design">Old · {{coach_name}} · {{registration_url}}</div>`;
const NEW_TEMPLATE = `<div class="su-mc" ${NEW_DESIGN_MARKER}>New · {{coach_name}} · <a class="btn" href="{{registration_url}}">Register Here</a></div>`;

describe("targeting: decideRow", () => {
  const oldGlobalTemplateId = "tpl-old-global";

  it("TARGET when current customHtml == per-workshop OLD render", () => {
    const vars = { coach_name: "Ada Lovelace", registration_url: `https://${EXPECTED_HOST}/workshop/ada-reg` };
    const oldRender = fakeRender(OLD_TEMPLATE, vars);
    const newRender = fakeRender(NEW_TEMPLATE, vars);
    const d = decideRow({
      currentCustomHtml: oldRender,
      expectedOldRender: oldRender,
      newRender,
      sourceTemplateId: oldGlobalTemplateId,
      oldGlobalTemplateId,
    });
    expect(d.kind).toBe("target");
  });

  it("NO-OP when current customHtml == per-workshop NEW render (already migrated)", () => {
    const vars = { coach_name: "Ada", registration_url: `https://${EXPECTED_HOST}/workshop/ada-reg` };
    const oldRender = fakeRender(OLD_TEMPLATE, vars);
    const newRender = fakeRender(NEW_TEMPLATE, vars);
    const d = decideRow({
      currentCustomHtml: newRender,
      expectedOldRender: oldRender,
      newRender,
      sourceTemplateId: null,
      oldGlobalTemplateId,
    });
    expect(d.kind).toBe("no-op");
  });

  it("SKIP (bespoke) when current matches neither old nor new render", () => {
    const vars = { coach_name: "Ada", registration_url: `https://${EXPECTED_HOST}/workshop/ada-reg` };
    const d = decideRow({
      currentCustomHtml: `<div class="HAND-EDITED bespoke">totally different</div>`,
      expectedOldRender: fakeRender(OLD_TEMPLATE, vars),
      newRender: fakeRender(NEW_TEMPLATE, vars),
      sourceTemplateId: null,
      oldGlobalTemplateId,
    });
    expect(d.kind).toBe("skip");
    if (d.kind === "skip") expect(d.reason).toBe("bespoke-or-category-scoped");
  });

  it("TARGET when sourceTemplateId is stale/mismatched but current customHtml == expectedOldRender", () => {
    // Prod reality: every existing SOLO_LANDING page has a stale sourceTemplateId
    // (points at an empty "Standard" template) even when the page renders the old
    // global design. Design-hash match is the authoritative signal; sourceTemplateId
    // is informational only and must NOT block a real target.
    const vars = { coach_name: "Ada", registration_url: `https://${EXPECTED_HOST}/workshop/ada-reg` };
    const oldRender = fakeRender(OLD_TEMPLATE, vars);
    const d = decideRow({
      currentCustomHtml: oldRender,
      expectedOldRender: oldRender,
      newRender: fakeRender(NEW_TEMPLATE, vars),
      sourceTemplateId: "tpl-stale-standard", // stale FK — doesn't match oldGlobalTemplateId
      oldGlobalTemplateId,
    });
    expect(d.kind).toBe("target");
  });

  it("SKIP empty current customHtml", () => {
    const d = decideRow({
      currentCustomHtml: "",
      expectedOldRender: "x",
      newRender: "y",
      sourceTemplateId: null,
      oldGlobalTemplateId,
    });
    expect(d.kind).toBe("skip");
    if (d.kind === "skip") expect(d.reason).toBe("empty-current-customhtml");
  });

  it("two DIFFERENT workshops produce DIFFERENT old renders — a shared raw hash cannot be used", () => {
    const adaOld = fakeRender(OLD_TEMPLATE, {
      coach_name: "Ada Lovelace",
      registration_url: `https://${EXPECTED_HOST}/workshop/ada-reg`,
    });
    const turingOld = fakeRender(OLD_TEMPLATE, {
      coach_name: "Alan Turing",
      registration_url: `https://${EXPECTED_HOST}/workshop/turing-reg`,
    });
    expect(sha256(adaOld)).not.toBe(sha256(turingOld));

    // And each workshop's row is correctly targeted against ITS OWN old render,
    // while a cross-applied old render would NOT match (proving per-workshop hashing).
    const oldGlobalTemplateId = "tpl-old-global";
    const adaNew = fakeRender(NEW_TEMPLATE, {
      coach_name: "Ada Lovelace",
      registration_url: `https://${EXPECTED_HOST}/workshop/ada-reg`,
    });
    const adaCorrect = decideRow({
      currentCustomHtml: adaOld,
      expectedOldRender: adaOld,
      newRender: adaNew,
      sourceTemplateId: null,
      oldGlobalTemplateId,
    });
    expect(adaCorrect.kind).toBe("target");

    const adaWrong = decideRow({
      currentCustomHtml: adaOld,
      expectedOldRender: turingOld, // wrong workshop's render
      newRender: adaNew,
      sourceTemplateId: null,
      oldGlobalTemplateId,
    });
    expect(adaWrong.kind).toBe("skip");
  });
});

describe("validateNewValue", () => {
  it("accepts a valid render (marker + no unresolved + CTA href)", () => {
    const html = fakeRender(NEW_TEMPLATE, {
      coach_name: "Ada",
      registration_url: `https://${EXPECTED_HOST}/workshop/ada-reg`,
    });
    const v = validateNewValue(html);
    expect(v.ok).toBe(true);
    expect(v.hasDesignMarker).toBe(true);
    expect(v.noUnresolvedTokens).toBe(true);
    expect(v.hasCtaHref).toBe(true);
    expect(v.resolvedCtaHref).toBe(`https://${EXPECTED_HOST}/workshop/ada-reg`);
  });

  it("rejects a render with an unresolved {{token}}", () => {
    const html = `<div ${NEW_DESIGN_MARKER}><a class="btn" href="https://x/workshop/a">go</a> {{price}}</div>`;
    const v = validateNewValue(html);
    expect(v.ok).toBe(false);
    expect(v.noUnresolvedTokens).toBe(false);
    expect(v.firstUnresolvedToken).toBe("{{price}}");
  });

  it("rejects a render with an empty CTA href", () => {
    const html = `<div ${NEW_DESIGN_MARKER}><a class="btn" href="">go</a></div>`;
    const v = validateNewValue(html);
    expect(v.ok).toBe(false);
    expect(v.hasCtaHref).toBe(false);
  });

  it("rejects a render missing the design marker", () => {
    const html = `<div><a class="btn" href="https://x/workshop/a">go</a></div>`;
    const v = validateNewValue(html);
    expect(v.ok).toBe(false);
    expect(v.hasDesignMarker).toBe(false);
  });

  it("extractCtaHref prefers the btn anchor (class before OR after href)", () => {
    expect(extractCtaHref(`<a href="x" class="btn">a</a>`)).toBe("x");
    expect(extractCtaHref(`<a class="btn primary" href="y">a</a>`)).toBe("y");
    expect(extractCtaHref(`<a href="fallback">a</a>`)).toBe("fallback");
  });
});

describe("CTA preflight (Task 8)", () => {
  const base = {
    expectedHost: EXPECTED_HOST,
    hasPublishedRegistration: true,
    expectedRegistrationSlug: "ada-reg",
  };

  it("passes absolute https on the prod host with a published matching registration", () => {
    const r = checkCtaPreflight({ ...base, registrationUrl: `https://${EXPECTED_HOST}/workshop/ada-reg` });
    expect(r.ok).toBe(true);
  });

  it("fails an empty registration URL", () => {
    expect(checkCtaPreflight({ ...base, registrationUrl: "" }).ok).toBe(false);
  });

  it("fails a relative URL", () => {
    expect(checkCtaPreflight({ ...base, registrationUrl: "/workshop/ada-reg" }).ok).toBe(false);
  });

  it("fails http (non-https)", () => {
    expect(checkCtaPreflight({ ...base, registrationUrl: `http://${EXPECTED_HOST}/workshop/ada-reg` }).ok).toBe(false);
  });

  it("fails the wrong host (staging)", () => {
    expect(
      checkCtaPreflight({ ...base, registrationUrl: "https://staging.example.com/workshop/ada-reg" }).ok,
    ).toBe(false);
  });

  it("fails when there is NO published REGISTRATION page", () => {
    expect(
      checkCtaPreflight({
        ...base,
        hasPublishedRegistration: false,
        registrationUrl: `https://${EXPECTED_HOST}/workshop/ada-reg`,
      }).ok,
    ).toBe(false);
  });

  it("fails when the URL slug does not match the published registration slug", () => {
    expect(
      checkCtaPreflight({
        ...base,
        registrationUrl: `https://${EXPECTED_HOST}/workshop/SOME-OTHER-slug`,
      }).ok,
    ).toBe(false);
  });
});

describe("price preflight (Task 9)", () => {
  it("passes a confirmed dollar amount", () => {
    expect(checkPricePreflight({ renderedPrice: "$497", hasExplicitException: false }).ok).toBe(true);
  });

  it("FAILS TBD (no exception)", () => {
    expect(checkPricePreflight({ renderedPrice: "TBD", hasExplicitException: false }).ok).toBe(false);
  });

  it("FAILS Free (no exception)", () => {
    expect(checkPricePreflight({ renderedPrice: "Free", hasExplicitException: false }).ok).toBe(false);
  });

  it("FAILS empty (no exception)", () => {
    expect(checkPricePreflight({ renderedPrice: "", hasExplicitException: false }).ok).toBe(false);
  });

  it("passes TBD WHEN an explicit --allow-price exception is set", () => {
    expect(checkPricePreflight({ renderedPrice: "TBD", hasExplicitException: true }).ok).toBe(true);
  });
});

describe("coach-photo preflight", () => {
  it("requires a non-empty profileImage", () => {
    expect(hasCoachPhoto("https://cdn/x.jpg")).toBe(true);
    expect(hasCoachPhoto("")).toBe(false);
    expect(hasCoachPhoto("   ")).toBe(false);
    expect(hasCoachPhoto(null)).toBe(false);
    expect(hasCoachPhoto(undefined)).toBe(false);
  });
});

describe("expected-count gate (Task 7)", () => {
  it("FAILS apply when --expect-count is omitted", () => {
    expect(checkExpectedCount(3, undefined).ok).toBe(false);
  });
  it("FAILS apply on a count mismatch", () => {
    expect(checkExpectedCount(3, 2).ok).toBe(false);
  });
  it("passes on an exact match", () => {
    expect(checkExpectedCount(3, 3).ok).toBe(true);
  });
});

describe("template CAS", () => {
  const updatedAt = new Date("2026-06-01T00:00:00Z");
  it("passes when live matches the expected sha + updatedAt", () => {
    expect(
      checkTemplateCas({
        liveUpdatedAt: updatedAt,
        liveSha: "abc",
        expectedUpdatedAt: updatedAt,
        expectedOldSha: "abc",
      }).ok,
    ).toBe(true);
  });
  it("fails on a sha mismatch", () => {
    expect(
      checkTemplateCas({ liveUpdatedAt: updatedAt, liveSha: "abc", expectedOldSha: "def" }).ok,
    ).toBe(false);
  });
  it("fails on an updatedAt mismatch", () => {
    expect(
      checkTemplateCas({
        liveUpdatedAt: updatedAt,
        liveSha: "abc",
        expectedUpdatedAt: new Date("2026-06-02T00:00:00Z"),
      }).ok,
    ).toBe(false);
  });
  it("passes when no expectations are supplied (read-then-CAS-on-updatedAt only)", () => {
    expect(checkTemplateCas({ liveUpdatedAt: updatedAt, liveSha: "abc" }).ok).toBe(true);
  });
});

describe("parseKajabiArgs", () => {
  it("defaults to dry-run and reads the kajabi flags", () => {
    const a = parseKajabiArgs([
      "--old-template-backup",
      "/tmp/old.json",
      "--new-template",
      "/tmp/new.html",
      "--slug",
      "canary",
      "--limit",
      "5",
      "--expect-count",
      "3",
      "--allow-price",
      "ws1",
      "--allow-price",
      "ws2",
    ]);
    expect(a.mode).toBe("dry-run");
    expect(a.oldTemplateBackup).toBe("/tmp/old.json");
    expect(a.newTemplate).toBe("/tmp/new.html");
    expect(a.slug).toBe("canary");
    expect(a.limit).toBe(5);
    expect(a.expectCount).toBe(3);
    expect(a.allowPrice).toEqual(["ws1", "ws2"]);
  });

  it("recognises --apply + override", () => {
    const a = parseKajabiArgs(["--apply", "--i-know-this-is-prod", "--expect-count", "0"]);
    expect(a.mode).toBe("apply");
    expect(a.hasOverride).toBe(true);
    expect(a.expectCount).toBe(0);
  });

  it("recognises --restore with the next arg as the file", () => {
    const a = parseKajabiArgs(["--restore", "/tmp/b.json"]);
    expect(a.mode).toBe("restore");
    expect(a.restoreFile).toBe("/tmp/b.json");
  });
});
