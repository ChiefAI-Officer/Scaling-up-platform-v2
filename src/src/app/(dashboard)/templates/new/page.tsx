import { db } from "@/lib/db";
import { CreateTemplateForm } from "./create-template-form";
import { PageHeader } from "@/components/ui/page-header";
import { isMobileResponsiveEnabled } from "@/lib/mobile-responsive-flags";

export default async function NewTemplatePage() {
    const mobileResponsiveEnabled = isMobileResponsiveEnabled();
    const categories = await db.category.findMany({
        where: { isActive: true },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
    });

    return (
        <div className={mobileResponsiveEnabled ? "mx-auto min-w-0 max-w-2xl space-y-6" : "max-w-2xl mx-auto space-y-6"}>
            {mobileResponsiveEnabled ? (
                <PageHeader responsiveEnabled title="Create New Template" />
            ) : (
                <h1 className="text-2xl font-bold text-foreground">Create New Template</h1>
            )}
            <CreateTemplateForm categories={categories} responsiveEnabled={mobileResponsiveEnabled} />
        </div>
    );
}
