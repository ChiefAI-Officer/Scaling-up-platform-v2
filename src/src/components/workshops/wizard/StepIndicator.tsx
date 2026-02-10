"use client";

import React from "react";
import { Check } from "lucide-react";
import { useWizard } from "./WizardContext";

const steps = [
    { id: 1, title: "Workshop Details" },
    { id: 2, title: "Logistics & Venue" },
    { id: 3, title: "Pricing & Review" },
];

export function StepIndicator() {
    const { currentStep } = useWizard();

    return (
        <div className="mb-8">
            <div className="flex justify-between items-center relative">
                {/* Progress Line Background */}
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-full h-1 bg-gray-200 -z-10 rounded-full" />

                {/* Progress Line Fill */}
                <div
                    className="absolute left-0 top-1/2 -translate-y-1/2 h-1 bg-blue-600 -z-10 rounded-full transition-all duration-300 ease-in-out"
                    style={{ width: `${((currentStep - 1) / (steps.length - 1)) * 100}%` }}
                />

                {steps.map((step) => {
                    const isCompleted = currentStep > step.id;
                    const isCurrent = currentStep === step.id;

                    return (
                        <div key={step.id} className="flex flex-col items-center gap-2">
                            <div
                                className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all duration-300 ${isCompleted
                                        ? "bg-blue-600 border-blue-600 text-white"
                                        : isCurrent
                                            ? "bg-white border-blue-600 text-blue-600"
                                            : "bg-white border-gray-300 text-gray-400"
                                    }`}
                            >
                                {isCompleted ? (
                                    <Check className="w-5 h-5" />
                                ) : (
                                    <span className="font-semibold">{step.id}</span>
                                )}
                            </div>
                            <span
                                className={`text-sm font-medium ${isCurrent ? "text-blue-700" : isCompleted ? "text-gray-900" : "text-gray-400"
                                    }`}
                            >
                                {step.title}
                            </span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
