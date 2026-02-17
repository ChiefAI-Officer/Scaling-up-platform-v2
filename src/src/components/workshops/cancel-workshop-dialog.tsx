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
                className="border-red-300 text-red-600 hover:bg-red-50 hover:text-red-700"
            >
                Cancel Workshop
            </Button>
        );
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
                <h2 className="text-lg font-semibold text-gray-900">Cancel Workshop</h2>
                <p className="mt-2 text-sm text-gray-600">
                    Are you sure you want to cancel <span className="font-medium">{workshopTitle}</span>?
                </p>

                {feeRequired && (
                    <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
                        <p className="text-sm font-medium text-amber-800">
                            Cancellation Fee: ${CANCELLATION_FEE_DOLLARS}
                        </p>
                        <p className="mt-1 text-sm text-amber-700">
                            This workshop is within {MINIMUM_LEAD_TIME_DAYS} days of the event date
                            ({daysUntilEvent} days remaining). A ${CANCELLATION_FEE_DOLLARS} cancellation
                            fee will be billed to your account.
                        </p>
                    </div>
                )}

                {!feeRequired && daysUntilEvent >= 0 && (
                    <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-4">
                        <p className="text-sm text-blue-700">
                            No cancellation fee applies. The event is {daysUntilEvent} days away
                            (more than {MINIMUM_LEAD_TIME_DAYS} days).
                        </p>
                    </div>
                )}

                <p className="mt-4 text-sm text-gray-500">
                    This action cannot be undone. Any registrants will need to be notified separately.
                </p>

                {error && (
                    <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
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
                        className="bg-red-600 hover:bg-red-700 text-white"
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
