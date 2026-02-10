import React from "react";
import { requireCoach } from "@/lib/authorization";
import { FileBox } from "lucide-react";

export default async function TemplatesPage() {
    await requireCoach();

    return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-4">
            <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center">
                <FileBox className="w-8 h-8 text-blue-600" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900">Workshop Templates</h1>
            <p className="text-gray-500 max-w-md">
                Save your frequently used workshop configurations as templates to speed up your workflow. This feature is coming soon!
            </p>
        </div>
    );
}
