"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface RegistrationRemoveButtonProps {
  registrationId: string;
  firstName: string;
  lastName: string;
  email: string;
}

export function RegistrationRemoveButton({
  registrationId,
  firstName,
  lastName,
  email,
}: RegistrationRemoveButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleRemove = async () => {
    const confirmed = window.confirm(
      `Remove ${firstName} ${lastName} (${email})?\n\nYou will need to process any refund manually in Stripe.`
    );
    if (!confirmed) return;

    setLoading(true);
    try {
      const res = await fetch(`/api/registrations/${registrationId}?skipRefund=true`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert((data as { error?: string }).error || "Failed to remove registration");
        return;
      }
      router.refresh();
    } catch {
      alert("Failed to remove registration. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleRemove}
      disabled={loading}
      className="px-3 py-1 text-xs font-medium rounded-md cursor-pointer transition-colors duration-150 bg-destructive/10 text-destructive hover:bg-destructive/20 disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {loading ? "..." : "Remove"}
    </button>
  );
}
