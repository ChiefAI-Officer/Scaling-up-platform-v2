"use client";

import { forwardRef, useState, type ButtonHTMLAttributes } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  workflowId: string;
  workflowName: string;
  assignmentCount: number;
}

export const DeleteWorkflowButton = forwardRef<HTMLButtonElement, Props>(function DeleteWorkflowButton(
  { workflowId, workflowName, assignmentCount, className, disabled, onClick, ...buttonProps },
  ref,
) {
  const [deleting, setDeleting] = useState(false);
  const router = useRouter();

  async function handleDelete() {
    const warning = assignmentCount > 0
      ? `"${workflowName}" is assigned to ${assignmentCount} workshop(s). Deleting it will remove those assignments. Continue?`
      : `Delete workflow "${workflowName}"? This cannot be undone.`;
    if (!confirm(warning)) return;

    setDeleting(true);
    try {
      const res = await fetch(`/api/workflows/${workflowId}`, { method: "DELETE" });
      if (res.ok) {
        router.refresh();
      } else {
        const json = await res.json();
        alert(json.error || "Delete failed");
      }
    } catch {
      alert("Delete failed");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <button
      {...buttonProps}
      ref={ref}
      type="button"
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) void handleDelete();
      }}
      disabled={deleting || disabled}
      className={cn("text-sm font-medium text-destructive hover:text-destructive/80 disabled:opacity-50", className)}
    >
      {deleting ? "Deleting…" : "Delete"}
    </button>
  );
});
