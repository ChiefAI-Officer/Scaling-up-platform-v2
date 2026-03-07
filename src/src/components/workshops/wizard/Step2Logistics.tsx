"use client";

import React from "react";
import { useWizard } from "./WizardContext";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
    getMinimumLeadTimeDate,
    getMinimumLeadTimeDays,
    normalizeLeadTimeFormat,
} from "@/lib/lead-time-validator";

function getMinDate(format: string): string {
    return getMinimumLeadTimeDate(format).toISOString().split("T")[0];
}

function getLeadTimeMessage(format: string): string {
    const normalizedFormat = normalizeLeadTimeFormat(format);
    const days = getMinimumLeadTimeDays(normalizedFormat);

    if (normalizedFormat === "VIRTUAL") {
        return `Virtual events must be at least ${days} days out.`;
    }

    if (normalizedFormat === "HYBRID") {
        return `Hybrid events must be at least ${days} days out.`;
    }

    return `In-person events must be at least ${days} days out.`;
}

function isValidUrl(str: string): boolean {
    if (!str) return true; // Empty is OK (optional field)
    try { new URL(str); return true; } catch { return false; }
}

export function Step2Logistics() {
    const { formData, updateField, nextStep, prevStep } = useWizard();
    const minDate = getMinDate(formData.format);

    const dateIsTooSoon = formData.eventDate && formData.eventDate < minDate;
    const virtualLinkInvalid = formData.virtualLink && !isValidUrl(formData.virtualLink);

    const hasDateAndTime = formData.eventDate && formData.eventTime && !dateIsTooSoon;

    const hasVenueInfo =
        formData.venueName &&
        formData.venueAddress &&
        formData.venueCity &&
        formData.venueState &&
        formData.venueZip;

    const hasVirtualInfo = formData.virtualPlatform !== "";

    const isValid = (() => {
        if (!hasDateAndTime) return false;
        if (formData.format === "VIRTUAL") return hasVirtualInfo;
        if (formData.format === "IN_PERSON") return hasVenueInfo;
        // HYBRID needs both
        return hasVenueInfo && hasVirtualInfo;
    })();

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
            <div className="space-y-4">
                <h2 className="text-xl font-semibold text-foreground">Event Logistics</h2>
                <p className="text-muted-foreground">
                    Where and when will this workshop take place?
                </p>
            </div>

            {/* JV-19: Format selector (virtual/in-person/hybrid) */}
            <div className="space-y-3">
                <Label className="text-sm font-medium text-foreground">Workshop Format</Label>
                <div className="grid grid-cols-3 gap-3">
                    {([
                        { value: "IN_PERSON" as const, label: "In-Person", desc: "Physical venue" },
                        { value: "VIRTUAL" as const, label: "Virtual", desc: "Online meeting" },
                        { value: "HYBRID" as const, label: "Hybrid", desc: "Both in-person & online" },
                    ]).map((option) => (
                        <button
                            key={option.value}
                            type="button"
                            onClick={() => updateField("format", option.value)}
                            className={`flex flex-col items-center gap-1 p-4 rounded-lg border-2 transition-colors ${
                                formData.format === option.value
                                    ? "border-primary bg-primary/10 text-primary"
                                    : "border-border hover:border-border text-muted-foreground"
                            }`}
                        >
                            <span className="text-sm font-medium">{option.label}</span>
                            <span className="text-xs opacity-75">{option.desc}</span>
                        </button>
                    ))}
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                    <Label htmlFor="eventDate">Event Date</Label>
                    <Input
                        type="date"
                        id="eventDate"
                        value={formData.eventDate}
                        min={minDate}
                        onChange={(e) => updateField("eventDate", e.target.value)}
                    />
                    {dateIsTooSoon && (
                        <p className="text-xs text-warning">
                            {getLeadTimeMessage(formData.format)} Earliest: {new Date(minDate).toLocaleDateString()}
                        </p>
                    )}
                </div>

                <div className="space-y-2">
                    <Label htmlFor="eventTime">Start Time</Label>
                    <Input
                        type="time"
                        id="eventTime"
                        value={formData.eventTime}
                        onChange={(e) => updateField("eventTime", e.target.value)}
                    />
                </div>
            </div>

            {/* Venue section — shown for IN_PERSON and HYBRID */}
            {formData.format !== "VIRTUAL" && (
                <div className="border-t border-border my-6 pt-6 space-y-4">
                    <h3 className="font-medium text-foreground">Venue Information</h3>

                    <div className="space-y-2">
                        <Label htmlFor="venueName">Venue Name</Label>
                        <Input
                            id="venueName"
                            value={formData.venueName}
                            onChange={(e) => updateField("venueName", e.target.value)}
                            placeholder="e.g., Marriott Conference Center"
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="venueAddress">Street Address</Label>
                        <Input
                            id="venueAddress"
                            value={formData.venueAddress}
                            onChange={(e) => updateField("venueAddress", e.target.value)}
                            placeholder="123 Conference Way"
                        />
                    </div>

                    <div className="grid grid-cols-6 gap-4">
                        <div className="col-span-3 space-y-2">
                            <Label htmlFor="venueCity">City</Label>
                            <Input
                                id="venueCity"
                                value={formData.venueCity}
                                onChange={(e) => updateField("venueCity", e.target.value)}
                            />
                        </div>
                        <div className="col-span-1 space-y-2">
                            <Label htmlFor="venueState">State</Label>
                            <Input
                                id="venueState"
                                value={formData.venueState}
                                onChange={(e) => updateField("venueState", e.target.value)}
                                placeholder="TX"
                                maxLength={2}
                            />
                        </div>
                        <div className="col-span-2 space-y-2">
                            <Label htmlFor="venueZip">ZIP Code</Label>
                            <Input
                                id="venueZip"
                                value={formData.venueZip}
                                onChange={(e) => {
                                    const val = e.target.value.replace(/[^\d-]/g, "");
                                    updateField("venueZip", val);
                                }}
                                placeholder="12345"
                                maxLength={10}
                            />
                        </div>
                    </div>
                </div>
            )}

            {/* Virtual section — shown for VIRTUAL and HYBRID */}
            {formData.format !== "IN_PERSON" && (
                <div className="border-t border-border my-6 pt-6 space-y-4">
                    <h3 className="font-medium text-foreground">Virtual Details</h3>

                    <div className="space-y-2">
                        <Label htmlFor="virtualPlatform">Platform</Label>
                        <select
                            id="virtualPlatform"
                            value={formData.virtualPlatform}
                            onChange={(e) => updateField("virtualPlatform", e.target.value)}
                            className="w-full rounded-md border border-border px-3 py-2 text-sm focus:border-primary focus:ring-primary"
                        >
                            <option value="">Select a platform...</option>
                            <option value="zoom">Zoom</option>
                            <option value="teams">Microsoft Teams</option>
                            <option value="meet">Google Meet</option>
                            <option value="webex">Webex</option>
                            <option value="other">Other</option>
                        </select>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="virtualLink">Meeting Link</Label>
                        <Input
                            id="virtualLink"
                            type="url"
                            value={formData.virtualLink}
                            onChange={(e) => updateField("virtualLink", e.target.value)}
                            placeholder="https://zoom.us/j/..."
                        />
                        {virtualLinkInvalid && (
                            <p className="text-xs text-destructive">Please enter a valid URL (e.g., https://zoom.us/j/...)</p>
                        )}
                        <p className="text-xs text-muted-foreground">You can add this later if you don&apos;t have it yet.</p>
                    </div>
                </div>
            )}

            <div className="flex justify-between pt-6">
                <Button variant="outline" onClick={prevStep}>
                    ← Back
                </Button>
                <Button onClick={nextStep} disabled={!isValid}>
                    Next: Pricing & Review →
                </Button>
            </div>
        </div>
    );
}
