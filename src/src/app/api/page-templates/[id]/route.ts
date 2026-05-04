import { NextRequest, NextResponse } from "next/server";
import { getApiActor, isPrivilegedRole } from "@/lib/auth/authorization";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { validateCustomCode } from "@/lib/templates/interpolate-custom-code";

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
    const { name, content, categoryId, isActive, customCode } = body as {
        name?: string;
        content?: string;
        categoryId?: string | null;
        isActive?: boolean;
        customCode?: string | null;
    };

    // Validate template content has {{placeholders}} — prevent corruption
    if (content !== undefined) {
        const hasPlaceholders = /\{\{[^}]+\}\}/.test(content);
        if (!hasPlaceholders && !(body as Record<string, unknown>).forceNoPlaceholders) {
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
        },
    });

    return NextResponse.json({ success: true, data: updated });
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
