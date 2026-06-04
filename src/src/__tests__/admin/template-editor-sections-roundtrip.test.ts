import {
  hydrateSectionsFromJson,
  buildSectionsPayload,
} from "@/components/admin/template-editor/sections-serialization";
import { buildScalingUpFullContent } from "../../../prisma/seed-scaling-up-full-assessment";
import { TemplateVersionForPublishSchema } from "@/lib/assessments/scoring";

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
