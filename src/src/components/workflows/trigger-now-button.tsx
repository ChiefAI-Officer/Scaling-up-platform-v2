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
                const data = await res.json().catch(() => ({}));
                const failure = (data as { previousFailure?: { executedAt?: string } | null }).previousFailure;
                toast({
                    title: "Step triggered",
                    description: failure
                        ? `The workflow step will execute shortly. Note: a previous attempt failed${failure.executedAt ? ` on ${new Date(failure.executedAt).toLocaleString()}` : ""}.`
                        : "The workflow step will execute shortly.",
                });
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
