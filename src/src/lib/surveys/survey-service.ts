/**
 * Survey Service (JV-13)
 *
 * CRUD for survey templates, questions, and response handling.
 */

import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import type { QuestionType, SurveyType } from "@/lib/surveys/survey-types";
import { parseSurveyDateRange } from "@/lib/surveys/survey-types";

// ============================================
// Types
// ============================================

export interface CreateTemplateInput {
  name: string;
  description?: string;
  surveyType: SurveyType;
  categoryId?: string;
  createdBy: string;
}

export interface CreateQuestionInput {
  templateId: string;
  sortOrder: number;
  questionType: QuestionType;
  label: string;
  description?: string;
  isRequired?: boolean;
  options?: string[];
}

// ============================================
// Template CRUD
// ============================================

export async function createSurveyTemplate(input: CreateTemplateInput) {
  return db.surveyTemplate.create({
    data: {
      name: input.name,
      description: input.description,
      surveyType: input.surveyType,
      categoryId: input.categoryId,
      createdBy: input.createdBy,
    },
    include: { questions: { orderBy: { sortOrder: "asc" } } },
  });
}

export async function getSurveyTemplate(id: string) {
  return db.surveyTemplate.findUnique({
    where: { id },
    include: { questions: { orderBy: { sortOrder: "asc" } } },
  });
}

export async function listSurveyTemplates() {
  return db.surveyTemplate.findMany({
    include: {
      questions: { orderBy: { sortOrder: "asc" } },
      _count: { select: { surveys: true } },
    },
    orderBy: { updatedAt: "desc" },
  });
}

export async function updateSurveyTemplate(
  id: string,
  data: Partial<Pick<CreateTemplateInput, "name" | "description" | "surveyType">> & { isActive?: boolean }
) {
  return db.surveyTemplate.update({
    where: { id },
    data,
    include: { questions: { orderBy: { sortOrder: "asc" } } },
  });
}

export async function deleteSurveyTemplate(id: string) {
  const existing = await db.surveyTemplate.findUnique({
    where: { id },
    include: {
      _count: { select: { surveys: true } },
      questions: { orderBy: { sortOrder: "asc" } },
    },
  });

  if (!existing) {
    throw new Error("Template not found");
  }

  if (existing._count.surveys > 0) {
    const template = await db.surveyTemplate.update({
      where: { id },
      data: { isActive: false },
      include: {
        questions: { orderBy: { sortOrder: "asc" } },
        _count: { select: { surveys: true } },
      },
    });
    return { action: "archived" as const, template };
  }

  const template = await db.surveyTemplate.delete({ where: { id } });
  return { action: "deleted" as const, template };
}

// ============================================
// Question CRUD
// ============================================

export async function addQuestion(input: CreateQuestionInput) {
  return db.surveyQuestion.create({
    data: {
      templateId: input.templateId,
      sortOrder: input.sortOrder,
      questionType: input.questionType,
      label: input.label,
      description: input.description,
      isRequired: input.isRequired ?? true,
      options: input.options ? JSON.stringify(input.options) : undefined,
    },
  });
}

export async function updateQuestion(
  questionId: string,
  data: Partial<Omit<CreateQuestionInput, "templateId">>
) {
  return db.surveyQuestion.update({
    where: { id: questionId },
    data: {
      ...data,
      options: data.options ? JSON.stringify(data.options) : undefined,
    },
  });
}

export async function deleteQuestion(questionId: string) {
  return db.surveyQuestion.delete({ where: { id: questionId } });
}

export async function reorderQuestions(templateId: string, questionIds: string[]) {
  const updates = questionIds.map((id, index) =>
    db.surveyQuestion.update({ where: { id }, data: { sortOrder: index } })
  );
  return db.$transaction(updates);
}

// ============================================
// Survey Instance (assign template to workshop)
// ============================================

export async function createSurveyForWorkshop(input: {
  templateId: string;
  workshopId: string;
  registrationId?: string;
}) {
  const workshop = await db.workshop.findUnique({
    where: { id: input.workshopId },
    select: { workshopCode: true },
  });

  const template = await db.surveyTemplate.findUnique({
    where: { id: input.templateId },
    select: { surveyType: true },
  });

  if (!workshop || !template) throw new Error("Workshop or template not found");

  return db.survey.create({
    data: {
      templateId: input.templateId,
      workshopId: input.workshopId,
      workshopCode: workshop.workshopCode,
      registrationId: input.registrationId,
      surveyType: template.surveyType,
    },
  });
}

