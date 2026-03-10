"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ConfirmationModal } from "@/components/ui/confirmation-modal";
import { useToast } from "@/components/ui/use-toast";
import { Trash2 } from "lucide-react";

interface DeleteCoachButtonProps {
  coachId: string;
  coachName: string;
  hasActiveWorkshops: boolean;
}

export function DeleteCoachButton({
  coachId,
  coachName,
  hasActiveWorkshops,
}: DeleteCoachButtonProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  async function handleDelete() {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/coaches/${coachId}`, { method: "DELETE" });
      const data = await res.json();

      if (!res.ok) {
        toast({
          title: "Delete failed",
          description: data.error || "Failed to delete coach",
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Coach deleted",
        description: `${coachName} has been permanently deleted.`,
      });
      router.push("/coaches");
      router.refresh();
    } catch {
      toast({
        title: "Delete failed",
        description: "Network error. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
      setIsOpen(false);
    }
  }

  return (
    <>
      <Button
        variant="destructive"
        size="sm"
        onClick={() => setIsOpen(true)}
        disabled={hasActiveWorkshops}
        title={
          hasActiveWorkshops
            ? "Cannot delete coach with active workshops"
            : "Permanently delete this coach"
        }
      >
        <Trash2 className="w-4 h-4 mr-1" />
        Delete Coach
      </Button>

      <ConfirmationModal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        onConfirm={handleDelete}
        title="Delete Coach"
        description={`This will permanently delete ${coachName}'s profile, all their completed/canceled workshops, registrations, approval queue entries, follow-up reports, and their login account.`}
        warningText="This action cannot be undone."
        confirmLabel="Delete Coach"
        variant="destructive"
        isLoading={isLoading}
      />
    </>
  );
}
