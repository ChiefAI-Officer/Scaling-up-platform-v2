"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { Trash2 } from "lucide-react";

interface DeleteWorkshopDialogProps {
  workshopId: string;
  workshopTitle: string;
}

export function DeleteWorkshopDialog({
  workshopId,
  workshopTitle,
}: DeleteWorkshopDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const { toast } = useToast();

  const titleMatches = confirmText === workshopTitle;

  const handleDelete = async () => {
    if (!titleMatches) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch(`/api/workshops/${workshopId}/delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmTitle: confirmText }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to delete workshop");
      }

      toast({
        title: "Workshop Deleted",
        description: `"${workshopTitle}" has been permanently deleted.`,
      });
      router.push("/workshops");
      router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unexpected error";
      setError(message);
      toast({
        title: "Deletion Failed",
        description: message,
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) {
    return (
      <Button
        variant="outline"
        onClick={() => setIsOpen(true)}
        className="border-destructive/20 text-destructive hover:bg-destructive/10 hover:text-destructive"
      >
        <Trash2 className="w-4 h-4 mr-1" />
        Delete Permanently
      </Button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-xl bg-card p-6 shadow-xl">
        <h2 className="text-lg font-semibold text-destructive">
          Permanently Delete Workshop
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          This will permanently remove{" "}
          <span className="font-medium text-foreground">
            {workshopTitle}
          </span>{" "}
          and all associated data:
        </p>

        <ul className="mt-3 text-sm text-muted-foreground list-disc pl-5 space-y-1">
          <li>All registrations (including paid registration records)</li>
          <li>All landing pages</li>
          <li>All surveys and responses</li>
          <li>All workflow assignments and execution logs</li>
          <li>All approval queue entries for this workshop</li>
          <li>All follow-up reports</li>
          <li>File links (uploaded files remain in Blob storage)</li>
        </ul>

        <div className="mt-4 rounded-lg border border-destructive/20 bg-destructive/10 p-4">
          <p className="text-sm font-medium text-destructive">
            This action cannot be undone.
          </p>
        </div>

        <div className="mt-4">
          <label
            htmlFor="confirm-title"
            className="block text-sm font-medium text-foreground mb-1"
          >
            Type the workshop title to confirm:
          </label>
          <input
            id="confirm-title"
            type="text"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder={workshopTitle}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-destructive/50"
          />
        </div>

        {error && (
          <div className="mt-3 rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="mt-6 flex justify-end gap-3">
          <Button
            variant="outline"
            onClick={() => {
              setIsOpen(false);
              setConfirmText("");
              setError(null);
            }}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            onClick={handleDelete}
            disabled={isSubmitting || !titleMatches}
            className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
          >
            {isSubmitting ? "Deleting..." : "Delete Permanently"}
          </Button>
        </div>
      </div>
    </div>
  );
}
