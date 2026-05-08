"use client";

/**
 * ENH-MAY6-2: Admin Notes textarea for the workshop detail page.
 *
 * Persists to PATCH /api/workshops/[id]/admin-notes (admin/staff only).
 * Mounted inside the (dashboard) layout, which is already non-COACH gated,
 * so this component does no client-side role check — the API enforces it.
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";

interface Props {
  workshopId: string;
  initialBody: string;
}

export function AdminNotesEditor({ workshopId, initialBody }: Props) {
  const [body, setBody] = useState(initialBody);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const handleSave = async () => {
    setSaving(true);
    setMessage("");
    try {
      const res = await fetch(`/api/workshops/${workshopId}/admin-notes`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setMessage(
          typeof data?.error === "string"
            ? `Error: ${data.error}`
            : `Error: ${res.status}`
        );
      } else {
        setMessage("Saved");
      }
    } catch {
      setMessage("Network error — please try again");
    }
    setSaving(false);
  };

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        Admin/staff only. Not visible to the coach.
      </p>
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={6}
        maxLength={5000}
        placeholder="Internal notes about this workshop…"
        className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background"
      />
      <div className="flex items-center gap-3">
        <Button onClick={handleSave} disabled={saving} size="sm">
          {saving ? "Saving…" : "Save Notes"}
        </Button>
        {message && (
          <p
            className={`text-sm ${
              message.startsWith("Error") || message.startsWith("Network")
                ? "text-destructive"
                : "text-success"
            }`}
          >
            {message}
          </p>
        )}
      </div>
    </div>
  );
}
