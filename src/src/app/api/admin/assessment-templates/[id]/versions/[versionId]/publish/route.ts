/**
 * Assessment v7.6 — Admin publish a draft AssessmentTemplateVersion.
 *
 * Sets publishedAt + publishedBy. Idempotent: 409 if already published.
 * Published versions are immutable by design (no edit route).
 */

import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getApiActor, isPrivilegedRole } from "@/lib/auth/authorization";
import { logAudit } from "@/lib/audit";
import { RateLimits, withRateLimit } from "@/lib/rate-limit";
import { getPublishValidationIssues } from "@/lib/assessments/scoring";
import { isPublicMarketingCtaEnabled } from "@/lib/assessments/wave-public-marketing-cta-flags";
import {
  extractMarketingCta,
  getMarketingCtaPublishIssues,
} from "@/lib/assessments/marketing-cta";
import { computeTemplateContentHash } from "@/lib/assessments/template-content-hash";
import { isReportHtmlExperienceEnabled } from "@/lib/assessments/wave-report-html-authoring-flags";
import { prepareReportHtmlForStorage } from "@/lib/assessments/report-html";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; versionId: string }> },
) {
  try {
    const rate = await withRateLimit(request, RateLimits.standard);
    if (!rate.allowed) {
      return NextResponse.json(
        { success: false, error: "Too many requests" },
        { status: 429, headers: rate.headers },
      );
    }

    const actor = await getApiActor();
    if (!actor) {
      return NextResponse.json(
        { success: false, error: "Authentication required" },
        { status: 401 },
      );
    }
    if (!isPrivilegedRole(actor.role)) {
      return NextResponse.json(
        { success: false, error: "Forbidden" },
        { status: 403 },
      );
    }

    const { id: templateId, versionId } = await params;

    const version = await db.assessmentTemplateVersion.findUnique({
      where: { id: versionId },
      select: {
        id: true,
        templateId: true,
        publishedAt: true,
        versionNumber: true,
        questions: true,
        sections: true,
        scoringConfig: true,
        reportConfig: true,
        template: {
          select: {
            deliveryType: true,
            invitationSubject: true,
            invitationBodyMarkdown: true,
          },
        },
      },
    });
    if (!version || version.templateId !== templateId) {
      return NextResponse.json(
        { success: false, error: "Version not found" },
        { status: 404 },
      );
    }
    if (version.publishedAt !== null) {
      return NextResponse.json(
        { success: false, error: "ALREADY_PUBLISHED" },
        { status: 409 },
      );
    }

    // D2.1 strict publish-time validation: bands fully cover the scale,
    // sentinel text rejected, domain assignment complete. Existing
    // Rockefeller/QSP templates pass because they don't opt into the new
    // fields; new D2 templates (SU Full) must pass before publishedAt flips.
    const publishIssues = getPublishValidationIssues({
      questions: version.questions,
      sections: version.sections,
      scoringConfig: version.scoringConfig,
    });
    let preparedReportConfig: unknown = version.reportConfig;
    const reportHtmlActive = isReportHtmlExperienceEnabled();
    if (reportHtmlActive) {
      const prepared = prepareReportHtmlForStorage(preparedReportConfig);
      if (!prepared.ok) {
        return NextResponse.json(
          {
            success: false,
            error: "Invalid report HTML",
            code: "INVALID_REPORT_HTML",
            issues: prepared.issues,
          },
          { status: 422 },
        );
      }
      preparedReportConfig = prepared.reportConfig;
    }

    const marketingIssues =
      !reportHtmlActive &&
      isPublicMarketingCtaEnabled() &&
      version.template?.deliveryType === "PUBLIC_MARKETING_QUIZ"
        ? getMarketingCtaPublishIssues(
            extractMarketingCta(version.reportConfig),
          ).map((issue) => ({ path: issue.path, message: issue.message }))
        : [];
    if (publishIssues.length > 0 || marketingIssues.length > 0) {
      return NextResponse.json(
        {
          success: false,
          error: "PUBLISH_VALIDATION_FAILED",
          issues: [...publishIssues, ...marketingIssues],
        },
        { status: 422 },
      );
    }

    const now = new Date();
    const updateData: {
      publishedAt: Date;
      publishedBy: string;
      reportConfig?: Prisma.InputJsonValue | typeof Prisma.JsonNull;
      contentHash?: string;
    } = { publishedAt: now, publishedBy: actor.userId };
    if (reportHtmlActive) {
      updateData.reportConfig =
        preparedReportConfig === null || preparedReportConfig === undefined
          ? Prisma.JsonNull
          : (preparedReportConfig as Prisma.InputJsonValue);
      updateData.contentHash = computeTemplateContentHash({
        questions: version.questions,
        sections: version.sections,
        scoringConfig: version.scoringConfig,
        reportConfig: preparedReportConfig,
        invitationSubject: version.template.invitationSubject,
        invitationBodyMarkdown: version.template.invitationBodyMarkdown,
      });
    }
    await db.assessmentTemplateVersion.update({
      where: { id: versionId },
      data: updateData,
    });

    await logAudit({
      entityType: "AssessmentTemplateVersion",
      entityId: versionId,
      action: "UPDATE",
      performedBy: actor.email ?? actor.userId,
      changes: {
        publishedAt: now.toISOString(),
        versionNumber: version.versionNumber,
      },
    });

    return NextResponse.json({
      success: true,
      data: { publishedAt: now.toISOString() },
    });
  } catch (error) {
    console.error("Error publishing template version:", error);
    return NextResponse.json(
      { success: false, error: "Failed to publish version" },
      { status: 500 },
    );
  }
}
