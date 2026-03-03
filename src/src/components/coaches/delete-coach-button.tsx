"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ConfirmationModal } from "@/components/ui/confirmation-modal";
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
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  async function handleDelete() {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/coaches/${coachId}`, { method: "DELETE" });
      const data = await res.json();

      if (!res.ok) {
        alert(data.error || "Failed to delete coach");
        return;
      }

      router.push("/coaches");
      router.refresh();
    } catch {
      alert("Failed to delete coach");
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
        description={`This will permanently delete ${coachName}'s profile, all their completed/canceled workshops, registrations, and their login account.`}
        warningText="This action cannot be undone."
        confirmLabel="Delete Coach"
        variant="destructive"
        isLoading={isLoading}
      />
    </>
  );
}
