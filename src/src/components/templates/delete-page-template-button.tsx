"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ConfirmationModal } from "@/components/ui/confirmation-modal";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { ResponsiveActionsItem } from "@/components/ui/responsive-actions-menu";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface Props {
  templateId: string;
  templateName: string;
  isActive: boolean;
  menuItem?: boolean;
  responsiveEnabled?: boolean;
}

export function DeletePageTemplateButton({ templateId, templateName, isActive, menuItem = false, responsiveEnabled = false }: Props) {
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

  if (menuItem) {
    return (
      <>
        <ResponsiveActionsItem
          disabled={deleting || isActive}
          onSelect={(event) => {
            event.preventDefault();
            setOpen(true);
          }}
          className="flex min-h-11 cursor-pointer items-center rounded-md px-3 text-sm text-destructive outline-none focus:bg-accent disabled:pointer-events-none disabled:opacity-50"
        >
          Delete template
        </ResponsiveActionsItem>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent responsiveEnabled>
            <DialogHeader>
              <DialogTitle>Delete template</DialogTitle>
              <DialogDescription>{`Delete "${templateName}"?`}</DialogDescription>
            </DialogHeader>
            <p className="rounded-lg border border-warning/20 bg-warning/10 p-3 text-sm text-warning-foreground">
              This cannot be undone. Workshop pages previously generated from this template are not affected.
            </p>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline" disabled={deleting} className="min-h-11">Cancel</Button>
              </DialogClose>
              <Button variant="destructive" onClick={handleDelete} disabled={deleting} className="min-h-11">
                {deleting ? "Processing..." : "Delete Template"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        disabled={deleting || isActive}
        title={isActive ? "Deactivate this template before deleting" : "Delete template"}
        className={responsiveEnabled ? "inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-border px-3.5 py-2 text-sm font-medium text-muted-foreground hover:text-destructive hover:border-destructive/50 hover:bg-destructive/5 disabled:opacity-40 disabled:cursor-not-allowed transition-all" : "inline-flex items-center gap-1.5 rounded-lg border border-border px-3.5 py-2 text-sm font-medium text-muted-foreground hover:text-destructive hover:border-destructive/50 hover:bg-destructive/5 disabled:opacity-40 disabled:cursor-not-allowed transition-all"}
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
