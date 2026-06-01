import { NextRequest, NextResponse } from "next/server";
import { getApiActor, isPrivilegedRole } from "@/lib/auth/authorization";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { validateCustomCode } from "@/lib/templates/interpolate-custom-code";
import { sanitizeCustomHtml } from "@/lib/templates/sanitize-custom-html";

const CUSTOM_HTML_ELIGIBLE_TYPES = new Set(["SOLO_LANDING", "DUO_LANDING"]);
const CUSTOM_HTML_MAX_LENGTH = 500_000;

export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const actor = await getApiActor();
    if (!actor || !isPrivilegedRole(actor.role)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const template = await db.pageTemplate.findUnique({
        where: { id },
        include: { category: { select: { id: true, name: true, slug: true } } },
    });

    if (!template) {
        return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: template });
}

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const actor = await getApiActor();
    if (!actor || !isPrivilegedRole(actor.role)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    let body;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    const { name, content, categoryId, isActive, customCode, customHtml } = body as {
        name?: string;
        content?: string;
        categoryId?: string | null;
        isActive?: boolean;
        customCode?: string | null;
        customHtml?: string | null;
    };

    // TEMPLATE-02: eligibility + empty-string normalization + per-call sanitize
    if (typeof customHtml === "string" && customHtml.length > CUSTOM_HTML_MAX_LENGTH) {
        return NextResponse.json(
            { error: "Custom HTML exceeds 500,000 character limit" },
            { status: 400 }
        );
    }

    const customHtmlIsNonEmpty =
        typeof customHtml === "string" && customHtml.trim().length > 0;

    // Validate template content has {{placeholders}} — prevent corruption.
    // Customers using customHtml don't need placeholders in content, so a
    // non-empty customHtml is an explicit escape hatch.
    if (content !== undefined) {
        const hasPlaceholders = /\{\{[^}]+\}\}/.test(content);
        const forceNoPlaceholders = (body as Record<string, unknown>).forceNoPlaceholders;
        if (!hasPlaceholders && !customHtmlIsNonEmpty && !forceNoPlaceholders) {
            return NextResponse.json(
                { error: "Template content has no {{placeholders}}. Auto-build requires placeholders to interpolate workshop data." },
                { status: 400 }
            );
        }
    }

    // CHG-03: validate customCode at save time so the admin sees inline 400
    // before the value is ever rendered. Allow empty string / null to clear
    // the field; only validate non-empty input.
    if (customCode !== undefined && customCode !== null && customCode.trim().length > 0) {
        const result = validateCustomCode(customCode);
        if (!result.valid) {
            return NextResponse.json({ error: result.error }, { status: 400 });
        }
    }

    const existing = await db.pageTemplate.findUnique({ where: { id } });
    if (!existing) {
        return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }

    if (customHtmlIsNonEmpty && !CUSTOM_HTML_ELIGIBLE_TYPES.has(existing.templateType)) {
        return NextResponse.json(
            { error: "Custom HTML is only supported on SOLO_LANDING and DUO_LANDING templates" },
            { status: 400 }
        );
    }

    let normalizedCustomHtml: string | null | undefined;
    let sanitizeResult: ReturnType<typeof sanitizeCustomHtml> | undefined;
    if (customHtml !== undefined) {
        if (customHtml === null || (typeof customHtml === "string" && customHtml.trim() === "")) {
            normalizedCustomHtml = null;
        } else {
            sanitizeResult = sanitizeCustomHtml(customHtml);
            normalizedCustomHtml = sanitizeResult.sanitized;
        }
    }

    // Activation flow: deactivate competitors in the same slot
    if (isActive === true) {
        const slotType = existing.templateType;
        const slotCategory = categoryId !== undefined ? categoryId : existing.categoryId;

        await db.$transaction(async (tx) => {
            // Deactivate any currently active template in the same (templateType, categoryId) slot
            await tx.pageTemplate.updateMany({
                where: {
                    templateType: slotType,
                    categoryId: slotCategory,
                    isActive: true,
                    id: { not: id },
                },
                data: { isActive: false },
            });

            // Activate this template + update other fields
            await tx.pageTemplate.update({
                where: { id },
                data: {
                    isActive: true,
                    ...(name !== undefined ? { name } : {}),
                    ...(content !== undefined ? { content } : {}),
                    ...(categoryId !== undefined ? { categoryId } : {}),
                    ...(customCode !== undefined ? { customCode } : {}),
                    ...(customHtml !== undefined ? { customHtml: normalizedCustomHtml } : {}),
                },
            });
        });
    } else {
        // Non-activation update
        await db.pageTemplate.update({
            where: { id },
            data: {
                ...(name !== undefined ? { name } : {}),
                ...(content !== undefined ? { content } : {}),
                ...(categoryId !== undefined ? { categoryId } : {}),
                ...(isActive !== undefined ? { isActive } : {}),
                ...(customCode !== undefined ? { customCode } : {}),
                ...(customHtml !== undefined ? { customHtml: normalizedCustomHtml } : {}),
            },
        });
    }

    const updated = await db.pageTemplate.findUnique({
        where: { id },
        include: { category: { select: { id: true, name: true, slug: true } } },
    });

    await logAudit({
        entityType: "PageTemplate",
        entityId: id,
        action: "UPDATE",
        performedBy: actor.email,
        changes: {
            ...(name !== undefined ? { name } : {}),
            ...(isActive !== undefined ? { isActive } : {}),
            ...(categoryId !== undefined ? { categoryId } : {}),
            ...(content !== undefined ? { contentUpdated: true } : {}),
            ...(customCode !== undefined ? { customCode } : {}),
            ...(customHtml !== undefined
                ? {
                      customHtmlChanged: true,
                      customHtmlLength: normalizedCustomHtml?.length ?? 0,
                      strippedTags: sanitizeResult?.strippedTags ?? [],
                      strippedAttrs: sanitizeResult?.strippedAttrs ?? [],
                  }
                : {}),
        },
    });

    return NextResponse.json({
        success: true,
        data: updated,
        ...(customHtml !== undefined
            ? { customHtmlSanitized: sanitizeResult?.didStripContent ?? false }
            : {}),
    });
}

export async function DELETE(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const actor = await getApiActor();
    if (!actor || !isPrivilegedRole(actor.role)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const existing = await db.pageTemplate.findUnique({ where: { id } });

    if (!existing) {
        return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }

    if (existing.isActive) {
        return NextResponse.json(
            { error: "Cannot delete an active template. Deactivate it first." },
            { status: 400 }
        );
    }

    // Informational: count pages generated from this template
    const usageCount = await db.landingPage.count({
        where: { sourceTemplateId: id },
    });

    await db.pageTemplate.delete({ where: { id } });

    await logAudit({
        entityType: "PageTemplate",
        entityId: id,
        action: "DELETE",
        performedBy: actor.email,
        changes: { name: existing.name, templateType: existing.templateType },
    });

    return NextResponse.json({
        success: true,
        message: usageCount > 0
            ? `Template deleted. It was previously used to generate ${usageCount} workshop page(s). Those pages are not affected.`
            : "Template deleted.",
    });
}
