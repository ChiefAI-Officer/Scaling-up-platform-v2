"use client";

import React from "react";
import { useWizard } from "./WizardContext";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { workshopTypes } from "./Step1Details";

export function Step3Review() {
    const { formData, updateField, submitWorkshop, prevStep, isSaving } = useWizard();

    const selectedType = workshopTypes.find(t => t.id === formData.workshopTypeId);
    const formattedDate = formData.eventDate
        ? new Date(formData.eventDate).toLocaleDateString("en-US", {
            weekday: "long", month: "long", day: "numeric", year: "numeric"
        })
        : "Date not selected";

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
            <div className="space-y-4">
                <h2 className="text-xl font-semibold text-gray-900">Pricing & Review</h2>
                <p className="text-gray-500">
                    Confirm your workshop details and pricing configuration.
                </p>
            </div>

            {/* Review Summary Card */}
            <Card className="bg-gray-50 border-gray-200">
                <CardContent className="pt-6 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <p className="text-sm font-medium text-gray-500">Workshop</p>
                            <p className="font-semibold text-gray-900">{selectedType?.name || "Unknown Type"}</p>
                            <p className="text-sm text-gray-700 mt-1">{formData.title}</p>
                        </div>
                        <div>
                            <p className="text-sm font-medium text-gray-500">When & Where</p>
                            <p className="font-medium text-gray-900">{formattedDate} at {formData.eventTime}</p>
                            <p className="text-sm text-gray-700">{formData.venueName}, {formData.venueCity}</p>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <div className="space-y-4 py-4">
                <h3 className="font-medium text-gray-900">Pricing Options</h3>

                <div className="flex items-start space-x-3 p-4 border border-gray-200 rounded-lg">
                    <Checkbox
                        id="customPricing"
                        checked={formData.customPricing}
                        onChange={(e) => updateField("customPricing", e.target.checked)}
                        className="mt-1"
                    />
                    <div className="space-y-1">
                        <Label htmlFor="customPricing" className="font-medium cursor-pointer">
                            Request Custom Pricing
                        </Label>
                        <p className="text-sm text-gray-500">
                            Standard price is <span className="font-semibold">${(selectedType?.price || 0) / 100}</span>.
                            Check this if you need to offer a different price (requires approval).
                        </p>
                    </div>
                </div>
            </div>

            <div className="flex justify-between pt-6 border-t border-gray-100">
                <Button variant="outline" onClick={prevStep}>
                    ← Back
                </Button>
                <Button
                    onClick={submitWorkshop}
                    className="bg-blue-600 hover:bg-blue-700 px-8"
                >
                    {isSaving ? "Saving..." : "Submit Workshop Request"}
                </Button>
            </div>
        </div>
    );
}
