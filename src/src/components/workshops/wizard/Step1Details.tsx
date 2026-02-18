"use client";

import React, { useEffect, useState } from "react";
import { useWizard } from "./WizardContext";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";

// JV-16: Fallback for when Category model has no data yet
export const workshopTypes = [
    { id: "scaling-up-master", name: "Scaling Up Master Class", price: 49500 },
    { id: "exit-planning", name: "Exit Planning Workshop", price: 39500 },
    { id: "strategy-sprint", name: "Strategy Sprint", price: 29500 },
];

interface CategoryWithTiers {
    id: string;
    name: string;
    slug: string;
    pricingTiers: { id: string; name: string; amountCents: number }[];
}

export function Step1Details() {
    const { formData, updateField, nextStep } = useWizard();
    const [categories, setCategories] = useState<CategoryWithTiers[]>([]);
    const [loadingCategories, setLoadingCategories] = useState(true);
    const [touched, setTouched] = useState<Record<string, boolean>>({});

    useEffect(() => {
        async function fetchCategories() {
            try {
                const res = await fetch("/api/categories");
                if (res.ok) {
                    const data = await res.json();
                    if (Array.isArray(data) && data.length > 0) {
                        setCategories(data);
                    }
                }
            } catch {
                // Fall back to hardcoded types
            } finally {
                setLoadingCategories(false);
            }
        }
        fetchCategories();
    }, []);

    const hasCategories = categories.length > 0;

    // Validation: need either a category or a workshopType (legacy), plus title + description
    const isValid = (hasCategories ? formData.categoryId : formData.workshopTypeId) &&
        formData.title &&
        formData.description;

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="space-y-4">
                <h2 className="text-xl font-semibold text-foreground">Workshop Details</h2>
                <p className="text-muted-foreground">
                    Select the workshop category and provide the basic details.
                </p>
            </div>

            <div className="space-y-4">
                {/* JV-16: Dynamic category dropdown replaces hardcoded workshop types */}
                {hasCategories ? (
                    <div className="space-y-2">
                        <Label htmlFor="category">Workshop Category</Label>
                        <Select
                            value={formData.categoryId}
                            onValueChange={(val) => {
                                updateField("categoryId", val);
                                // Clear pricing tier when category changes
                                updateField("pricingTierId", "");
                            }}
                        >
                            <SelectTrigger id="category" className="w-full">
                                <SelectValue placeholder="Select a category..." />
                            </SelectTrigger>
                            <SelectContent>
                                {categories.map((cat) => (
                                    <SelectItem key={cat.id} value={cat.id}>
                                        {cat.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                ) : (
                    <div className="space-y-2">
                        <Label htmlFor="type">Workshop Type</Label>
                        <Select
                            value={formData.workshopTypeId}
                            onValueChange={(val) => updateField("workshopTypeId", val)}
                        >
                            <SelectTrigger id="type" className="w-full">
                                <SelectValue placeholder={loadingCategories ? "Loading..." : "Select a workshop type..."} />
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
                )}

                <div className="space-y-2">
                    <Label htmlFor="title">Workshop Title</Label>
                    <Input
                        id="title"
                        value={formData.title}
                        onChange={(e) => updateField("title", e.target.value)}
                        onBlur={() => setTouched(p => ({ ...p, title: true }))}
                        placeholder="e.g., Spring Scaling Up Master Class"
                        maxLength={120}
                    />
                    <div className="flex justify-between">
                        {touched.title && !formData.title && (
                            <p className="text-xs text-red-500">Title is required</p>
                        )}
                        <p className="text-xs text-muted-foreground ml-auto">{formData.title.length}/120</p>
                    </div>
                </div>

                <div className="space-y-2">
                    <Label htmlFor="description">Description</Label>
                    <Textarea
                        id="description"
                        value={formData.description}
                        onChange={(e) => updateField("description", e.target.value)}
                        onBlur={() => setTouched(p => ({ ...p, description: true }))}
                        placeholder="Brief description for the landing page..."
                        className="min-h-[120px]"
                        maxLength={500}
                    />
                    <div className="flex justify-between">
                        {touched.description && !formData.description && (
                            <p className="text-xs text-red-500">Description is required</p>
                        )}
                        <p className="text-xs text-muted-foreground ml-auto">{formData.description.length}/500</p>
                    </div>
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
