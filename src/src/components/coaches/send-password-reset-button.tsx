"use client";

import { useState } from "react";

interface SendPasswordResetButtonProps {
  coachId: string;
  coachEmail: string;
}

export function SendPasswordResetButton({ coachId, coachEmail }: SendPasswordResetButtonProps) {
  const [status, setStatus] = useState<"idle" | "loading" | "sent" | "error">("idle");

  async function handleSend() {
    if (!confirm(`Send a password reset email to ${coachEmail}?`)) return;
    setStatus("loading");
    try {
      const res = await fetch(`/api/coaches/${coachId}/send-password-reset`, { method: "POST" });
      if (!res.ok) throw new Error("Failed");
      setStatus("sent");
      setTimeout(() => setStatus("idle"), 4000);
    } catch {
      setStatus("error");
      setTimeout(() => setStatus("idle"), 4000);
    }
  }

  return (
    <button
      onClick={handleSend}
      disabled={status === "loading"}
      className="bg-muted text-foreground px-4 py-2 rounded-lg text-sm font-medium hover:bg-accent transition-colors disabled:opacity-50"
    >
      {status === "loading" && "Sending…"}
      {status === "sent" && "Email Sent ✓"}
      {status === "error" && "Failed — Retry"}
      {status === "idle" && "Send Password Reset"}
    </button>
  );
}
