/**
 * Survey Template Editor — /admin/surveys/templates/[id]
 * Server component that fetches data and passes to client editor.
 */

import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/authorization";
import { SurveyTemplateEditor } from "@/components/surveys/survey-template-editor";

export default async function SurveyTemplateEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;

  const isNew = id === "new";

  let template = null;
  let workshops: { id: string; title: string; workshopCode: string }[] = [];
  let categories: { id: string; name: string }[] = [];

  if (!isNew) {
    template = await db.surveyTemplate.findUnique({
      where: { id },
      include: {
        questions: { orderBy: { sortOrder: "asc" } },
        surveys: {
          include: {
            workshop: { select: { title: true, workshopCode: true } },
            registration: { select: { firstName: true, lastName: true, email: true } },
            // BUG-MAY13-2 (Task B2): include answers + their question join so the
            // Results tab (mounted via <SurveyResultsContent>) can render per-question
            // per-person breakdowns matching the workshop-page view.
            answers: { include: { question: true } },
          },
          orderBy: { createdAt: "desc" },
          take: 50,
        },
      },
    });

    if (!template) {
      return (
        <div className="rounded-lg bg-card p-12 text-center shadow">
          <h2 className="text-lg font-medium text-foreground">Template not found</h2>
        </div>
      );
    }
  }

  // Fetch workshops and categories for dropdowns
  [workshops, categories] = await Promise.all([
    db.workshop.findMany({
      select: { id: true, title: true, workshopCode: true },
      orderBy: { eventDate: "desc" },
      take: 100,
    }),
    db.category.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  // Serialize dates for client component
  const serializedTemplate = template
    ? {
        ...template,
        createdAt: template.createdAt.toISOString(),
        updatedAt: template.updatedAt.toISOString(),
        questions: template.questions.map((q) => ({
          ...q,
          createdAt: q.createdAt.toISOString(),
          updatedAt: q.updatedAt.toISOString(),
        })),
        surveys: template.surveys.map((s) => ({
          ...s,
          sentAt: s.sentAt?.toISOString() || null,
          completedAt: s.completedAt?.toISOString() || null,
          createdAt: s.createdAt.toISOString(),
          // BUG-MAY13-2 (Task B2): serialize joined answers (and their nested
          // question rows) so the Results tab can render per-question
          // per-person breakdowns. <SurveyResultsContent> only consumes
          // id/questionId/value/numValue from each answer, but we keep the
          // raw timestamps as strings for typing parity with the rest of
          // the serialized payload.
          answers: s.answers.map((a) => ({
            id: a.id,
            surveyId: a.surveyId,
            questionId: a.questionId,
            value: a.value,
            numValue: a.numValue,
            createdAt: a.createdAt.toISOString(),
            question: {
              id: a.question.id,
              templateId: a.question.templateId,
              sortOrder: a.question.sortOrder,
              questionType: a.question.questionType,
              label: a.question.label,
              description: a.question.description,
              isRequired: a.question.isRequired,
              options: a.question.options,
            },
          })),
        })),
      }
    : null;

  return (
    <SurveyTemplateEditor
      template={serializedTemplate}
      workshops={workshops}
      categories={categories}
      isNew={isNew}
    />
  );
}
