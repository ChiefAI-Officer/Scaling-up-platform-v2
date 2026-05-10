// BUG-MAY6-8: admin per-workshop survey results view (parity with coach).
// Coach view at (portal)/portal/workshops/[id]/surveys/page.tsx renders the
// same shared component; auth lives in the (dashboard) layout (non-COACH only).
// Admin's data fetch is NOT scoped by coachId — admin sees every workshop.
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import {
  SurveyResultsView,
  type SurveyResultTemplateGroup,
} from "@/components/surveys/survey-results-view";

export const dynamic = "force-dynamic";

interface AdminSurveyResultsPageProps {
  params: Promise<{ id: string }>;
}

export default async function AdminSurveyResultsPage({
  params,
}: AdminSurveyResultsPageProps) {
  const { id: workshopId } = await params;

  const workshop = await db.workshop.findUnique({
    where: { id: workshopId },
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
      backHref={`/workshops/${workshopId}`}
      templateGroups={Array.from(templateMap.values())}
    />
  );
}
