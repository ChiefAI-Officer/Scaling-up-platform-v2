import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getApiActor, isPrivilegedRole } from "@/lib/authorization";

const SURVEY_WORKFLOW_TASK_TYPE = "SURVEY_WORKFLOW_CONFIG";

const upsertSurveyWorkflowSchema = z.object({
  workshopId: z.string().min(1, "Workshop ID is required"),
  preSurveyFormId: z.string().trim().optional(),
  postSurveyFormId: z.string().trim().optional(),
  npsSurveyFormId: z.string().trim().optional(),
  isActive: z.boolean().default(true),
});

interface SurveyWorkflowConfig {
  preSurveyFormId?: string;
  postSurveyFormId?: string;
  npsSurveyFormId?: string;
  isActive?: boolean;
}

function parseSurveyWorkflowConfig(inputData: string | null): SurveyWorkflowConfig {
  if (!inputData) {
    return {};
  }

  try {
    const parsed = JSON.parse(inputData) as SurveyWorkflowConfig;
    return {
      preSurveyFormId: parsed.preSurveyFormId?.trim() || undefined,
      postSurveyFormId: parsed.postSurveyFormId?.trim() || undefined,
      npsSurveyFormId: parsed.npsSurveyFormId?.trim() || undefined,
      isActive: parsed.isActive !== false,
    };
  } catch {
    return {};
  }
}

export async function GET() {
  try {
    const actor = await getApiActor();
    if (!actor) {
      return NextResponse.json(
        { success: false, error: "Authentication required" },
        { status: 401 }
      );
    }
    if (!isPrivilegedRole(actor.role)) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    }

    const [workflowTasks, surveys, workshops] = await Promise.all([
      db.automationTask.findMany({
        where: { taskType: SURVEY_WORKFLOW_TASK_TYPE },
        include: {
          workshop: {
            select: {
              id: true,
              title: true,
              eventDate: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
      }),
      db.survey.findMany({
        include: {
          workshop: {
            select: {
              id: true,
              title: true,
              eventDate: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        take: 300,
      }),
      db.workshop.findMany({
        select: { id: true, title: true, eventDate: true },
        orderBy: { eventDate: "desc" },
        take: 100,
      }),
    ]);

    const latestByWorkshop = new Map<string, (typeof workflowTasks)[number]>();
    for (const task of workflowTasks) {
      if (!latestByWorkshop.has(task.workshopId)) {
        latestByWorkshop.set(task.workshopId, task);
      }
    }

    const workflowConfigs = Array.from(latestByWorkshop.values()).map((task) => {
      const config = parseSurveyWorkflowConfig(task.inputData);
      return {
        workshopId: task.workshopId,
        workshopTitle: task.workshop.title,
        eventDate: task.workshop.eventDate,
        preSurveyFormId: config.preSurveyFormId || "",
        postSurveyFormId: config.postSurveyFormId || "",
        npsSurveyFormId: config.npsSurveyFormId || "",
        isActive: config.isActive !== false,
        updatedAt: task.createdAt,
      };
    });

    const trends = workshops.map((workshop) => {
      const workshopSurveys = surveys.filter((survey) => survey.workshopId === workshop.id);
      const npsValues = workshopSurveys
        .map((survey) => survey.npsScore)
        .filter((score): score is number => typeof score === "number");
      const avgNps =
        npsValues.length > 0
          ? Math.round((npsValues.reduce((sum, score) => sum + score, 0) / npsValues.length) * 10) /
            10
          : null;

      return {
        workshopId: workshop.id,
        workshopTitle: workshop.title,
        eventDate: workshop.eventDate,
        responses: workshopSurveys.length,
        completed: workshopSurveys.filter((survey) => Boolean(survey.completedAt)).length,
        avgNps,
      };
    });

    const responseItems = surveys.map((survey) => ({
      id: survey.id,
      surveyType: survey.surveyType,
      workshopId: survey.workshopId,
      workshopTitle: survey.workshop.title,
      sentAt: survey.sentAt,
      completedAt: survey.completedAt,
      npsScore: survey.npsScore,
    }));

    return NextResponse.json({
      success: true,
      data: {
        workshops,
        workflowConfigs,
        trends,
        responses: responseItems,
      },
    });
  } catch (error) {
    console.error("Failed to load survey workflows:", error);
    return NextResponse.json(
      { success: false, error: "Failed to load survey workflows" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await getApiActor();
    if (!actor) {
      return NextResponse.json(
        { success: false, error: "Authentication required" },
        { status: 401 }
      );
    }
    if (!isPrivilegedRole(actor.role)) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const parsed = upsertSurveyWorkflowSchema.parse({
      ...body,
      preSurveyFormId: typeof body.preSurveyFormId === "string" ? body.preSurveyFormId.trim() : "",
      postSurveyFormId: typeof body.postSurveyFormId === "string" ? body.postSurveyFormId.trim() : "",
      npsSurveyFormId: typeof body.npsSurveyFormId === "string" ? body.npsSurveyFormId.trim() : "",
    });

    const workshop = await db.workshop.findUnique({
      where: { id: parsed.workshopId },
      select: { id: true },
    });

    if (!workshop) {
      return NextResponse.json(
        { success: false, error: "Workshop not found" },
        { status: 404 }
      );
    }

    await db.automationTask.create({
      data: {
        workshopId: parsed.workshopId,
        taskType: SURVEY_WORKFLOW_TASK_TYPE,
        status: "COMPLETED",
        inputData: JSON.stringify({
          preSurveyFormId: parsed.preSurveyFormId || "",
          postSurveyFormId: parsed.postSurveyFormId || "",
          npsSurveyFormId: parsed.npsSurveyFormId || "",
          isActive: parsed.isActive,
        }),
        outputData: JSON.stringify({
          configuredBy: actor.email,
          configuredAt: new Date().toISOString(),
        }),
      },
    });

    return NextResponse.json({
      success: true,
      message: "Survey workflow attached to workshop",
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: error.issues },
        { status: 400 }
      );
    }

    console.error("Failed to save survey workflow:", error);
    return NextResponse.json(
      { success: false, error: "Failed to save survey workflow" },
      { status: 500 }
    );
  }
}

