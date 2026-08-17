import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { TemplateContentEditor } from "@/components/templates/template-content-editor";
import { isMobileResponsiveEnabled } from "@/lib/mobile-responsive-flags";

interface PageProps {
    params: Promise<{ id: string }>;
}

export default async function TemplateEditorPage({ params }: PageProps) {
    const mobileResponsiveEnabled = isMobileResponsiveEnabled();
    const { id } = await params;

    const template = await db.pageTemplate.findUnique({
        where: { id },
        include: { category: { select: { id: true, name: true } } },
    });

    if (!template) {
        notFound();
    }

    const displayName = template.name.replace(/^Global\s+/i, "");

    return (
        <div className={mobileResponsiveEnabled ? "min-w-0 max-w-full space-y-6" : "space-y-6"}>
            <div className={mobileResponsiveEnabled ? "flex min-w-0 flex-wrap items-center gap-2 break-words text-sm text-muted-foreground" : "flex items-center gap-2 text-sm text-muted-foreground"}>
                <Link href="/templates" className="hover:text-foreground transition-colors">
                    Templates
                </Link>
                <span>/</span>
                <span className="text-foreground">{displayName}</span>
            </div>

            <TemplateContentEditor
                templateId={template.id}
                templateType={template.templateType}
                templateName={displayName}
                categoryName={template.category?.name || "All Categories"}
                isActive={template.isActive}
                initialContent={template.content}
                initialCustomCode={template.customCode}
                initialCustomHtml={template.customHtml}
                responsiveEnabled={mobileResponsiveEnabled}
            />
        </div>
    );
}
