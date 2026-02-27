"use client";

import { useState } from "react";

interface ActiveTemplateToggleProps {
    pageId: string;
    isActive: boolean;
}

export function ActiveTemplateToggle({ pageId, isActive }: ActiveTemplateToggleProps) {
    const [active, setActive] = useState(isActive);
    const [loading, setLoading] = useState(false);

    const handleToggle = async () => {
        setLoading(true);
        try {
            const res = await fetch(`/api/landing-pages/${pageId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ isActiveTemplate: !active }),
            });
            if (!res.ok) throw new Error("Failed to update");
            setActive(!active);
        } catch {
            alert("Failed to update template status");
        } finally {
            setLoading(false);
        }
    };

    return (
        <button
            onClick={handleToggle}
            disabled={loading}
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                active
                    ? "bg-green-100 text-green-800 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-400"
                    : "bg-muted text-muted-foreground hover:bg-accent"
            }`}
            title={active ? "Click to unmark as template" : "Click to mark as active template for auto-build"}
        >
            <span className={`inline-block h-2 w-2 rounded-full ${active ? "bg-green-500" : "bg-gray-400"}`} />
            {loading ? "..." : active ? "Active Template" : "Set as Template"}
        </button>
    );
}
