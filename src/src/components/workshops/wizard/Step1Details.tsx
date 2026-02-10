"use client";

import React from "react";
import { useWizard } from "./WizardContext";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";

export const workshopTypes = [
    { id: "scaling-up-master", name: "Scaling Up Master Class", price: 49500 },
    { id: "exit-planning", name: "Exit Planning Workshop", price: 39500 },
    { id: "strategy-sprint", name: "Strategy Sprint", price: 29500 },
];

export function Step1Details() {
    const { formData, updateField, nextStep } = useWizard();

    const isValid = formData.workshopTypeId && formData.title && formData.description;

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="space-y-4">
                <h2 className="text-xl font-semibold text-gray-900">Workshop Details</h2>
                <p className="text-gray-500">
                    Select the type of workshop and provide the basic details. These will be displayed on the landing page.
                </p>
            </div>

            <div className="space-y-4">
                <div className="space-y-2">
                    <Label htmlFor="type">Workshop Type</Label>
                    <Select
                        value={formData.workshopTypeId}
                        onValueChange={(val) => updateField("workshopTypeId", val)}
                    >
                        <SelectTrigger id="type" className="w-full">
                            <SelectValue placeholder="Select a workshop type..." />
                        </SelectTrigger>
                        <SelectContent>
                            {workshopTypes.map((type) => (
                                <SelectItem key={type.id} value={type.id}>
                                    {type.name}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                <div className="space-y-2">
                    <Label htmlFor="title">Workshop Title</Label>
                    <Input
                        id="title"
                        value={formData.title}
                        onChange={(e) => updateField("title", e.target.value)}
                        placeholder="e.g., Spring Scaling Up Master Class"
                    />
                </div>

                <div className="space-y-2">
                    <Label htmlFor="description">Description</Label>
                    <Textarea
                        id="description"
                        value={formData.description}
                        onChange={(e) => updateField("description", e.target.value)}
                        placeholder="Brief description for the landing page..."
                        className="min-h-[120px]"
                    />
                </div>

                <div className="flex items-center space-x-2 pt-2">
                    <Checkbox
                        id="useCoachPhoto"
                        checked={formData.useCoachPhoto}
                        onChange={(e) => updateField("useCoachPhoto", e.target.checked)}
                    />
                    <Label htmlFor="useCoachPhoto" className="font-normal cursor-pointer">
                        Use my profile photo on landing page (instead of generic graphic)
                    </Label>
                </div>
            </div>

            <div className="flex justify-end pt-6">
                <Button onClick={nextStep} disabled={!isValid}>
                    Next: Logistics →
                </Button>
            </div>
        </div>
    );
}
