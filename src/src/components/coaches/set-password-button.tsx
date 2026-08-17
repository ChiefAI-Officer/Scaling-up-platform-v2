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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface SetPasswordButtonProps {
  coachId: string;
  coachName: string;
  coachEmail: string;
}

type Stage = "form" | "confirm";
type SubmitState = "idle" | "saving" | "success" | "partial" | "error";

interface SetPasswordResponse {
  success?: boolean;
  passwordUpdated?: boolean;
  notificationSent?: boolean;
  warning?: string;
}

export function SetPasswordButton({
  coachId,
  coachName,
  coachEmail,
}: SetPasswordButtonProps) {
  const [open, setOpen] = useState(false);
  const [stage, setStage] = useState<Stage>("form");
  const [submitState, setSubmitState] = useState<SubmitState>("idle");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [message, setMessage] = useState("");

  function resetDialog() {
    setStage("form");
    setSubmitState("idle");
    setNewPassword("");
    setConfirmNewPassword("");
    setMessage("");
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen && submitState === "saving") return;
    setOpen(nextOpen);
    if (!nextOpen) resetDialog();
  }

  function continueToConfirmation() {
    setMessage("");
    if (!newPassword || !confirmNewPassword) {
      setMessage("Enter and confirm a new password.");
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setMessage("Passwords do not match.");
      return;
    }
    setStage("confirm");
  }

  async function submitPassword() {
    if (submitState === "saving") return;
    setSubmitState("saving");
    setMessage("");

    try {
      const response = await fetch(`/api/coaches/${coachId}/set-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newPassword, confirmNewPassword }),
      });
      const body = (await response.json()) as SetPasswordResponse;
      if (!response.ok || !body.success || !body.passwordUpdated) {
        throw new Error("Password update failed");
      }

      // Credentials must not remain in component state after the server commits.
      setNewPassword("");
      setConfirmNewPassword("");

      if (body.notificationSent) {
        setSubmitState("success");
        setMessage("Password set and coach notified.");
      } else {
        setSubmitState("partial");
        setMessage(
          body.warning ||
            "Password updated, but the coach notification could not be sent.",
        );
      }
    } catch {
      setSubmitState("error");
      setMessage("The password could not be set. Please try again.");
    }
  }

  async function retryNotification() {
    setSubmitState("saving");
    setMessage("");
    try {
      const response = await fetch(
        `/api/coaches/${coachId}/password-set-notification`,
        { method: "POST" },
      );
      if (!response.ok) throw new Error("Notification failed");
      const body = (await response.json()) as SetPasswordResponse;
      if (!body.success || !body.notificationSent) {
        throw new Error("Notification failed");
      }
      setSubmitState("success");
      setMessage("Coach notification sent.");
    } catch {
      setSubmitState("partial");
      setMessage("The coach notification still could not be sent. Please retry.");
    }
  }

  const completed = submitState === "success" || submitState === "partial";

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="secondary">Set Password</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Set password for {coachName}</DialogTitle>
          <DialogDescription>
            Set a new sign-in password for {coachEmail}.
          </DialogDescription>
        </DialogHeader>

        {stage === "form" && !completed ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="coach-new-password">New password</Label>
              <Input
                id="coach-new-password"
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="coach-confirm-password">Confirm new password</Label>
              <Input
                id="coach-confirm-password"
                type="password"
                autoComplete="new-password"
                value={confirmNewPassword}
                onChange={(event) => setConfirmNewPassword(event.target.value)}
              />
            </div>
            {message ? <p role="alert" className="text-sm text-destructive">{message}</p> : null}
            <DialogFooter>
              <Button variant="outline" onClick={() => handleOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={continueToConfirmation}>Continue</Button>
            </DialogFooter>
          </div>
        ) : null}

        {stage === "confirm" && !completed ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-warning/40 bg-warning/10 p-4 text-sm text-foreground space-y-2">
              <p>
                This immediately replaces {coachName}&apos;s current password and
                signs them out of active sessions.
              </p>
              <p>
                The coach will be emailed to contact an administrator for the new
                password. The password itself is never emailed.
              </p>
            </div>
            {message ? <p role="alert" className="text-sm text-destructive">{message}</p> : null}
            <DialogFooter>
              <Button
                variant="outline"
                disabled={submitState === "saving"}
                onClick={() => {
                  setSubmitState("idle");
                  setMessage("");
                  setStage("form");
                }}
              >
                Back
              </Button>
              <Button
                variant="destructive"
                disabled={submitState === "saving"}
                onClick={submitPassword}
              >
                {submitState === "saving"
                  ? "Setting Password…"
                  : "Set Password & Sign Out Coach"}
              </Button>
            </DialogFooter>
          </div>
        ) : null}

        {completed ? (
          <div className="space-y-4">
            <p
              role={submitState === "partial" ? "alert" : "status"}
              className={
                submitState === "partial"
                  ? "text-sm text-warning"
                  : "text-sm text-success"
              }
            >
              {message}
            </p>
            <DialogFooter>
              {submitState === "partial" ? (
                <Button onClick={retryNotification}>Retry Notification</Button>
              ) : null}
              <Button variant="outline" onClick={() => handleOpenChange(false)}>
                Close
              </Button>
            </DialogFooter>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
