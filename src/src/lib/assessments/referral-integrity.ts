import { Prisma } from "@prisma/client";

/**
 * Identifies the restrictive AssessmentSubmission → Coach ownership FK.
 *
 * Prisma's P2003 metadata differs between database/client versions, so both
 * the structured field and message are considered. Callers must still scope
 * this predicate to operations where referringCoachId is the only expected
 * referral FK conflict.
 */
export function isReferringCoachForeignKeyConflict(
  error: unknown,
): boolean {
  if (
    !(error instanceof Prisma.PrismaClientKnownRequestError) ||
    error.code !== "P2003"
  ) {
    return false;
  }

  const fieldName =
    typeof error.meta?.field_name === "string" ? error.meta.field_name : "";
  return `${fieldName} ${error.message}`
    .toLowerCase()
    .includes("referringcoachid");
}
