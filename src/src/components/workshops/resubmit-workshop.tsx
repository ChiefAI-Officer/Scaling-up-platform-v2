"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface ResubmitWorkshopProps {
  workshopId: string;
  rejectionReason: string | null;
  title: string;
  description: string | null;
  eventDate: string;
  eventTime: string | null;
  venueName: string | null;
}

export function ResubmitWorkshop({
  workshopId,
  rejectionReason,
  title: initialTitle,
  description: initialDescription,
  eventDate: initialEventDate,
  eventTime: initialEventTime,
  venueName: initialVenueName,
}: ResubmitWorkshopProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // Editable fields
  const [title, setTitle] = useState(initialTitle);
  const [description, setDescription] = useState(initialDescription || "");
  const [eventDate, setEventDate] = useState(initialEventDate.split("T")[0]);
  const [eventTime, setEventTime] = useState(initialEventTime || "");
  const [venueName, setVenueName] = useState(initialVenueName || "");

  async function handleSaveAndResubmit() {
    setSubmitting(true);
    setFeedback(null);

    try {
      // First, save any edits
      if (isEditing) {
        const updateRes = await fetch(`/api/workshops/${workshopId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title,
            description: description || null,
            eventDate: new Date(eventDate).toISOString(),
            eventTime: eventTime || null,
            venueName: venueName || null,
          }),
        });

        if (!updateRes.ok) {
          const data = await updateRes.json();
          throw new Error(data.error || "Failed to update workshop");
        }
      }

      // Then resubmit
      const res = await fetch(`/api/workshops/${workshopId}/resubmit`, {
        method: "POST",
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to resubmit");
      }

      setFeedback({
        type: "success",
        message: data.autoApproved
          ? "Workshop resubmitted and auto-approved! Refreshing..."
          : "Workshop resubmitted for review. You'll be notified of the decision.",
      });

      // Reload after short delay to show updated status
      setTimeout(() => window.location.reload(), 2000);
    } catch (error) {
      setFeedback({
        type: "error",
        message: error instanceof Error ? error.message : "Failed to resubmit",
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="rounded-xl border border-red-200 bg-red-50 p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Badge variant="destructive">Denied</Badge>
        <h2 className="text-sm font-semibold text-red-900">Workshop Requires Changes</h2>
      </div>

      {rejectionReason && (
        <div className="text-sm text-red-800 bg-white/60 rounded-lg p-3 border border-red-100">
          <span className="font-medium">Reason: </span>
          {rejectionReason}
        </div>
      )}

      {feedback && (
        <div
          className={`rounded-md border px-4 py-3 text-sm ${
            feedback.type === "success"
              ? "border-green-200 bg-green-50 text-green-700"
              : "border-red-200 bg-white text-red-700"
          }`}
        >
          {feedback.message}
        </div>
      )}

      {isEditing ? (
        <div className="space-y-3 bg-white rounded-lg p-4 border border-red-100">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Event Date</label>
              <input
                type="date"
                value={eventDate}
                onChange={(e) => setEventDate(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Event Time</label>
              <input
                type="text"
                value={eventTime}
                onChange={(e) => setEventTime(e.target.value)}
                placeholder="e.g. 9:00 AM"
                className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Venue Name</label>
            <input
              type="text"
              value={venueName}
              onChange={(e) => setVenueName(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>
      ) : null}

      <div className="flex items-center gap-3">
        <Button
          onClick={() => setIsEditing(!isEditing)}
          variant="outline"
          size="sm"
          disabled={submitting}
        >
          {isEditing ? "Cancel Edit" : "Edit Workshop"}
        </Button>
        <Button
          onClick={handleSaveAndResubmit}
          disabled={submitting}
          size="sm"
        >
          {submitting ? "Resubmitting..." : isEditing ? "Save & Resubmit" : "Resubmit for Approval"}
        </Button>
      </div>
    </div>
  );
}
