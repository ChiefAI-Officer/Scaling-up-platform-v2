import { db } from "@/lib/db";
import { CreateTemplateForm } from "./create-template-form";

export default async function NewTemplatePage() {
    const categories = await db.category.findMany({
        where: { isActive: true },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
    });

    return (
        <div className="max-w-2xl mx-auto space-y-6">
            <h1 className="text-2xl font-bold text-foreground">Create New Template</h1>
            <CreateTemplateForm categories={categories} />
        </div>
    );
}
