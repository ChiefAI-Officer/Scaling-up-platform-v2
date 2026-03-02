"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";

interface RemoveCertificationButtonProps {
    coachId: string;
    certificationId: string;
    workshopTypeName: string;
}

export function RemoveCertificationButton({ coachId, certificationId, workshopTypeName }: RemoveCertificationButtonProps) {
    const router = useRouter();
    const [loading, setLoading] = useState(false);

    async function handleRemove() {
        if (!confirm(`Remove "${workshopTypeName}" certification from this coach?`)) return;

        setLoading(true);
        try {
            const res = await fetch(
                `/api/coaches/${coachId}/certifications?certificationId=${certificationId}`,
                { method: "DELETE" }
            );
            if (res.ok) {
                router.refresh();
            } else {
                alert("Failed to remove certification");
            }
        } catch {
            alert("Network error — please try again");
        } finally {
            setLoading(false);
        }
    }

    return (
        <button
            onClick={handleRemove}
            disabled={loading}
            className="rounded-full p-1 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer"
            title="Remove certification"
        >
            <X className="w-3.5 h-3.5" />
        </button>
    );
}
