"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";

interface TriggerNowButtonProps {
    stepId: string;
    workshopId: string;
}

export function TriggerNowButton({ stepId, workshopId }: TriggerNowButtonProps) {
    const [loading, setLoading] = useState(false);
    const { toast } = useToast();

    async function handleTrigger() {
        setLoading(true);
        try {
            const res = await fetch(`/api/workflow-steps/${stepId}/trigger-now`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ workshopId }),
            });

            if (res.ok) {
                interface TriggerNowResponse {
                    success: boolean;
                    previousFailure: { errorMessage: string | null } | null;
                }
                const data = await res.json() as TriggerNowResponse;
                if (data.previousFailure?.errorMessage) {
                    toast({
                        title: "Step triggered",
                        description: `Note: last attempt failed — ${data.previousFailure.errorMessage ?? "unknown error"}. If this persists, check SMTP credentials in Vercel.`,
                    });
                } else {
                    toast({
                        title: "Step triggered",
                        description: "Email queued. If nothing arrives in 5 minutes, check SMTP credentials in Vercel Environment Variables (SMTP_HOST, SMTP_USER, SMTP_PASSWORD).",
                    });
                }
            } else if (res.status === 409) {
                const data = await res.json().catch(() => ({}));
                toast({
                    title: "Cannot trigger step",
                    description: (data as { error?: string }).error ?? "This step has already been executed or is in progress.",
                });
            } else {
                const data = await res.json().catch(() => ({}));
                toast({
                    title: "Trigger failed",
                    description: (data as { error?: string }).error ?? "Unknown error",
                    variant: "destructive",
                });
            }
        } catch {
            toast({
                title: "Trigger failed",
                description: "Network error. Please try again.",
                variant: "destructive",
            });
        } finally {
            setLoading(false);
        }
    }

    return (
        <Button
            variant="outline"
            size="sm"
            onClick={handleTrigger}
            disabled={loading}
            className="text-xs h-6 px-2 whitespace-nowrap"
        >
            {loading ? "Triggering…" : "Trigger Now"}
        </Button>
    );
}
