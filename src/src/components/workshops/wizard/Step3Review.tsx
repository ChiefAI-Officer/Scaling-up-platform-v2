"use client";

import React, { useEffect, useState } from "react";
import { useWizard } from "./WizardContext";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { workshopTypes } from "./Step1Details";

interface PricingTier {
    id: string;
    name: string;
    amountCents: number;
}

interface CategoryWithTiers {
    id: string;
    name: string;
    pricingTiers: PricingTier[];
}

export function Step3Review() {
    const { formData, updateField, submitWorkshop, prevStep, isSaving } = useWizard();
    const [categories, setCategories] = useState<CategoryWithTiers[]>([]);

    useEffect(() => {
        async function fetchCategories() {
            try {
                const res = await fetch("/api/categories");
                if (res.ok) {
                    const data = await res.json();
                    if (Array.isArray(data)) setCategories(data);
                }
            } catch {
                // Fallback to legacy mode
            }
        }
        fetchCategories();
    }, []);

    const selectedCategory = categories.find(c => c.id === formData.categoryId);
    const pricingTiers = selectedCategory?.pricingTiers || [];
    const selectedTier = pricingTiers.find(t => t.id === formData.pricingTierId);

    // Legacy fallback: if no categories loaded, use hardcoded workshopTypes
    const legacyType = workshopTypes.find(t => t.id === formData.workshopTypeId);
    const displayName = selectedCategory?.name || legacyType?.name || "Unknown";

    const formattedDate = formData.eventDate
        ? new Date(formData.eventDate).toLocaleDateString("en-US", {
            weekday: "long", month: "long", day: "numeric", year: "numeric"
        })
        : "Date not selected";

    const formatLabel = formData.format === "VIRTUAL" ? "Virtual"
        : formData.format === "HYBRID" ? "Hybrid" : "In-Person";

    const locationDisplay = formData.format === "VIRTUAL"
        ? `${formData.virtualPlatform || "Virtual"}`
        : `${formData.venueName}${formData.venueCity ? `, ${formData.venueCity}` : ""}`;

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
            <div className="space-y-4">
                <h2 className="text-xl font-semibold text-foreground">Pricing & Review</h2>
                <p className="text-muted-foreground">
                    Confirm your workshop details and select pricing.
                </p>
            </div>

            {/* Review Summary Card */}
            <Card className="bg-muted border-border">
                <CardContent className="pt-6 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <p className="text-sm font-medium text-muted-foreground">Category</p>
                            <p className="font-semibold text-foreground">{displayName}</p>
                            <p className="text-sm text-foreground mt-1">{formData.title}</p>
                        </div>
                        <div>
                            <p className="text-sm font-medium text-muted-foreground">When & Where</p>
                            <p className="font-medium text-foreground">{formattedDate} at {formData.eventTime}</p>
                            <p className="text-sm text-foreground">{locationDisplay}</p>
                            <p className="text-xs text-muted-foreground mt-1">{formatLabel}</p>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* JV-17: Pricing Tier Dropdown */}
            <div className="space-y-4 py-4">
                <h3 className="font-medium text-foreground">Pricing</h3>

                {pricingTiers.length > 0 ? (
                    <div className="space-y-3">
                        <div className="space-y-2">
                            <Label htmlFor="pricingTier">Select Pricing Tier</Label>
                            <Select
                                value={formData.pricingTierId}
                                onValueChange={(val) => updateField("pricingTierId", val)}
                            >
                                <SelectTrigger id="pricingTier" className="w-full">
                                    <SelectValue placeholder="Choose a pricing tier..." />
                                </SelectTrigger>
                                <SelectContent>
                                    {pricingTiers.map((tier) => (
                                        <SelectItem key={tier.id} value={tier.id}>
                                            {tier.name} — ${(tier.amountCents / 100).toFixed(0)}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        {selectedTier && (
                            <p className="text-sm text-muted-foreground">
                                Selected: <span className="font-semibold">${(selectedTier.amountCents / 100).toFixed(0)}</span> per attendee
                            </p>
                        )}

                        <div className="flex items-start space-x-3 p-4 border border-border rounded-lg">
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
                                <p className="text-sm text-muted-foreground">
                                    Need a different price? Check this to request approval for custom pricing.
                                </p>
                            </div>
                        </div>
                    </div>
                ) : (
                    /* Legacy fallback: no pricing tiers in DB */
                    <div className="flex items-start space-x-3 p-4 border border-border rounded-lg">
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
                            <p className="text-sm text-muted-foreground">
                                Standard price is <span className="font-semibold">${(legacyType?.price || 0) / 100}</span>.
                                Check this if you need to offer a different price (requires approval).
                            </p>
                        </div>
                    </div>
                )}
            </div>

            {/* JV-27: Terms and Conditions */}
            <div className="flex items-start space-x-3 p-4 border border-border rounded-lg bg-blue-50/50">
                <Checkbox
                    id="termsAccepted"
                    checked={formData.termsAccepted}
                    onChange={(e) => updateField("termsAccepted", e.target.checked)}
                    className="mt-1"
                />
                <div className="space-y-1">
                    <Label htmlFor="termsAccepted" className="font-medium cursor-pointer">
                        I agree to the Terms and Conditions
                    </Label>
                    <p className="text-sm text-muted-foreground">
                        By submitting this workshop request, I confirm that I have read and agree to the
                        Scaling Up workshop hosting terms, including cancellation policies, pricing guidelines,
                        and brand usage requirements.
                    </p>
                </div>
            </div>

            <div className="flex justify-between pt-6 border-t border-border">
                <Button variant="outline" onClick={prevStep}>
                    ← Back
                </Button>
                <Button
                    onClick={submitWorkshop}
                    disabled={!formData.termsAccepted || isSaving}
                    className="bg-blue-600 hover:bg-blue-700 px-8 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {isSaving ? "Saving..." : "Submit Workshop Request"}
                </Button>
            </div>
        </div>
    );
}
