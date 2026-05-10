import { notFound } from "next/navigation";
import { requireCoach } from "@/lib/auth/authorization";
import { db } from "@/lib/db";
import {
  SurveyResultsView,
  type SurveyResultTemplateGroup,
} from "@/components/surveys/survey-results-view";

interface SurveyResultsPageProps {
  params: Promise<{ id: string }>;
}

export default async function CoachSurveyResultsPage({
  params,
}: SurveyResultsPageProps) {
  const { id: workshopId } = await params;
  const { coach } = await requireCoach();

  const workshop = await db.workshop.findFirst({
    where: { id: workshopId, coachId: coach.id },
    select: { id: true, title: true },
  });

  if (!workshop) {
    notFound();
  }

  const surveys = await db.survey.findMany({
    where: {
      workshopId,
      completedAt: { not: null },
    },
    include: {
      template: {
        include: { questions: { orderBy: { sortOrder: "asc" } } },
      },
      answers: { include: { question: true } },
      registration: {
        select: { firstName: true, lastName: true, email: true },
      },
    },
    orderBy: { completedAt: "desc" },
  });

  const templateMap = new Map<string, SurveyResultTemplateGroup>();
  for (const survey of surveys) {
    if (!survey.template) continue;
    const key = survey.template.id;
    if (!templateMap.has(key)) {
      templateMap.set(key, {
        templateName: survey.template.name,
        surveyType: survey.template.surveyType,
        questions: survey.template.questions.map((q) => ({
          id: q.id,
          label: q.label,
          questionType: q.questionType,
        })),
        responses: [],
      });
    }
    templateMap.get(key)!.responses.push({
      id: survey.id,
      answers: survey.answers.map((a) => ({
        id: a.id,
        questionId: a.questionId,
        value: a.value,
        numValue: a.numValue,
      })),
      registration: survey.registration ?? null,
    });
  }

  return (
    <SurveyResultsView
      workshopTitle={workshop.title}
      backHref={`/portal/workshops/${workshopId}`}
      templateGroups={Array.from(templateMap.values())}
    />
  );
}
