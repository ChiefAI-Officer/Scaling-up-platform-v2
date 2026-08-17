/**
 * Assessment v7.6 — Assessment template listing.
 *
 * Spec refs:
 *  - docs/specs/v7.6/02-service-layer-rules.md (canAccessTemplate, INTERSECTION)
 *
 * Admin/staff: all non-deleted templates.
 * Coach: INTERSECTION RBAC — only templates that EVERY active AccessGroup
 * the coach belongs to grants. Implemented in JS off two cheap queries to
 * avoid raw SQL. Heavy `questions/sections/scoring` JSON intentionally
 * excluded; consumers must fetch a specific template detail route for that.
 *
 * Wave D (Task 6b): `resultsEmailApproved` is computed server-side via
 * `isResultsEmailApproved` and returned to the wizard so the #15 toggle can
 * self-disable when the template's approval hash does not match. The raw
 * hash is NEVER exposed to the client.
 *
 * Wave Q (#6): disabled templates (`disabledAt` set) are hidden from BOTH
 * branches UNCONDITIONALLY — spec 19q durable rule: flags gate capabilities
 * and writes, never the enforcement of persisted admin intent.
 * Wave Q (#1): the raw stored `sendResultsDefault` is returned alongside
 * `resultsEmailApproved` so the wizard can derive the checkbox default.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getApiActor, isPrivilegedRole } from "@/lib/auth/authorization";
import { isResultsEmailApproved } from "@/lib/assessments/results-email-approval";
import { isReportStylesEnabled } from "@/lib/assessments/wave-report-styles-flags";
import {
  deriveReportStylePreviewCapabilities,
  type ReportStyleKey,
  type ReportStylePreviewCapabilities,
} from "@/lib/assessments/report-style-registry";
import {
  activePublishedWhere,
  DEFAULT_TEMPLATE_LANGUAGE,
} from "@/lib/assessments/active-version";
import { campaignPickerTemplateWhere } from "@/lib/assessments/campaign-picker-template-scope";
import { isAdminOwnedAssessmentPresentationEnabled } from "@/lib/assessments/wave-admin-owned-assessment-presentation-flags";
import { isPublicMarketingCtaEnabled } from "@/lib/assessments/wave-public-marketing-cta-flags";

interface TemplateSummary {
  id: string;
  name: string;
  alias: string;
  description: string | null;
  aggregationMode: "FULL_VISIBILITY" | "CEO_ONLY";
  /** True only when the results-email content is approved AND the hash matches. */
  resultsEmailApproved: boolean;
  /** Wave Q (#1) — raw stored template-level default for "send results to respondent". */
  sendResultsDefault: boolean;
  defaultReportStyle?: ReportStyleKey;
  reportStylesEnabled?: boolean;
  reportStylePreviewCapabilities?: ReportStylePreviewCapabilities;
  deliveryType?: "PUBLIC_MARKETING_QUIZ" | "INVITED_ASSESSMENT";
}

const previewVersionSelection = {
  where: {
    language: DEFAULT_TEMPLATE_LANGUAGE,
    ...activePublishedWhere,
  },
  orderBy: { versionNumber: "desc" as const },
  take: 1,
  select: { questions: true },
};

