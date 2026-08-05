/**
 * Welcome-screen lede copy — resolver behaviour (Jeff #62 / #66 / #70 / #77).
 *
 * The participant Welcome screen ("Screen 1") shows one descriptive paragraph.
 * It used to be a single hardcoded JSX string shared by every INVITED template;
 * these tests pin the per-template resolution that replaced it.
 *
 * Test-design note: these deliberately do NOT pin every byte of the new copy.
 * The invite-copy drift-guards (#219) were justified because seed file + CAS
 * patch script + prod row are THREE homes for the same bytes that provably
 * diverge (ADR-0025). Here there is ONE home, so a full-byte pin would only
 * fail in the same commit that changed the map. What IS asserted:
 *   - the DEFAULT is byte-exact (it must not regain a privacy claim)
 *   - each alias resolves to ITS OWN copy (guards the alias/copy mix-up)
 *   - paragraph counts (guards the multi-paragraph render path)
 *   - fail-open for every out-of-scope, unknown, or empty alias
 */
import fs from "node:fs";
import path from "node:path";
import {
  DEFAULT_WELCOME_LEDE,
  WELCOME_LEDE_BY_ALIAS,
  resolveWelcomeLede,
  shouldShowResumeNote,
} from "@/lib/assessments/welcome-copy";

/**
 * Approved GH #224 default. It preserves the truthful resume promise while
 * removing the unsupported "confidential" adjective.
 */
const APPROVED_DEFAULT_LEDE =
  "A quick check on how your team works together. You can answer in one sitting or come back later — your link stays active.";

describe("DEFAULT_WELCOME_LEDE", () => {
  it("uses the approved truthful default copy", () => {
    expect(DEFAULT_WELCOME_LEDE).toEqual([APPROVED_DEFAULT_LEDE]);
    expect(DEFAULT_WELCOME_LEDE[0]).not.toMatch(
      /\b(?:confidential|anonymous|private)\b/i,
    );
  });

  // Cheap transcription tripwire: a curly apostrophe, an en dash, or a doubled
  // space would all change the length while still reading correctly to a human.
  it("is exactly 121 characters and uses an em dash (U+2014)", () => {
    expect(DEFAULT_WELCOME_LEDE[0]).toHaveLength(121);
    expect(DEFAULT_WELCOME_LEDE[0]).toContain("—");
    expect(DEFAULT_WELCOME_LEDE[0]).not.toMatch(/ {2}/);
  });

  it("is a single paragraph", () => {
    expect(DEFAULT_WELCOME_LEDE).toHaveLength(1);
  });
});

describe("resolveWelcomeLede — per-template copy", () => {
  // Each alias must resolve to ITS OWN copy. A distinctive phrase per template
  // catches the failure that matters (two aliases' copy swapped, or an alias
  // silently falling through to the default) without pinning every byte.
  it.each([
    ["leadership-vision-alignment", "Leadership Vision Alignment Assessment", 1],
    ["qsp-v2", "Quarterly Session Preparation Assessment", 1],
    ["five-dysfunctions", "five fundamentals of teamwork", 1],
    ["RockHabits", "Rockefeller Habits 2.0 methodology", 2],
    ["scaling-up-full", "Rockefeller Habits 2.0 methodology", 2],
  ] as const)("%s resolves to its own copy in %i paragraph(s)", (alias, phrase, paragraphs) => {
    const resolved = resolveWelcomeLede(alias);

    expect(resolved).toHaveLength(paragraphs);
    expect(resolved.join(" ")).toContain(phrase);
    expect(resolved).not.toEqual(DEFAULT_WELCOME_LEDE);
  });

  it("distinguishes the two provenance templates from each other", () => {
    // RockHabits and scaling-up-full share the methodology framing but are NOT
    // the same copy — "checklist" vs "assessment", and only SU-Full mentions
    // the report. A copy/paste slip between them would pass the shared-phrase
    // assertion above, so pin the difference explicitly.
    const rock = resolveWelcomeLede("RockHabits").join(" ");
    const suFull = resolveWelcomeLede("scaling-up-full").join(" ");

    expect(rock).toContain("checklist");
    expect(rock).toContain("rated on a scale from 0 to 3");
    expect(suFull).not.toContain("checklist");
    expect(suFull).toContain("throughout your report");
    expect(rock).not.toEqual(suFull);
  });

  it("never references an artifact the respondent has not seen yet", () => {
    // The Welcome screen renders BEFORE question 1. Jeff's dictated copy for
    // #70/#77 was lifted from the printed Esperto report and referenced "the
    // table on page 4" (we render no such table for Rockefeller — his own #24 —
    // and print no page numbers at all) and "this report". Both were re-anchored.
    for (const paragraphs of Object.values(WELCOME_LEDE_BY_ALIAS)) {
      const text = paragraphs.join(" ");

      expect(text).not.toMatch(/page \d/i);
      expect(text).not.toContain("this report");
      expect(text).not.toMatch(/\bwas rated\b/);
    }
  });
});

