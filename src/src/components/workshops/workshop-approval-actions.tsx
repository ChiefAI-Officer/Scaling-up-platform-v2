"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";

interface WorkshopApprovalActionsProps {
    approvalId: string;
    workshopTitle: string;
}

export function WorkshopApprovalActions({ approvalId, workshopTitle }: WorkshopApprovalActionsProps) {
    const [status, setStatus] = useState<"idle" | "loading" | "done">("idle");
    const [result, setResult] = useState<string | null>(null);
    const { toast } = useToast();

    async function handleAction(action: "APPROVE" | "DENY") {
        if (status === "loading") return;

        const confirmMsg = action === "APPROVE"
            ? `Approve "${workshopTitle}"?`
            : `Deny "${workshopTitle}"? This cannot be undone.`;

        if (!confirm(confirmMsg)) return;

        setStatus("loading");
        try {
            const res = await fetch(`/api/approvals/${approvalId}/respond`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action }),
            });

            const data = await res.json();

            if (!res.ok) throw new Error(data.error || "Request failed");

            setResult(action === "APPROVE" ? "Approved" : "Denied");
            setStatus("done");

            toast({
                title: action === "APPROVE" ? "Workshop Approved" : "Workshop Denied",
                description: `"${workshopTitle}" has been ${action === "APPROVE" ? "approved" : "denied"}.`,
            });

            // Refresh the page after a short delay so the status badge updates
            setTimeout(() => window.location.reload(), 1500);
        } catch (err) {
            const message = err instanceof Error ? err.message : "Error";
            setResult(message);
            setStatus("idle");
            toast({ title: "Action Failed", description: message, variant: "destructive" });
        }
    }

    if (status === "done") {
        return (
            <span className={`text-xs font-medium ${result === "Approved" ? "text-success" : "text-destructive"}`}>
                {result}
            </span>
        );
    }

    return (
        <div className="flex gap-1">
            <Button
                size="sm"
                variant="outline"
                className="h-7 px-2 text-xs text-success border-success/20 hover:bg-success/10"
                onClick={() => handleAction("APPROVE")}
                disabled={status === "loading"}
            >
                {status === "loading" ? "..." : "Approve"}
            </Button>
            <Button
                size="sm"
                variant="outline"
                className="h-7 px-2 text-xs text-destructive border-destructive/20 hover:bg-destructive/10"
                onClick={() => handleAction("DENY")}
                disabled={status === "loading"}
            >
                Deny
            </Button>
        </div>
    );
}
