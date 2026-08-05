"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface CircleSyncButtonProps {
    coachId: string;
}

interface SyncWarning {
    code: string;
    field: string;
    message: string;
}

interface SyncResultState {
    type: "success" | "error";
    text: string;
    warnings: SyncWarning[];
}

export function CircleSyncButton({ coachId }: CircleSyncButtonProps) {
    const [syncing, setSyncing] = useState(false);
    const [result, setResult] = useState<SyncResultState | null>(null);
    const router = useRouter();

    const handleSync = async () => {
        setSyncing(true);
        setResult(null);

        try {
            const res = await fetch(`/api/coaches/${coachId}/circle-import`, {
                method: "POST",
            });

            const data = await res.json();

            if (res.ok && data.success) {
                setResult({
                    type: "success",
                    text: data.message || "Synced from Circle.",
                    warnings: Array.isArray(data.warnings) ? data.warnings : [],
                });
                router.refresh();
            } else {
                setResult({
                    type: "error",
                    text: data.error || "Failed to sync from Circle.",
                    warnings: [],
                });
            }
        } catch {
            setResult({
                type: "error",
                text: "Network error. Please try again.",
                warnings: [],
            });
        } finally {
            setSyncing(false);
        }
    };

    return (
        <div className="space-y-2">
            <button
                onClick={handleSync}
                disabled={syncing}
                className="block w-full text-center bg-primary text-primary-foreground px-4 py-2 rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
            >
                {syncing ? "Syncing..." : "Sync from Circle"}
            </button>
            {result && (
                <p className={`text-xs px-2 ${result.type === "success" ? "text-success" : "text-destructive"}`}>
                    {result.text}
                </p>
            )}
            {result?.type === "success" && result.warnings.length > 0 && (
                <div
                    role="status"
                    className="rounded-md border border-warning/20 bg-warning/10 px-3 py-2 text-xs text-warning-foreground"
                >
                    <ul className="space-y-1">
                        {result.warnings.map((warning, index) => (
                            <li key={`${warning.code}-${warning.field}-${index}`}>
                                {warning.message}
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
}
