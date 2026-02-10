"use client";

import React from "react";
import { useWizard } from "./WizardContext";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function Step2Logistics() {
    const { formData, updateField, nextStep, prevStep } = useWizard();

    const isValid =
        formData.eventDate &&
        formData.eventTime &&
        formData.venueName &&
        formData.venueAddress &&
        formData.venueCity &&
        formData.venueState &&
        formData.venueZip;

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
            <div className="space-y-4">
                <h2 className="text-xl font-semibold text-gray-900">Event Logistics</h2>
                <p className="text-gray-500">
                    Where and when will this workshop take place?
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                    <Label htmlFor="eventDate">Event Date</Label>
                    <Input
                        type="date"
                        id="eventDate"
                        value={formData.eventDate}
                        onChange={(e) => updateField("eventDate", e.target.value)}
                    />
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

            <div className="border-t border-gray-100 my-6 pt-6 space-y-4">
                <h3 className="font-medium text-gray-900">Venue Information</h3>

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
                            onChange={(e) => updateField("venueZip", e.target.value)}
                        />
                    </div>
                </div>
            </div>

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
