import {
  hydrateSectionsFromJson,
  buildSectionsPayload,
} from "@/components/admin/template-editor/sections-serialization";
import { buildScalingUpFullContent } from "../../../prisma/seed-scaling-up-full-assessment";
import { SectionSchema, TemplateVersionForPublishSchema } from "@/lib/assessments/scoring";

describe("sections serialization round-trip", () => {
  const stored = [
    {
      stableKey: "S_PEOPLE_YE",
      sortOrder: 1,
      name: "People — YE",
      description: "Recruitment…",
      domain: "people",
      customField: "keepme",
    },
    { stableKey: "S1_welcome", sortOrder: 2, name: "Welcome", description: "Welcome to…" },
  ];

  it("preserves description, domain, partLabel and unknown fields through hydrate → payload when sections are NOT edited", () => {
    const drafts = hydrateSectionsFromJson(stored);
    const payload = buildSectionsPayload(drafts, {
      sectionsDirty: false,
      rawSections: stored,
    });
    expect(payload).toEqual(stored);
  });

  it("preserves description/domain when only the name is edited (dirty path spreads raw first)", () => {
    const drafts = hydrateSectionsFromJson(stored).map((d) =>
      d.stableKey === "S_PEOPLE_YE" ? { ...d, name: "People (edited)" } : d,
    );
    const payload = buildSectionsPayload(drafts, {
      sectionsDirty: true,
      rawSections: stored,
    }) as Array<Record<string, unknown>>;
    const ye = payload.find((s) => s.stableKey === "S_PEOPLE_YE")!;
    expect(ye.name).toBe("People (edited)");
    expect(ye.domain).toBe("people");
    expect(ye.description).toBe("Recruitment…");
    expect(ye.customField).toBe("keepme");
  });

  it("stamps sortOrder on editor-added sections so the version stays publishable (Wave W walk-found gap)", () => {
    const drafts = [
      ...hydrateSectionsFromJson(stored),
      { uid: "u_new", stableKey: "S3", name: "New section" },
    ];
    const payload = buildSectionsPayload(drafts, {
      sectionsDirty: true,
      rawSections: stored,
    }) as Array<Record<string, unknown>>;
    for (const row of payload) {
      // Prove the property in the test's name: every row parses under the
      // publish schema's section arm (which requires an integer sortOrder).
      const parsed = SectionSchema.safeParse(row);
      expect(parsed.success ? [] : parsed.error.issues).toEqual([]);
    }
    expect(payload.map((s) => s.sortOrder)).toEqual([1, 2, 3]);
  });

  it("persists a reorder: sortOrder follows the draft array order, raw fields survive", () => {
    const drafts = hydrateSectionsFromJson(stored).reverse();
    const payload = buildSectionsPayload(drafts, {
      sectionsDirty: true,
      rawSections: stored,
    }) as Array<Record<string, unknown>>;
    expect(payload.map((s) => s.stableKey)).toEqual(["S1_welcome", "S_PEOPLE_YE"]);
    expect(payload.map((s) => s.sortOrder)).toEqual([1, 2]);
    const ye = payload.find((s) => s.stableKey === "S_PEOPLE_YE")!;
    expect(ye.customField).toBe("keepme");
    expect(ye.domain).toBe("people");
  });

  it("SU Full sections survive a questions-only save and still pass publish (domain intact)", () => {
    const c = buildScalingUpFullContent();
    const drafts = hydrateSectionsFromJson(c.sections);
    const sections = buildSectionsPayload(drafts, {
      sectionsDirty: false,
      rawSections: c.sections as unknown[],
    });
    const parsed = TemplateVersionForPublishSchema.safeParse({
      questions: c.questions,
      sections,
      scoringConfig: c.scoringConfig,
    });
    const domainIssues = parsed.success
      ? []
      : parsed.error.issues.filter((i) => i.path.includes("domain"));
    expect(domainIssues).toEqual([]);
  });
});