// ============================================
// Response Submission (public)
// ============================================

export async function submitSurveyResponse(
  surveyId: string,
  answers: { questionId: string; value: string; numValue?: number }[]
) {
  const survey = await db.survey.findUnique({
    where: { id: surveyId },
    select: { id: true, completedAt: true, templateId: true },
  });

  if (!survey) throw new Error("Survey not found");
  if (survey.completedAt) throw new Error("Survey already completed");

  // Validate that all questionIds belong to this survey's template
  if (survey.templateId) {
    const validQuestions = await db.surveyQuestion.findMany({
      where: { templateId: survey.templateId },
      select: { id: true },
    });
    const validQuestionIds = new Set(validQuestions.map((q) => q.id));
    const invalidIds = answers.filter((a) => !validQuestionIds.has(a.questionId));
    if (invalidIds.length > 0) {
      throw new Error(
        `Invalid question IDs for this survey: ${invalidIds.map((a) => a.questionId).join(", ")}`
      );
    }
  }

  // Upsert answers + mark survey complete in a transaction
  const operations = answers.map((answer) =>
    db.surveyAnswer.upsert({
      where: { surveyId_questionId: { surveyId, questionId: answer.questionId } },
      create: {
        surveyId,
        questionId: answer.questionId,
        value: answer.value,
        numValue: answer.numValue,
      },
      update: {
        value: answer.value,
        numValue: answer.numValue,
      },
    })
  );

  // Extract NPS score if present
  const npsAnswer = answers.find((a) => a.numValue !== undefined && a.numValue >= 0 && a.numValue <= 10);

  await db.$transaction([
    ...operations,
    db.survey.update({
      where: { id: surveyId },
      data: {
        completedAt: new Date(),
        npsScore: npsAnswer?.numValue ?? undefined,
      },
    }),
  ]);

  return { success: true };
}

// ============================================
// Analytics / Aggregation
// ============================================

export interface SurveyResultsFilters {
  workshopId?: string;
  coachId?: string;
  categoryId?: string;
  workshopFormat?: string;
  // Round 15 Wave 2: accept YYYY-MM-DD strings (preferred — parsed via
  // parseSurveyDateRange so endDate is inclusive-of-day) or raw Date objects
  // (back-compat: treated as exact moments → `lt` exclusive upper bound).
  // Callers should prefer strings to get the same-day-inclusive semantics.
  startDate?: Date | string;
  endDate?: Date | string;
  groupBy?: "coach" | "category" | "format" | "workshopType";
}

