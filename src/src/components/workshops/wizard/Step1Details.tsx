"use client";

import React, { useEffect, useRef, useState } from "react";
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
    const descRef = useRef<HTMLTextAreaElement>(null);

    // MR-43: Insert formatting around selected text in description
    function insertFormat(prefix: string, suffix: string, placeholder: string) {
        const el = descRef.current;
        if (!el) return;
        const start = el.selectionStart ?? 0;
        const end = el.selectionEnd ?? 0;
        const selected = formData.description.slice(start, end) || placeholder;
        const newValue =
            formData.description.slice(0, start) +
            prefix + selected + suffix +
            formData.description.slice(end);
        updateField("description", newValue.slice(0, 500));
        setTimeout(() => {
            el.focus();
            el.setSelectionRange(start + prefix.length, start + prefix.length + selected.length);
        }, 0);
    }

    function insertLink() {
        const url = prompt("Enter URL:");
        if (!url) return;
        const el = descRef.current;
        if (!el) return;
        const start = el.selectionStart ?? 0;
        const end = el.selectionEnd ?? 0;
        const label = formData.description.slice(start, end) || "link text";
        const newValue =
            formData.description.slice(0, start) +
            `[${label}](${url})` +
            formData.description.slice(end);
        updateField("description", newValue.slice(0, 500));
    }

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
                    <Label htmlFor="title">Title</Label>
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
                            <p className="text-xs text-destructive">Title is required</p>
                        )}
                        <p className="text-xs text-muted-foreground ml-auto">{formData.title.length}/120</p>
                    </div>
                </div>

                <div className="space-y-2">
                    <Label htmlFor="description">Description</Label>
                    {/* MR-43: Basic rich text toolbar */}
                    <div className="flex items-center gap-1 rounded-t-md border border-b-0 border-border bg-muted px-2 py-1">
                        <button type="button" onClick={() => insertFormat("**", "**", "bold text")}
                            className="rounded px-1.5 py-0.5 text-xs font-bold hover:bg-accent">B</button>
                        <button type="button" onClick={() => insertFormat("*", "*", "italic text")}
                            className="rounded px-1.5 py-0.5 text-xs italic hover:bg-accent">I</button>
                        <button type="button" onClick={insertLink}
                            className="rounded px-1.5 py-0.5 text-xs hover:bg-accent">Link</button>
                        <button type="button" onClick={() => insertFormat("\n---\n", "", "")}
                            className="rounded px-1.5 py-0.5 text-xs hover:bg-accent">—</button>
                    </div>
                    <Textarea
                        ref={descRef}
                        id="description"
                        value={formData.description}
                        onChange={(e) => updateField("description", e.target.value)}
                        onBlur={() => setTouched(p => ({ ...p, description: true }))}
                        placeholder="Brief description for the landing page..."
                        className="min-h-[120px] rounded-t-none"
                        maxLength={500}
                    />
                    <div className="flex justify-between">
                        {touched.description && !formData.description && (
                            <p className="text-xs text-destructive">Description is required</p>
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
