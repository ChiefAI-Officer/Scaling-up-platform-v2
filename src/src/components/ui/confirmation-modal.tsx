"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle, X } from "lucide-react";

interface ConfirmationModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    title: string;
    description: string;
    warningText?: string;
    confirmLabel?: string;
    cancelLabel?: string;
    variant?: "default" | "destructive";
    isLoading?: boolean;
}

export function ConfirmationModal({
    isOpen,
    onClose,
    onConfirm,
    title,
    description,
    warningText,
    confirmLabel = "Confirm",
    cancelLabel = "Cancel",
    variant = "default",
    isLoading = false,
}: ConfirmationModalProps) {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                onClick={onClose}
            />

            {/* Modal */}
            <div className="relative bg-white rounded-lg shadow-xl max-w-md w-full mx-4 animate-in fade-in zoom-in-95 duration-200">
                {/* Close button */}
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors"
                >
                    <X className="w-5 h-5" />
                </button>

                <div className="p-6">
                    {/* Icon & Title */}
                    <div className="flex items-start gap-4">
                        {variant === "destructive" && (
                            <div className="flex-shrink-0 w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                                <AlertTriangle className="w-5 h-5 text-red-600" />
                            </div>
                        )}
                        <div className="flex-1">
                            <h3 className="text-lg font-semibold text-gray-900">
                                {title}
                            </h3>
                            <p className="mt-2 text-sm text-gray-600">
                                {description}
                            </p>
                        </div>
                    </div>

                    {/* Warning Box */}
                    {warningText && (
                        <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                            <p className="text-sm text-amber-800">
                                <span className="font-semibold">⚠️ Warning:</span>{" "}
                                {warningText}
                            </p>
                        </div>
                    )}

                    {/* Actions */}
                    <div className="mt-6 flex justify-end gap-3">
                        <Button
                            variant="outline"
                            onClick={onClose}
                            disabled={isLoading}
                        >
                            {cancelLabel}
                        </Button>
                        <Button
                            variant={variant === "destructive" ? "destructive" : "default"}
                            onClick={onConfirm}
                            disabled={isLoading}
                            className={variant === "destructive" ? "bg-red-600 hover:bg-red-700" : ""}
                        >
                            {isLoading ? "Processing..." : confirmLabel}
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}

// Pre-configured modal variants for common actions
export const CONFIRMATION_PRESETS = {
    deleteWorkshop: {
        title: "Delete Workshop",
        description: "Are you sure you want to delete this workshop?",
        warningText: "This cannot be undone. All registrations and landing pages will be permanently removed.",
        confirmLabel: "Delete Workshop",
        variant: "destructive" as const,
    },
    cancelWorkshop: {
        title: "Cancel Workshop",
        description: "Are you sure you want to cancel this workshop?",
        warningText: "A $500 cancellation fee applies. All registrants will be notified of the cancellation.",
        confirmLabel: "Cancel Workshop",
        variant: "destructive" as const,
    },
    changeDate: {
        title: "Change Workshop Date",
        description: "Changing the date of an upcoming workshop may affect registrants.",
        warningText: "A $500 date change fee may apply. All registrants will be notified of the new date.",
        confirmLabel: "Change Date",
        variant: "default" as const,
    },
    unlockWorkshop: {
        title: "Unlock Workshop",
        description: "This will allow the coach to make edits to this workshop.",
        confirmLabel: "Unlock",
        variant: "default" as const,
    },
};
