"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ConfirmationModal } from "@/components/ui/confirmation-modal";
import { useToast } from "@/components/ui/use-toast";

interface Props {
  pageId: string;
  templateLabel: string;
}

export function DeleteLandingPageButton({ pageId, templateLabel }: Props) {
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  async function handleDelete() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/landing-pages/${pageId}`, { method: "DELETE" });
      const json = await res.json();
      if (res.ok && json.success) {
        // Modal intentionally stays open on error so the user can retry with context
        setOpen(false);
        router.refresh();
      } else {
        toast({
          title: "Delete failed",
          description: json.error || "Delete failed — please try again.",
          variant: "destructive",
        });
      }
    } catch {
      toast({
        title: "Delete failed",
        description: "Network error — please try again.",
        variant: "destructive",
      });
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        disabled={deleting}
        className="rounded-md border border-destructive/50 px-3 py-1.5 text-sm font-medium text-destructive hover:bg-destructive/10 disabled:opacity-50"
      >
        Delete
      </button>
      <ConfirmationModal
        isOpen={open}
        onClose={() => setOpen(false)}
        onConfirm={handleDelete}
        title={`Delete master template`}
        description={`Remove "${templateLabel}" as the active master template?`}
        warningText="This cannot be undone. Auto-build will fall back to the global template or skip this template type until a new one is promoted."
        confirmLabel="Delete Template"
        variant="destructive"
        isLoading={deleting}
      />
    </>
  );
}