// Overload preserves the legacy 2-arg signature so existing callers don't break.
export async function getSurveyResults(
  templateId: string,
  workshopIdOrFilters?: string | SurveyResultsFilters,
) {
  // Back-compat: 2-arg string form means filter by single workshopId.
  const filters: SurveyResultsFilters =
    typeof workshopIdOrFilters === "string"
      ? { workshopId: workshopIdOrFilters }
      : workshopIdOrFilters ?? {};

  // ENH-MAY6-9: filters thread through the Workshop relation for coach,
  // category, and format. Date range applies to Survey.completedAt directly.
  const workshopFilter: Prisma.WorkshopWhereInput = {};
  if (filters.coachId) workshopFilter.coachId = filters.coachId;
  if (filters.categoryId) workshopFilter.categoryId = filters.categoryId;
  if (filters.workshopFormat) workshopFilter.format = filters.workshopFormat;

  // Round 15 Wave 2: route date params through parseSurveyDateRange so
  // "endDate=2026-05-13" includes the entire day (was excluding everything
  // after 00:00 UTC). String inputs get the inclusive-of-day shift; Date
  // objects are passed through as-is for back-compat (treated as exact
  // moments with `lt` exclusive upper bound).
  const completedAtFilter: Prisma.DateTimeNullableFilter = { not: null };
  const stringRange = parseSurveyDateRange({
    startDate: typeof filters.startDate === "string" ? filters.startDate : undefined,
    endDate: typeof filters.endDate === "string" ? filters.endDate : undefined,
  });
  if (stringRange.startDate) completedAtFilter.gte = stringRange.startDate;
  if (stringRange.endDateExclusive) completedAtFilter.lt = stringRange.endDateExclusive;
  if (filters.startDate instanceof Date) completedAtFilter.gte = filters.startDate;
  if (filters.endDate instanceof Date) completedAtFilter.lt = filters.endDate;

  const where: Prisma.SurveyWhereInput = {
    templateId,
    completedAt: completedAtFilter,
  };
  if (filters.workshopId) where.workshopId = filters.workshopId;
  if (Object.keys(workshopFilter).length > 0) where.workshop = workshopFilter;

  const surveys = await db.survey.findMany({
    where,
    include: {
      answers: { include: { question: true } },
      workshop: {
        select: {
          title: true,
          workshopCode: true,
          coachId: true,
          categoryId: true,
          format: true,
          coach: { select: { firstName: true, lastName: true } },
          workshopCategory: { select: { id: true, name: true } },
          workshopType: { select: { id: true, name: true } },
        },
      },
      registration: { select: { firstName: true, lastName: true, email: true } },
    },
    orderBy: { completedAt: "desc" },
  });

  // Aggregate per question
  const template = await db.surveyTemplate.findUnique({
    where: { id: templateId },
    include: { questions: { orderBy: { sortOrder: "asc" } } },
  });

  if (!template) return null;

  const questionStats = template.questions.map((question) => {
    const allAnswers = surveys.flatMap((s) =>
      s.answers.filter((a) => a.questionId === question.id)
    );

    const stats: {
      questionId: string;
      label: string;
      type: string;
      totalResponses: number;
      avgNumeric?: number;
      distribution?: Record<string, number>;
    } = {
      questionId: question.id,
      label: question.label,
      type: question.questionType,
      totalResponses: allAnswers.length,
    };

    // Numeric average for RATING and NPS
    if (question.questionType === "RATING" || question.questionType === "NPS") {
      const nums = allAnswers.filter((a) => a.numValue !== null).map((a) => a.numValue!);
      stats.avgNumeric = nums.length > 0 ? nums.reduce((sum, n) => sum + n, 0) / nums.length : undefined;
    }

    // Distribution for choice questions
    if (["SINGLE_CHOICE", "MULTI_CHOICE", "YES_NO", "RATING", "NPS"].includes(question.questionType)) {
      const dist: Record<string, number> = {};
      for (const answer of allAnswers) {
        const val = answer.value || "No answer";
        if (question.questionType === "MULTI_CHOICE") {
          try {
            const choices = JSON.parse(val) as string[];
            for (const c of choices) dist[c] = (dist[c] || 0) + 1;
          } catch {
            dist[val] = (dist[val] || 0) + 1;
          }
        } else {
          dist[val] = (dist[val] || 0) + 1;
        }
      }
      stats.distribution = dist;
    }

    return stats;
  });

  // ENH-MAY6-9: optional group-by breakdown.
  type GroupBucket = { key: string; label: string; responseCount: number };
  let groups: GroupBucket[] | undefined;
  if (filters.groupBy) {
    const buckets = new Map<string, GroupBucket>();
    for (const s of surveys) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const w = (s as any).workshop;
      if (!w) continue;
      let key = "";
      let label = "";
      switch (filters.groupBy) {
        case "coach":
          key = w.coachId ?? "";
          label = w.coach
            ? `${w.coach.firstName ?? ""} ${w.coach.lastName ?? ""}`.trim() || key
            : key;
          break;
        case "category":
          key = w.categoryId ?? "uncategorized";
          label = w.workshopCategory?.name ?? "Uncategorized";
          break;
        case "format":
          key = w.format ?? "unknown";
          label = key;
          break;
        case "workshopType":
          key = w.workshopType?.id ?? "untyped";
          label = w.workshopType?.name ?? "Untyped";
          break;
      }
      if (!key) continue;
      const existing = buckets.get(key);
      if (existing) {
        existing.responseCount += 1;
      } else {
        buckets.set(key, { key, label, responseCount: 1 });
      }
    }
    groups = Array.from(buckets.values()).sort(
      (a, b) => b.responseCount - a.responseCount,
    );
  }

  return {
    templateName: template.name,
    surveyType: template.surveyType,
    totalResponses: surveys.length,
    questionStats,
    responses: surveys,
    groups,
  };
}
