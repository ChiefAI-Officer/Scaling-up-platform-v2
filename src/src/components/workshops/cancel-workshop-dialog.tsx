"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";

interface CancelWorkshopDialogProps {
    workshopId: string;
    workshopTitle: string;
    eventDate: string;
}

const MINIMUM_LEAD_TIME_DAYS = 14;
const CANCELLATION_FEE_DOLLARS = 500;

export function CancelWorkshopDialog({
    workshopId,
    workshopTitle,
    eventDate,
}: CancelWorkshopDialogProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const router = useRouter();
    const { toast } = useToast();

    const now = new Date();
    const eventDateObj = new Date(eventDate);
    const daysUntilEvent = Math.floor(
        (eventDateObj.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    );
    const feeRequired = daysUntilEvent >= 0 && daysUntilEvent < MINIMUM_LEAD_TIME_DAYS;

    const handleCancel = async () => {
        setIsSubmitting(true);
        setError(null);

        try {
            const body: Record<string, unknown> = {};
            if (feeRequired) {
                body.acknowledgeFee = true;
            }

            const response = await fetch(`/api/workshops/${workshopId}`, {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || "Failed to cancel workshop");
            }

            toast({
                title: "Workshop Canceled",
                description: `"${workshopTitle}" has been canceled.`,
            });
            router.refresh();
            setIsOpen(false);
        } catch (err) {
            const message = err instanceof Error ? err.message : "Unexpected error";
            setError(message);
            toast({ title: "Cancellation Failed", description: message, variant: "destructive" });
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!isOpen) {
        return (
            <Button
                variant="outline"
                onClick={() => setIsOpen(true)}
                className="border-destructive/20 text-destructive hover:bg-destructive/10 hover:text-destructive"
            >
                Cancel Workshop
            </Button>
        );
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="w-full max-w-md rounded-xl bg-card p-6 shadow-xl">
                <h2 className="text-lg font-semibold text-foreground">Cancel Workshop</h2>
                <p className="mt-2 text-sm text-muted-foreground">
                    Are you sure you want to cancel <span className="font-medium">{workshopTitle}</span>?
                </p>

                <p className="mt-4 text-sm text-muted-foreground">
                    Cancellations may result in fees, please refer to{" "}
                    <a
                        href="/api/files/terms-and-conditions"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary underline hover:text-primary/80"
                    >
                        workshop terms and conditions
                    </a>.
                </p>

                <p className="mt-2 text-sm text-muted-foreground">
                    This action cannot be undone. Any registrants will need to be notified separately.
                </p>

                {error && (
                    <div className="mt-3 rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                        {error}
                    </div>
                )}

                <div className="mt-6 flex justify-end gap-3">
                    <Button
                        variant="outline"
                        onClick={() => {
                            setIsOpen(false);
                            setError(null);
                        }}
                        disabled={isSubmitting}
                    >
                        Keep Workshop
                    </Button>
                    <Button
                        onClick={handleCancel}
                        disabled={isSubmitting}
                        className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                    >
                        {isSubmitting
                            ? "Canceling..."
                            : feeRequired
                              ? `Cancel & Accept $${CANCELLATION_FEE_DOLLARS} Fee`
                              : "Cancel Workshop"}
                    </Button>
                </div>
            </div>
        </div>
    );
}
