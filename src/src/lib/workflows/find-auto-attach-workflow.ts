/**
 * BUG-MAY6-2: Pure ranking logic for auto-attaching a workflow template to
 * a workshop on approval.
 *
 * Replaces the inline Prisma findFirst in auto-build-service.ts. The previous
 * implementation had two flaws:
 *
 *  1. categoryId was treated as hard equality when the workshop had a
 *     category, while workshopFormat was OR-null. A wildcard-category
 *     workflow (categoryId: null) could never match a categoried workshop.
 *  2. orderBy: { workshopFormat: "desc" } actually places NULL first under
 *     Postgres default null-ordering, so wildcard format would beat specific.
 *
 * This helper takes pre-fetched candidates (filtered at the DB to
 * isActive + isTemplate + matching workflowPhase) and applies category +
 * format compatibility plus explicit specificity ranking in code:
 *   - category-specific (+2) beats wildcard
 *   - format-specific (+1) beats wildcard
 *   - tie-break on most recent updatedAt
 */

export interface AutoAttachCandidate {
  id: string;
  name: string;
  categoryId: string | null;
  workshopFormat: string | null;
  updatedAt: Date;
}

export interface AutoAttachContext {
  /** Workshop's category id, or null if the workshop has no category */
  workshopCategoryId: string | null;
  /** Workshop's format (e.g., "VIRTUAL", "IN_PERSON") */
  workshopFormat: string;
}

export function findAutoAttachWorkflow<T extends AutoAttachCandidate>(
  candidates: T[],
  ctx: AutoAttachContext,
): T | null {
  const eligible = candidates.filter((candidate) => {
    // Category compatibility:
    //   - Workshop has category X → candidate must have categoryId=X or null (wildcard)
    //   - Workshop has no category → candidate must have categoryId=null
    if (ctx.workshopCategoryId === null) {
      if (candidate.categoryId !== null) return false;
    } else if (
      candidate.categoryId !== null &&
      candidate.categoryId !== ctx.workshopCategoryId
    ) {
      return false;
    }

    // Format compatibility: candidate.workshopFormat must match workshop's, or be null (wildcard)
    if (
      candidate.workshopFormat !== null &&
      candidate.workshopFormat !== ctx.workshopFormat
    ) {
      return false;
    }

    return true;
  });

  if (eligible.length === 0) return null;

  return [...eligible].sort((a, b) => {
    const aSpec = (a.categoryId ? 2 : 0) + (a.workshopFormat ? 1 : 0);
    const bSpec = (b.categoryId ? 2 : 0) + (b.workshopFormat ? 1 : 0);
    if (aSpec !== bSpec) return bSpec - aSpec;
    return b.updatedAt.getTime() - a.updatedAt.getTime();
  })[0];
}
