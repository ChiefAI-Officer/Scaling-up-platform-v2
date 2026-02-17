"use client";

/**
 * WorkflowTimeline — Visual timeline showing workflow steps relative to event date.
 *
 * Renders a horizontal timeline with:
 * - Event date as the center anchor point
 * - Steps plotted by their offset (before/after event)
 * - Color-coded by step type
 * - Hover tooltips with step details
 */

import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import {
  STEP_TYPE_LABELS,
  TRIGGER_TYPES,
} from "@/lib/workflow-types";
import type { StepType } from "@/lib/workflow-types";

interface TimelineStep {
  id: string;
  sortOrder: number;
  stepType: string;
  triggerType: string;
  offsetDays: number | null;
  offsetHours: number | null;
  sendTimeOfDay: string | null;
  subject: string | null;
  isActive: boolean;
}

interface WorkflowTimelineProps {
  steps: TimelineStep[];
}

const STEP_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  EMAIL_ATTENDEES: { bg: "bg-blue-100", border: "border-blue-400", text: "text-blue-700" },
  EMAIL_COACH: { bg: "bg-purple-100", border: "border-purple-400", text: "text-purple-700" },
  EMAIL_STAFF: { bg: "bg-amber-100", border: "border-amber-400", text: "text-amber-700" },
  EMAIL_CUSTOM: { bg: "bg-teal-100", border: "border-teal-400", text: "text-teal-700" },
  NOTIFICATION: { bg: "bg-gray-100", border: "border-gray-400", text: "text-gray-700" },
};

export function WorkflowTimeline({ steps }: WorkflowTimelineProps) {
  // Separate relative steps (plotted on timeline) from event-triggered steps (listed below)
  const { relativeSteps, eventSteps } = useMemo(() => {
    const relative: (TimelineStep & { totalHours: number })[] = [];
    const event: TimelineStep[] = [];

    for (const step of steps) {
      if (step.triggerType === TRIGGER_TYPES.RELATIVE_TO_EVENT) {
        const totalHours = ((step.offsetDays ?? 0) * 24) + (step.offsetHours ?? 0);
        relative.push({ ...step, totalHours });
      } else {
        event.push(step);
      }
    }

    relative.sort((a, b) => a.totalHours - b.totalHours);
    return { relativeSteps: relative, eventSteps: event };
  }, [steps]);

  if (steps.length === 0) {
    return (
      <div className="text-center py-8 text-gray-400 text-sm">
        Add steps to see the visual timeline.
      </div>
    );
  }

  // Calculate timeline range
  const minHours = relativeSteps.length > 0 ? Math.min(...relativeSteps.map(s => s.totalHours), 0) : -24;
  const maxHours = relativeSteps.length > 0 ? Math.max(...relativeSteps.map(s => s.totalHours), 0) : 24;
  const range = maxHours - minHours || 48;
  const padding = range * 0.1; // 10% padding

  function getPosition(totalHours: number): number {
    return ((totalHours - minHours + padding) / (range + padding * 2)) * 100;
  }

  const eventPosition = getPosition(0);

  return (
    <div className="space-y-4">
      {/* Timeline visualization */}
      <div className="relative pt-8 pb-16 px-4">
        {/* Horizontal line */}
        <div className="absolute top-[50%] left-4 right-4 h-0.5 bg-gray-200" />

        {/* Event date marker */}
        <div
          className="absolute top-[50%] -translate-y-1/2 z-10"
          style={{ left: `${eventPosition}%` }}
        >
          <div className="flex flex-col items-center">
            <span className="text-[10px] font-bold text-red-600 uppercase tracking-wider mb-1 whitespace-nowrap">
              Event Day
            </span>
            <div className="w-4 h-4 bg-red-500 rounded-full border-2 border-white shadow-md" />
            <div className="w-0.5 h-4 bg-red-300" />
          </div>
        </div>

        {/* Step markers */}
        {relativeSteps.map((step, i) => {
          const pos = getPosition(step.totalHours);
          const colors = STEP_COLORS[step.stepType] || STEP_COLORS.NOTIFICATION;
          const label = formatOffsetLabel(step.offsetDays ?? 0, step.offsetHours ?? 0);
          const isAbove = i % 2 === 0;

          return (
            <div
              key={step.id}
              className="absolute z-20"
              style={{
                left: `${pos}%`,
                top: isAbove ? "10%" : "55%",
              }}
            >
              <div className={`flex flex-col items-center ${isAbove ? "" : "flex-col-reverse"}`}>
                <div
                  className={`${colors.bg} ${colors.border} border rounded-md px-2 py-1 shadow-sm max-w-[140px] text-center cursor-default ${!step.isActive ? "opacity-40" : ""}`}
                  title={step.subject || "No subject"}
                >
                  <p className={`text-[10px] font-semibold ${colors.text} truncate`}>
                    {STEP_TYPE_LABELS[step.stepType as StepType] || step.stepType}
                  </p>
                  <p className="text-[9px] text-gray-500 truncate">
                    {label}
                  </p>
                  {step.subject && (
                    <p className="text-[9px] text-gray-400 truncate mt-0.5">
                      {step.subject}
                    </p>
                  )}
                </div>
                <div className={`w-0.5 h-3 ${colors.border.replace("border-", "bg-")}`} />
                <div className={`w-2.5 h-2.5 rounded-full ${colors.bg} ${colors.border} border`} />
              </div>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 justify-center">
        {Object.entries(STEP_COLORS).map(([type, colors]) => (
          <div key={type} className="flex items-center gap-1.5 text-xs text-gray-500">
            <div className={`w-2.5 h-2.5 rounded-full ${colors.bg} ${colors.border} border`} />
            {STEP_TYPE_LABELS[type as StepType] || type}
          </div>
        ))}
        <div className="flex items-center gap-1.5 text-xs text-gray-500">
          <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
          Event Day
        </div>
      </div>

      {/* Event-triggered steps (not relative to date) */}
      {eventSteps.length > 0 && (
        <div className="border-t pt-3">
          <p className="text-xs font-medium text-gray-500 mb-2 uppercase tracking-wider">
            Event-Triggered Steps
          </p>
          <div className="flex flex-wrap gap-2">
            {eventSteps.map((step) => {
              const colors = STEP_COLORS[step.stepType] || STEP_COLORS.NOTIFICATION;
              return (
                <Badge
                  key={step.id}
                  variant="outline"
                  className={`${colors.bg} ${colors.text} ${colors.border} border`}
                >
                  {STEP_TYPE_LABELS[step.stepType as StepType]} —{" "}
                  {step.triggerType === TRIGGER_TYPES.ON_REGISTRATION
                    ? "On Registration"
                    : "On Approval"}
                </Badge>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function formatOffsetLabel(days: number, hours: number): string {
  if (days === 0 && hours === 0) return "Day of event";
  const parts: string[] = [];
  if (days !== 0) {
    const abs = Math.abs(days);
    parts.push(`${abs}d ${days < 0 ? "before" : "after"}`);
  }
  if (hours !== 0) {
    const abs = Math.abs(hours);
    parts.push(`${abs}h ${hours < 0 ? "before" : "after"}`);
  }
  return parts.join(", ");
}
