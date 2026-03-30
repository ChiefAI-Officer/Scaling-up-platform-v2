"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ConfirmationModal } from "@/components/ui/confirmation-modal";
import { useToast } from "@/components/ui/use-toast";

interface Props {
  templateId: string;
  templateName: string;
  isActive: boolean;
}

export function DeletePageTemplateButton({ templateId, templateName, isActive }: Props) {
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  async function handleDelete() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/page-templates/${templateId}`, { method: "DELETE" });
      const json = await res.json();
      if (res.ok && json.success) {
        setOpen(false);
        router.refresh();
        toast({ title: "Template deleted", description: json.message || "Template deleted." });
      } else {
        toast({
          title: "Delete failed",
          description: (json as { error?: string }).error || "Delete failed — please try again.",
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
        disabled={deleting || isActive}
        title={isActive ? "Deactivate this template before deleting" : "Delete template"}
        className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3.5 py-2 text-sm font-medium text-muted-foreground hover:text-destructive hover:border-destructive/50 hover:bg-destructive/5 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
      >
        Delete
      </button>
      <ConfirmationModal
        isOpen={open}
        onClose={() => setOpen(false)}
        onConfirm={handleDelete}
        title="Delete template"
        description={`Delete "${templateName}"?`}
        warningText="This cannot be undone. Workshop pages previously generated from this template are not affected."
        confirmLabel="Delete Template"
        variant="destructive"
        isLoading={deleting}
      />
    </>
  );
}
