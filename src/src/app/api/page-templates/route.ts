import { NextRequest, NextResponse } from "next/server";
import { getApiActor, isPrivilegedRole } from "@/lib/auth/authorization";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";

export async function GET(request: NextRequest) {
    const actor = await getApiActor();
    if (!actor || !isPrivilegedRole(actor.role)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const categoryId = searchParams.get("categoryId");
    const templateType = searchParams.get("templateType");

    const where: Record<string, unknown> = {};
    if (categoryId) where.categoryId = categoryId === "global" ? null : categoryId;
    if (templateType) where.templateType = templateType;

    const templates = await db.pageTemplate.findMany({
        where,
        include: { category: { select: { id: true, name: true, slug: true } } },
        orderBy: [{ isActive: "desc" }, { templateType: "asc" }, { updatedAt: "desc" }],
    });

    return NextResponse.json({ success: true, data: templates });
}

export async function POST(request: NextRequest) {
    const actor = await getApiActor();
    if (!actor || !isPrivilegedRole(actor.role)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    let body;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    const { name, templateType, categoryId, content } = body as {
        name: string;
        templateType: string;
        categoryId?: string | null;
        content?: string;
    };

    if (!name || !templateType) {
        return NextResponse.json(
            { error: "name and templateType are required" },
            { status: 400 }
        );
    }

    const validTypes = ["BIO_PAGE", "SOLO_LANDING", "DUO_LANDING", "REGISTRATION", "THANK_YOU"];
    if (!validTypes.includes(templateType)) {
        return NextResponse.json(
            { error: `templateType must be one of: ${validTypes.join(", ")}` },
            { status: 400 }
        );
    }

    const template = await db.pageTemplate.create({
        data: {
            name,
            templateType: templateType as "BIO_PAGE" | "SOLO_LANDING" | "DUO_LANDING" | "REGISTRATION" | "THANK_YOU",
            categoryId: categoryId || null,
            content: content || "{}",
            isActive: false,
        },
    });

    await logAudit({
        entityType: "PageTemplate",
        entityId: template.id,
        action: "CREATE",
        performedBy: actor.email,
        changes: { name, templateType, categoryId: categoryId || null },
    });

    return NextResponse.json({ success: true, data: template }, { status: 201 });
}