export async function GET(request: NextRequest) {
  try {
    // Touch request.url to satisfy the unused-arg lint and keep route
    // handler signature aligned with other GET routes.
    const publicPicker =
      new URL(request.url).searchParams.get("campaignType") === "public" ||
      request.headers.get("x-campaign-type") === "public";
    const actor = await getApiActor();
    if (!actor) {
      return NextResponse.json(
        { success: false, error: "Authentication required" },
        { status: 401 }
      );
    }
    const baseTemplateWhere = await campaignPickerTemplateWhere(db, actor);
    const templateWhere = {
      ...baseTemplateWhere,
      ...(isPublicMarketingCtaEnabled()
        ? {
            deliveryType: publicPicker
              ? ("PUBLIC_MARKETING_QUIZ" as const)
              : ("INVITED_ASSESSMENT" as const),
          }
        : {}),
    };

    if (isPrivilegedRole(actor.role)) {
      const templates = await db.assessmentTemplate.findMany({
        where: templateWhere,
        select: {
          id: true,
          name: true,
          alias: true,
          description: true,
          aggregationMode: true,
          defaultReportStyle: true,
          sendResultsDefault: true,
          resultsEmailContentApproved: true,
          resultsEmailContentApprovedHash: true,
          resultsEmailSubject: true,
          resultsEmailBodyMarkdown: true,
          deliveryType: true,
        },
        orderBy: { name: "asc" },
      });
      const availability = new Map(
        templates.map((template) => [
          template.id,
          isReportStylesEnabled({ templateId: template.id }),
        ]),
      );
      const availableTemplateIds = templates
        .filter((template) => availability.get(template.id))
        .map((template) => template.id);
      const capabilityRows =
        availableTemplateIds.length > 0
          ? await db.assessmentTemplate.findMany({
              where: { id: { in: availableTemplateIds } },
              select: {
                id: true,
                versions: previewVersionSelection,
              },
            })
          : [];
      const capabilitiesByTemplateId = new Map(
        capabilityRows.map((row) => [
          row.id,
          deriveReportStylePreviewCapabilities({
            templateAlias: templates.find(
              (template) => template.id === row.id,
            )?.alias,
            questions: row.versions?.[0]?.questions ?? [],
          }),
        ]),
      );
      return NextResponse.json({
        success: true,
        data: templates.map((t) => {
          const reportStylesEnabled = availability.get(t.id) === true;
          return {
            id: t.id,
            name: t.name,
            alias: t.alias,
            description: t.description,
            aggregationMode: t.aggregationMode,
            defaultReportStyle: t.defaultReportStyle,
            reportStylesEnabled,
            resultsEmailApproved: isResultsEmailApproved(t),
            sendResultsDefault: t.sendResultsDefault,
            deliveryType: t.deliveryType,
            ...(reportStylesEnabled
              ? {
                  reportStylePreviewCapabilities:
                    capabilitiesByTemplateId.get(t.id) ??
                    deriveReportStylePreviewCapabilities({
                      templateAlias: t.alias,
                      questions: [],
                    }),
                }
              : {}),
          };
        }) satisfies TemplateSummary[],
      });
    }

    // Coach path — scope enforces INTERSECTION RBAC.
    const adminOwnedPresentation =
      isAdminOwnedAssessmentPresentationEnabled();

    const templates = await db.assessmentTemplate.findMany({
      where: templateWhere,
      select: {
        id: true,
        name: true,
        alias: true,
        description: true,
        aggregationMode: true,
        ...(!adminOwnedPresentation ? { defaultReportStyle: true } : {}),
        sendResultsDefault: true,
        resultsEmailContentApproved: true,
        resultsEmailContentApprovedHash: true,
        resultsEmailSubject: true,
        resultsEmailBodyMarkdown: true,
        deliveryType: true,
      },
      orderBy: { name: "asc" },
    });
    const availability = new Map(
      adminOwnedPresentation
        ? []
        : templates.map((template) => [
            template.id,
            isReportStylesEnabled({ templateId: template.id }),
          ]),
    );
    const availableTemplateIds = templates
      .filter((template) => availability.get(template.id))
      .map((template) => template.id);
    const capabilityRows =
      availableTemplateIds.length > 0
        ? await db.assessmentTemplate.findMany({
            where: { id: { in: availableTemplateIds } },
            select: {
              id: true,
              versions: previewVersionSelection,
            },
          })
        : [];
    const capabilitiesByTemplateId = new Map(
      capabilityRows.map((row) => [
        row.id,
        deriveReportStylePreviewCapabilities({
          templateAlias: templates.find(
            (template) => template.id === row.id,
          )?.alias,
          questions: row.versions?.[0]?.questions ?? [],
        }),
      ]),
    );

    return NextResponse.json({
      success: true,
      data: templates.map((t) => {
        const reportStylesEnabled = availability.get(t.id) === true;
        return {
          id: t.id,
          name: t.name,
          alias: t.alias,
          description: t.description,
          aggregationMode: t.aggregationMode,
          resultsEmailApproved: isResultsEmailApproved(t),
          sendResultsDefault: t.sendResultsDefault,
          deliveryType: t.deliveryType,
          ...(!adminOwnedPresentation
            ? {
                defaultReportStyle: t.defaultReportStyle,
                reportStylesEnabled,
              }
            : {}),
          ...(!adminOwnedPresentation && reportStylesEnabled
            ? {
                reportStylePreviewCapabilities:
                  capabilitiesByTemplateId.get(t.id) ??
                  deriveReportStylePreviewCapabilities({
                    templateAlias: t.alias,
                    questions: [],
                  }),
              }
            : {}),
        };
      }) satisfies TemplateSummary[],
    });
  } catch (error) {
    console.error("Error listing assessment templates:", error);
    return NextResponse.json(
      { success: false, error: "Failed to list templates" },
      { status: 500 }
    );
  }
}
