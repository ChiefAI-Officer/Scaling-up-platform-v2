"use client";

import React from "react";
import { WizardProvider, useWizard } from "./WizardContext";
import { StepIndicator } from "./StepIndicator";
import { Step1Details } from "./Step1Details";
import { Step2Logistics } from "./Step2Logistics";
import { Step3Review } from "./Step3Review";
import { Loader2, Save } from "lucide-react";

function WizardContent() {
    const { currentStep, isLoading, isSaving, lastSavedAt } = useWizard();

    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center py-20">
                <Loader2 className="w-10 h-10 animate-spin text-blue-600 mb-4" />
                <p className="text-muted-foreground">Loading your workshop draft...</p>
            </div>
        );
    }

    return (
        <div className="max-w-3xl mx-auto">
            {/* Auto-save Status */}
            <div className="flex justify-end mb-4 text-sm text-muted-foreground h-6">
                {isSaving ? (
                    <span className="flex items-center gap-1">
                        <Loader2 className="w-3 h-3 animate-spin" /> Saving draft...
                    </span>
                ) : lastSavedAt ? (
                    <span className="flex items-center gap-1">
                        <Save className="w-3 h-3" /> Draft saved {lastSavedAt.toLocaleTimeString()}
                    </span>
                ) : null}
            </div>

            <StepIndicator />

            <div className="bg-card rounded-xl shadow-sm border border-border p-8 transition-all min-h-[400px]">
                {currentStep === 1 && <Step1Details />}
                {currentStep === 2 && <Step2Logistics />}
                {currentStep === 3 && <Step3Review />}
            </div>
        </div>
    );
}

export default function WorkshopWizard() {
    return (
        <WizardProvider>
            <WizardContent />
        </WizardProvider>
    );
}