describe("every map key is a REAL template alias", () => {
  // The highest-probability silent failure in this design: a typo in a key, or
  // an alias renamed in a seed, reverts that template to the default lede with
  // a fully green suite and a green build. Nothing else catches it — the other
  // resolver tests check keys against themselves, and the render tests use
  // hand-written fixtures.
  //
  // Read as TEXT rather than imported: `prisma/seed-*.ts` pull in
  // @prisma/client and are excluded from the tsconfig build, so importing them
  // into a jsdom test would be both slow and fragile. Matching their own alias
  // declaration keeps this rename-proof without that cost.
  const seedDir = path.resolve(process.cwd(), "prisma");
  const seedSource = fs
    .readdirSync(seedDir)
    .filter((f) => f.startsWith("seed-") && f.endsWith(".ts"))
    .map((f) => fs.readFileSync(path.join(seedDir, f), "utf8"))
    .join("\n");

  it.each(Object.keys(WELCOME_LEDE_BY_ALIAS))(
    "%s is declared by a seed",
    (alias) => {
      // Both forms in use: `export const ALIAS = "x"` (SU-Full, Five Dysf)
      // and `const TEMPLATE_ALIAS = "x"` (LVA, Rockefeller, QSP v2).
      const declared = new RegExp(
        `const (?:ALIAS|TEMPLATE_ALIAS) = "${alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`,
      );

      expect(seedSource).toMatch(declared);
    },
  );

  it("finds the seed sources it is asserting against", () => {
    // Guards the guard: an empty read would make every assertion above vacuous.
    expect(seedSource.length).toBeGreaterThan(10_000);
  });
});

describe("resolveWelcomeLede — fail-open", () => {
  // Templates Jeff did not ask about MUST render exactly what they render today.
  it.each(["qsp-v1", "scaling-up-quick"])("%s keeps the default copy", (alias) => {
    expect(resolveWelcomeLede(alias)).toEqual(DEFAULT_WELCOME_LEDE);
  });

  it.each([
    ["an unknown alias", "not-a-real-template"],
    ["an empty string", ""],
  ] as const)("%s falls back to the default", (_label, alias) => {
    expect(resolveWelcomeLede(alias)).toEqual(DEFAULT_WELCOME_LEDE);
  });

  // An object literal inherits from Object.prototype, so a plain
  // `map[alias] ?? DEFAULT` would return a FUNCTION for "constructor" — `??`
  // only fires on null/undefined — and the render site's `.map()` would throw,
  // white-screening the Welcome screen. Reachable: the admin create-template
  // validator (`/^[a-z0-9][a-z0-9-]*$/`) admits "constructor", and seeds bypass
  // that regex entirely.
  it.each(["constructor", "__proto__", "toString", "hasOwnProperty", "valueOf"])(
    "the inherited key %p does not leak through the map",
    (alias) => {
      const resolved = resolveWelcomeLede(alias);

      expect(Array.isArray(resolved)).toBe(true);
      expect(resolved).toBe(DEFAULT_WELCOME_LEDE);
      expect(shouldShowResumeNote(alias)).toBe(false);
    },
  );

  it.each([
    ["null", null],
    ["undefined", undefined],
  ] as const)("%s falls back to the default", (_label, alias) => {
    expect(resolveWelcomeLede(alias)).toEqual(DEFAULT_WELCOME_LEDE);
  });

  it("returns the default object identity when falling back", () => {
    // Proves the fallback is the shared default rather than a copy that could
    // drift from it — the assertion the byte-pin above cannot make.
    expect(resolveWelcomeLede(null)).toBe(DEFAULT_WELCOME_LEDE);
  });
});
