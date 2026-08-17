"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface SendPasswordResetButtonProps {
  coachId: string;
  coachEmail: string;
  enhanced?: boolean;
}

export function SendPasswordResetButton({ coachId, coachEmail, enhanced = false }: SendPasswordResetButtonProps) {
  const [status, setStatus] = useState<"idle" | "loading" | "sent" | "error">("idle");
  const [open, setOpen] = useState(false);

  async function sendReset() {
    setStatus("loading");
    try {
      const res = await fetch(`/api/coaches/${coachId}/send-password-reset`, { method: "POST" });
      if (!res.ok) throw new Error("Failed");
      setStatus("sent");
      setOpen(false);
      setTimeout(() => setStatus("idle"), 4000);
    } catch {
      setStatus("error");
      setTimeout(() => setStatus("idle"), 4000);
    }
  }

  async function handleLegacySend() {
    if (!confirm(`Send a password reset email to ${coachEmail}?`)) return;
    await sendReset();
  }

  const label =
    status === "loading"
      ? "Sending…"
      : status === "sent"
        ? "Email Sent ✓"
        : status === "error"
          ? "Failed — Retry"
          : "Send Password Reset";

  if (enhanced) {
    return (
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="secondary" disabled={status === "loading"}>
            {label}
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send password reset?</DialogTitle>
            <DialogDescription>
              Send a secure password-reset link to {coachEmail}. The link expires
              in 15 minutes. Their current password remains active until they
              complete the reset.
            </DialogDescription>
          </DialogHeader>
          {status === "error" ? (
            <p role="alert" className="text-sm text-destructive">
              The reset email could not be sent. Please try again.
            </p>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button disabled={status === "loading"} onClick={sendReset}>
              {status === "loading" ? "Sending…" : "Send Reset Email"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <button
      onClick={handleLegacySend}
      disabled={status === "loading"}
      className="bg-muted text-foreground px-4 py-2 rounded-lg text-sm font-medium hover:bg-accent transition-colors disabled:opacity-50"
    >
      {label}
    </button>
  );
}
