import React from "react";
import { requireCoach } from "@/lib/authorization";
import { FileBox } from "lucide-react";

export default async function TemplatesPage() {
    await requireCoach();

    return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-4">
            <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center">
                <FileBox className="w-8 h-8 text-primary" />
            </div>
            <h1 className="text-2xl font-bold text-foreground">Workshop Templates</h1>
            <p className="text-muted-foreground max-w-md">
                Save your frequently used workshop configurations as templates to speed up your workflow. This feature is coming soon!
            </p>
        </div>
    );
}
