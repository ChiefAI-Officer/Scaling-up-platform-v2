import React from "react";
import WorkshopWizard from "@/components/workshops/wizard/WorkshopWizard";
import { requireCoach } from "@/lib/authorization";

export default async function RequestWorkshopPage() {
    // Ensure user is authorized coach
    await requireCoach();

    return (
        <div className="max-w-4xl mx-auto py-8">
            <div className="mb-8 text-center">
                <h1 className="text-3xl font-bold text-gray-900 mb-2">Request New Workshop</h1>
                <p className="text-gray-600">
                    Follow the steps below to set up your new workshop event. Your progress is saved automatically.
                </p>
            </div>

            <WorkshopWizard />
        </div>
    );
}
