/**
 * BUG-MAY6-2: findAutoAttachWorkflow ranks candidate workflows for auto-attach
 * to a workshop on approval. Replaces the inline Prisma findFirst in
 * auto-build-service.ts whose WHERE asymmetry (categoryId hard-equality but
 * workshopFormat OR-null) caused wildcard-category workflows like
 * "Post-Event Coach Survey Sequence" to never match a categoried workshop,
 * and whose `orderBy: { workshopFormat: "desc" }` actually preferred NULL
 * (Postgres default NULLS FIRST for DESC) — the opposite of intent.
 */

import { findAutoAttachWorkflow } from "@/lib/workflows/find-auto-attach-workflow";

type Candidate = {
  id: string;
  name: string;
  categoryId: string | null;
  workshopFormat: string | null;
  updatedAt: Date;
};

const baseUpdatedAt = new Date("2026-05-01T00:00:00Z");

function makeCandidate(overrides: Partial<Candidate> & { id: string }): Candidate {
  return {
    name: `Workflow ${overrides.id}`,
    categoryId: null,
    workshopFormat: null,
    updatedAt: baseUpdatedAt,
    ...overrides,
  };
}

describe("findAutoAttachWorkflow — BUG-MAY6-2", () => {
  it("Jeff's failing case: a wildcard-category workflow MATCHES a categoried workshop", () => {
    // The seeded "Post-Event Coach Survey Sequence" has categoryId: null; Jeff's
    // workshop is in "Scaling Up Master Class". Pre-fix this returned null.
    const wildcard = makeCandidate({ id: "wf-post", categoryId: null, workshopFormat: null });

    const result = findAutoAttachWorkflow([wildcard], {
      workshopCategoryId: "cat-master-class",
      workshopFormat: "VIRTUAL",
    });

    expect(result?.id).toBe("wf-post");
  });

  it("when both a category-specific AND a wildcard candidate exist, the category-specific one wins (specificity ranking, not Prisma NULL ordering)", () => {
    const wildcard = makeCandidate({ id: "wildcard", categoryId: null });
    const specific = makeCandidate({ id: "specific", categoryId: "cat-master-class" });

    const result = findAutoAttachWorkflow([wildcard, specific], {
      workshopCategoryId: "cat-master-class",
      workshopFormat: "VIRTUAL",
    });

    expect(result?.id).toBe("specific");
  });

  it("excludes candidates whose categoryId points to a different category", () => {
    const otherCategory = makeCandidate({ id: "other", categoryId: "cat-different" });
    const wildcard = makeCandidate({ id: "wildcard", categoryId: null });

    const result = findAutoAttachWorkflow([otherCategory, wildcard], {
      workshopCategoryId: "cat-master-class",
      workshopFormat: "VIRTUAL",
    });

    expect(result?.id).toBe("wildcard");
  });

  it("excludes candidates whose workshopFormat does not match (and is not null)", () => {
    const wrongFormat = makeCandidate({ id: "in-person-only", workshopFormat: "IN_PERSON" });

    const result = findAutoAttachWorkflow([wrongFormat], {
      workshopCategoryId: "cat-master-class",
      workshopFormat: "VIRTUAL",
    });

    expect(result).toBeNull();
  });

  it("workshop with no category matches ONLY wildcard-category candidates", () => {
    const wildcard = makeCandidate({ id: "wildcard", categoryId: null });
    const specific = makeCandidate({ id: "specific", categoryId: "cat-master-class" });

    const result = findAutoAttachWorkflow([wildcard, specific], {
      workshopCategoryId: null,
      workshopFormat: "VIRTUAL",
    });

    expect(result?.id).toBe("wildcard");
  });

  it("format-specific candidate beats wildcard format when both match by category", () => {
    const formatSpecific = makeCandidate({
      id: "virtual",
      categoryId: "cat-master-class",
      workshopFormat: "VIRTUAL",
    });
    const formatWildcard = makeCandidate({
      id: "any-format",
      categoryId: "cat-master-class",
      workshopFormat: null,
    });

    const result = findAutoAttachWorkflow([formatWildcard, formatSpecific], {
      workshopCategoryId: "cat-master-class",
      workshopFormat: "VIRTUAL",
    });

    expect(result?.id).toBe("virtual");
  });

  it("when specificity is tied, the more recently updated candidate wins", () => {
    const older = makeCandidate({
      id: "older",
      categoryId: "cat-master-class",
      updatedAt: new Date("2026-01-01T00:00:00Z"),
    });
    const newer = makeCandidate({
      id: "newer",
      categoryId: "cat-master-class",
      updatedAt: new Date("2026-05-01T00:00:00Z"),
    });

    const result = findAutoAttachWorkflow([older, newer], {
      workshopCategoryId: "cat-master-class",
      workshopFormat: "VIRTUAL",
    });

    expect(result?.id).toBe("newer");
  });

  it("empty candidate list → returns null", () => {
    const result = findAutoAttachWorkflow([], {
      workshopCategoryId: "cat-master-class",
      workshopFormat: "VIRTUAL",
    });
    expect(result).toBeNull();
  });
});
