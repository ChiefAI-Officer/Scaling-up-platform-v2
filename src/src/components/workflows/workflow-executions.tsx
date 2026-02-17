"use client";

/**
 * WorkflowExecutions — Live execution status view for a workflow.
 *
 * Shows which emails have been sent, scheduled, or failed for each
 * assigned workshop. Fetches data on mount and allows manual refresh.
 */

import { useState, useEffect, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { STEP_TYPE_LABELS } from "@/lib/workflow-types";
import type { StepType } from "@/lib/workflow-types";

interface Execution {
  id: string;
  stepId: string;
  workshopId: string;
  registrationId: string | null;
  status: string;
  scheduledFor: string | null;
  executedAt: string | null;
  errorMessage: string | null;
  attempts: number;
  createdAt: string;
  step: {
    sortOrder: number;
    stepType: string;
    subject: string | null;
    offsetDays: number | null;
  };
}

interface WorkshopGroup {
  workshopId: string;
  workshopTitle: string;
  workshopCode: string;
  executions: Execution[];
}

interface WorkflowExecutionsProps {
  workflowId: string;
}

const STATUS_STYLES: Record<string, { variant: "success" | "warning" | "destructive" | "secondary" | "outline"; label: string }> = {
  SENT: { variant: "success", label: "Sent" },
  SCHEDULED: { variant: "warning", label: "Scheduled" },
  PENDING: { variant: "secondary", label: "Pending" },
  FAILED: { variant: "destructive", label: "Failed" },
  SKIPPED: { variant: "outline", label: "Skipped" },
};

export function WorkflowExecutions({ workflowId }: WorkflowExecutionsProps) {
  const [groups, setGroups] = useState<WorkshopGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchExecutions = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/workflows/${workflowId}/executions`);
      if (!res.ok) throw new Error("Failed to fetch executions");
      const data = await res.json();
      setGroups(data.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [workflowId]);

  useEffect(() => {
    fetchExecutions();
  }, [fetchExecutions]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
        {error}
      </div>
    );
  }

  if (groups.length === 0) {
    return (
      <div className="text-center py-8 text-gray-400 text-sm">
        No executions yet. Assign this workflow to a workshop to start scheduling.
      </div>
    );
  }

  // Summary counts
  const allExecutions = groups.flatMap((g) => g.executions);
  const sent = allExecutions.filter((e) => e.status === "SENT").length;
  const scheduled = allExecutions.filter((e) => e.status === "SCHEDULED").length;
  const pending = allExecutions.filter((e) => e.status === "PENDING").length;
  const failed = allExecutions.filter((e) => e.status === "FAILED").length;
  const skipped = allExecutions.filter((e) => e.status === "SKIPPED").length;

  return (
    <div className="space-y-4">
      {/* Summary bar */}
      <div className="flex items-center justify-between">
        <div className="flex gap-4">
          <div className="text-center">
            <p className="text-lg font-bold text-green-600">{sent}</p>
            <p className="text-xs text-gray-500">Sent</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-bold text-amber-600">{scheduled}</p>
            <p className="text-xs text-gray-500">Scheduled</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-bold text-gray-500">{pending}</p>
            <p className="text-xs text-gray-500">Pending</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-bold text-red-600">{failed}</p>
            <p className="text-xs text-gray-500">Failed</p>
          </div>
          {skipped > 0 && (
            <div className="text-center">
              <p className="text-lg font-bold text-gray-400">{skipped}</p>
              <p className="text-xs text-gray-500">Skipped</p>
            </div>
          )}
        </div>
        <button
          onClick={fetchExecutions}
          className="text-sm text-blue-600 hover:text-blue-700 px-3 py-1.5 border rounded-md"
        >
          Refresh
        </button>
      </div>

      {/* Per-workshop groups */}
      {groups.map((group) => (
        <div key={group.workshopId} className="border rounded-lg overflow-hidden">
          <div className="bg-gray-50 px-4 py-2 flex items-center justify-between">
            <div>
              <span className="font-medium text-gray-900 text-sm">{group.workshopTitle}</span>
              <span className="ml-2 text-xs text-gray-500">[{group.workshopCode}]</span>
            </div>
            <span className="text-xs text-gray-400">
              {group.executions.length} step{group.executions.length !== 1 ? "s" : ""}
            </span>
          </div>
          <div className="divide-y divide-gray-100">
            {group.executions
              .sort((a, b) => a.step.sortOrder - b.step.sortOrder)
              .map((exec) => {
                const statusInfo = STATUS_STYLES[exec.status] || STATUS_STYLES.PENDING;
                return (
                  <div key={exec.id} className="px-4 py-2.5 flex items-center justify-between text-sm">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="flex-shrink-0 w-6 h-6 bg-gray-100 rounded-full flex items-center justify-center text-xs font-medium text-gray-600">
                        {exec.step.sortOrder + 1}
                      </span>
                      <div className="min-w-0">
                        <p className="text-gray-900 truncate">
                          {STEP_TYPE_LABELS[exec.step.stepType as StepType] || exec.step.stepType}
                          {exec.step.subject && (
                            <span className="text-gray-400 ml-1">— {exec.step.subject}</span>
                          )}
                        </p>
                        {exec.scheduledFor && exec.status === "SCHEDULED" && (
                          <p className="text-xs text-amber-600">
                            Scheduled: {new Date(exec.scheduledFor).toLocaleString()}
                          </p>
                        )}
                        {exec.executedAt && (
                          <p className="text-xs text-gray-400">
                            {exec.status === "SENT" ? "Sent" : "Executed"}: {new Date(exec.executedAt).toLocaleString()}
                          </p>
                        )}
                        {exec.errorMessage && (
                          <p className="text-xs text-red-500 truncate">{exec.errorMessage}</p>
                        )}
                      </div>
                    </div>
                    <Badge variant={statusInfo.variant}>
                      {statusInfo.label}
                    </Badge>
                  </div>
                );
              })}
          </div>
        </div>
      ))}
    </div>
  );
}
