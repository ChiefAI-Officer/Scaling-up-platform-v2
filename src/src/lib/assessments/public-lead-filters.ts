import { Prisma } from "@prisma/client";
import { z } from "zod";

export const PublicLeadFilterSchema = z.object({
  search: z.string().trim().max(320).optional().default(""),
  assessment: z.string().trim().max(200).optional().default(""),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export type PublicLeadFilter = z.infer<typeof PublicLeadFilterSchema>;

function boundary(value: string | undefined, endExclusive: boolean) {
  if (!value) return undefined;
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return undefined;
  if (endExclusive) date.setUTCDate(date.getUTCDate() + 1);
  return date;
}

export function buildPublicLeadSubmissionWhere(input: {
  coachId: string;
  filter: PublicLeadFilter;
  retentionCutoff: Date;
}): Prisma.AssessmentSubmissionWhereInput {
  const search = input.filter.search.toLowerCase();
  const requestedFrom = boundary(input.filter.from, false);
  const to = boundary(input.filter.to, true);
  const effectiveFrom =
    requestedFrom && requestedFrom > input.retentionCutoff
      ? requestedFrom
      : input.retentionCutoff;
  return {
    referringCoachId: input.coachId,
    publicLeadDeletedAt: null,
    respondentId: null,
    campaign: {
      deletedAt: null,
      ...(input.filter.assessment
        ? { templateId: input.filter.assessment }
        : {}),
    },
    submittedAt: {
      gte: effectiveFrom,
      ...(to ? { lt: to } : {}),
    },
    ...(search
      ? {
          OR: [
            { publicTakerNameNormalized: { startsWith: search } },
            { publicTakerEmailNormalized: { startsWith: search } },
          ],
        }
      : {}),
  };
}
