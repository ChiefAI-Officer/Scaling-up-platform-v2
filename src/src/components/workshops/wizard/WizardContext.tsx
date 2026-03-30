"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/use-toast";

// --- Types ---

export interface WorkshopFormData {
    // Step 1: Details
    workshopTypeId: string;
    categoryId: string;
    title: string;
    description: string;
    useCoachPhoto: boolean;

    // Step 2: Logistics
    format: "IN_PERSON" | "VIRTUAL" | "HYBRID";
    eventDate: string;
    eventTime: string;
    timezone: string;
    venueName: string;
    venueAddress: string;
    venueCity: string;
    venueState: string;
    venueZip: string;
    virtualPlatform: string;
    virtualLink: string;

    // Step 3: Pricing & Terms
    pricingTierId: string;
    customPricing: boolean;
    customPrice?: number;
    termsAccepted: boolean;
}

interface WizardContextType {
    currentStep: number;
    totalSteps: number;
    formData: WorkshopFormData;
    updateField: <K extends keyof WorkshopFormData>(field: K, value: WorkshopFormData[K]) => void;
    nextStep: () => void;
    prevStep: () => void;
    isSaving: boolean;
    lastSavedAt: Date | null;
    submitWorkshop: () => Promise<void>;
    isLoading: boolean;
}

const WizardContext = createContext<WizardContextType | undefined>(undefined);

// --- Default State ---

const defaultFormData: WorkshopFormData = {
    workshopTypeId: "",
    categoryId: "",
    title: "",
    description: "",
    useCoachPhoto: true,
    format: "IN_PERSON",
    eventDate: "",
    eventTime: "09:00",
    timezone: "America/New_York",
    venueName: "",
    venueAddress: "",
    venueCity: "",
    venueState: "",
    venueZip: "",
    virtualPlatform: "",
    virtualLink: "",
    pricingTierId: "",
    customPricing: false,
    termsAccepted: false,
};

// --- Provider Component ---

export function WizardProvider({ children }: { children: React.ReactNode }) {
    const [formData, setFormData] = useState<WorkshopFormData>(defaultFormData);
    const [currentStep, setCurrentStep] = useState(1);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);

    const router = useRouter();
    const { toast } = useToast();
    const totalSteps = 3;

    // Load draft on mount
    useEffect(() => {
        async function loadDraft() {
            try {
                const response = await fetch("/api/workshop-drafts");
                if (response.ok) {
                    const draft = await response.json();
                    if (draft && draft.stepsData) {
                        const parsedData = JSON.parse(draft.stepsData);
                        // Merge valid draft data
                        setFormData(prev => ({ ...prev, ...parsedData }));
                        setCurrentStep(draft.currentStep || 1);
                        setLastSavedAt(new Date(draft.updatedAt));
                    }
                }
            } catch (error) {
                console.error("Failed to load draft", error);
            } finally {
                setIsLoading(false);
            }
        }
        loadDraft();
    }, []);

    // Auto-save effect (Debounced)
    useEffect(() => {
        if (isLoading) return; // Don't save while loading initial state

        const timer = setTimeout(async () => {
            setIsSaving(true);
            try {
                await fetch("/api/workshop-drafts", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        step: currentStep,
                        data: formData,
                    }),
                });
                setLastSavedAt(new Date());
            } catch (error) {
                console.error("Auto-save failed", error);
            } finally {
                setIsSaving(false);
            }
        }, 2000); // 2 second debounce

        return () => clearTimeout(timer);
    }, [formData, currentStep, isLoading]);

    const updateField = <K extends keyof WorkshopFormData>(field: K, value: WorkshopFormData[K]) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    const nextStep = () => {
        if (currentStep < totalSteps) {
            setCurrentStep(prev => prev + 1);
            window.scrollTo(0, 0);
        }
    };

    const prevStep = () => {
        if (currentStep > 1) {
            setCurrentStep(prev => prev - 1);
            window.scrollTo(0, 0);
        }
    };

    const submitWorkshop = async () => {
        try {
            const response = await fetch("/api/approvals", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    type: formData.customPricing ? "CUSTOM_PRICING" : "WORKSHOP_REQUEST",
                    workshopTypeSlug: formData.workshopTypeId,
                    details: `Workshop: ${formData.title} on ${formData.eventDate}`,
                    ...formData,
                    termsAcceptedAt: formData.termsAccepted ? new Date().toISOString() : null,
                }),
            });

            const data = await response.json();

            if (!response.ok) throw new Error(data.error || "Submission failed");

            toast({
                title: "Workshop Submitted!",
                description: data.autoApproved
                    ? "Your workshop has been approved and is now visible in your workshops."
                    : "Your request has been submitted for review. You can track it in your workshops.",
                variant: "default",
            });

            // Navigate to the created workshop if available, otherwise to workshops list
            if (data.workshopId) {
                router.push(`/portal/workshops/${data.workshopId}`);
            } else {
                router.push("/portal/workshops");
            }

        } catch (error) {
            toast({
                title: "Submission Failed",
                description: error instanceof Error ? error.message : "Please check your inputs and try again.",
                variant: "destructive",
            });
        }
    };

    return (
        <WizardContext.Provider
            value={{
                currentStep,
                totalSteps,
                formData,
                updateField,
                nextStep,
                prevStep,
                isSaving,
                lastSavedAt,
                submitWorkshop,
                isLoading,
            }}
        >
            {children}
        </WizardContext.Provider>
    );
}

export function useWizard() {
    const context = useContext(WizardContext);
    if (context === undefined) {
        throw new Error("useWizard must be used within a WizardProvider");
    }
    return context;
}
