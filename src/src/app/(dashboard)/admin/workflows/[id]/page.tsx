/**
 * Workflow Editor Page (JV-11 + JV-22)
 * /admin/workflows/[id]
 *
 * Server component that fetches workflow data, delegates editing to client component.
 * "new" as ID creates a new workflow.
 */

import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/auth";
import { db } from "@/lib/db";
import { WorkflowEditor } from "@/components/workflows/workflow-editor";

interface WorkflowEditorPageProps {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ preview?: string }>;
}

export default async function WorkflowEditorPage({ params, searchParams }: WorkflowEditorPageProps) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  if (session.user.role !== "ADMIN") redirect("/dashboard");

  const { id } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const isNew = id === "new";
  const isPreview = resolvedSearchParams.preview === "1";

  if (isNew && isPreview) {
    redirect("/admin/workflows/new");
  }

  // Fetch workflow if editing existing
  let workflow = null;
  if (!isNew) {
    workflow = await db.workflow.findUnique({
      where: { id },
      include: {
        steps: {
          orderBy: { sortOrder: "asc" },
          include: { emailTemplate: true },
        },
        assignments: {
          where: { isActive: true },
          include: {
            workshop: {
              select: {
                id: true,
                title: true,
                workshopCode: true,
                eventDate: true,
                status: true,
              },
            },
          },
        },
      },
    });

    if (!workflow) redirect("/admin/workflows");
  }

  // Fetch reusable email templates for the template picker
  const emailTemplates = await db.emailTemplate.findMany({
    where: { isActive: true },
    select: { id: true, name: true, subject: true, type: true },
    orderBy: { name: "asc" },
  });

  // Fetch workshops for assignment (only active ones)
  const [workshops, categories] = await Promise.all([
    db.workshop.findMany({
      where: { status: { notIn: ["CANCELED", "COMPLETED"] } },
      select: { id: true, title: true, workshopCode: true, eventDate: true },
      orderBy: { eventDate: "asc" },
    }),
    db.category.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  // Serialize dates for client component
  const serializedWorkflow = workflow
    ? {
        ...workflow,
        createdAt: workflow.createdAt.toISOString(),
        updatedAt: workflow.updatedAt.toISOString(),
        steps: workflow.steps.map((s) => ({
          ...s,
          createdAt: s.createdAt.toISOString(),
          updatedAt: s.updatedAt.toISOString(),
          emailTemplate: s.emailTemplate
            ? { ...s.emailTemplate, createdAt: s.emailTemplate.createdAt.toISOString(), updatedAt: s.emailTemplate.updatedAt.toISOString() }
            : null,
        })),
        assignments: workflow.assignments.map((a) => ({
          ...a,
          assignedAt: a.assignedAt.toISOString(),
          workshop: {
            ...a.workshop,
            eventDate: a.workshop.eventDate.toISOString(),
          },
        })),
      }
    : null;

  const serializedWorkshops = workshops.map((w) => ({
    ...w,
    eventDate: w.eventDate.toISOString(),
  }));

  return (
    <div className="space-y-6">
      <WorkflowEditor
        workflow={serializedWorkflow}
        emailTemplates={emailTemplates}
        workshops={serializedWorkshops}
        categories={categories}
        isNew={isNew}
        isPreview={isPreview}
      />
    </div>
  );
}
