"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  workflowId: string;
  workflowName: string;
  assignmentCount: number;
}

export function DeleteWorkflowButton({ workflowId, workflowName, assignmentCount }: Props) {
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
      onClick={handleDelete}
      disabled={deleting}
      className="text-sm font-medium text-destructive hover:text-destructive/80 disabled:opacity-50"
    >
      {deleting ? "Deleting…" : "Delete"}
    </button>
  );
}
