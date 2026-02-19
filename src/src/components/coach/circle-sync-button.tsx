"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface CircleSyncButtonProps {
    coachId: string;
}

export function CircleSyncButton({ coachId }: CircleSyncButtonProps) {
    const [syncing, setSyncing] = useState(false);
    const [result, setResult] = useState<{ type: "success" | "error"; text: string } | null>(null);
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
                });
                router.refresh();
            } else {
                setResult({
                    type: "error",
                    text: data.error || "Failed to sync from Circle.",
                });
            }
        } catch {
            setResult({ type: "error", text: "Network error. Please try again." });
        } finally {
            setSyncing(false);
        }
    };

    return (
        <div className="space-y-2">
            <button
                onClick={handleSync}
                disabled={syncing}
                className="block w-full text-center bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
            >
                {syncing ? "Syncing..." : "Sync from Circle"}
            </button>
            {result && (
                <p className={`text-xs px-2 ${result.type === "success" ? "text-green-600" : "text-red-500"}`}>
                    {result.text}
                </p>
            )}
        </div>
    );
}
