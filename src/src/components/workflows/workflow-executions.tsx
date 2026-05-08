"use client";

/**
 * WorkflowExecutions — Live execution status view for a workflow.
 *
 * Shows which emails have been sent, scheduled, or failed for each
 * assigned workshop. Fetches data on mount and allows manual refresh.
 */

import { useState, useEffect, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { STEP_TYPE_LABELS } from "@/lib/workflows/workflow-types";
import type { StepType } from "@/lib/workflows/workflow-types";

interface Execution {
  id: string;
  stepId: string;
  workshopId: string;
  registrationId: string | null;
  // ENH-MAY6-10: parent/child rollup. parentId=null = top-level rows;
  // parentId set + recipientEmail set = per-recipient child rows.
  parentId: string | null;
  recipientEmail: string | null;
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
    offsetHours: number | null;
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
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3 text-sm text-destructive">
        {error}
      </div>
    );
  }

  if (groups.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground text-sm">
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
            <p className="text-lg font-bold text-success">{sent}</p>
            <p className="text-xs text-muted-foreground">Sent</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-bold text-warning">{scheduled}</p>
            <p className="text-xs text-muted-foreground">Scheduled</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-bold text-muted-foreground">{pending}</p>
            <p className="text-xs text-muted-foreground">Pending</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-bold text-destructive">{failed}</p>
            <p className="text-xs text-muted-foreground">Failed</p>
          </div>
          {skipped > 0 && (
            <div className="text-center">
              <p className="text-lg font-bold text-muted-foreground">{skipped}</p>
              <p className="text-xs text-muted-foreground">Skipped</p>
            </div>
          )}
        </div>
        <button
          onClick={fetchExecutions}
          className="text-sm text-primary hover:text-primary/80 px-3 py-1.5 border rounded-md"
        >
          Refresh
        </button>
      </div>

      {/* Per-workshop groups */}
      {groups.map((group) => (
        <div key={group.workshopId} className="border rounded-lg overflow-hidden">
          <div className="bg-muted px-4 py-2 flex items-center justify-between">
            <div>
              <span className="font-medium text-foreground text-sm">{group.workshopTitle}</span>
              <span className="ml-2 text-xs text-muted-foreground">[{group.workshopCode}]</span>
            </div>
            <span className="text-xs text-muted-foreground">
              {group.executions.length} step{group.executions.length !== 1 ? "s" : ""}
            </span>
          </div>
          <div className="divide-y divide-border">
            {/* ENH-MAY6-10: render top-level rows; nest per-recipient children under each. */}
            {(() => {
              const topLevel = group.executions.filter((e) => e.parentId === null);
              const childrenByParent = new Map<string, Execution[]>();
              for (const e of group.executions) {
                if (e.parentId !== null) {
                  if (!childrenByParent.has(e.parentId)) childrenByParent.set(e.parentId, []);
                  childrenByParent.get(e.parentId)!.push(e);
                }
              }
              return topLevel
                .sort((a, b) => a.step.sortOrder - b.step.sortOrder)
                .map((exec) => {
                  const children = (childrenByParent.get(exec.id) || []).sort(
                    (a, b) => (a.recipientEmail || "").localeCompare(b.recipientEmail || "")
                  );
                  return (
                    <div key={exec.id}>
                      <div className="px-4 py-2.5 flex items-center justify-between text-sm">
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="flex-shrink-0 w-6 h-6 bg-muted rounded-full flex items-center justify-center text-xs font-medium text-muted-foreground">
                            {exec.step.sortOrder + 1}
                          </span>
                          <div className="min-w-0">
                            <p className="text-foreground truncate">
                              {STEP_TYPE_LABELS[exec.step.stepType as StepType] || exec.step.stepType}
                              {exec.step.subject && (
                                <span className="text-muted-foreground ml-1">— {exec.step.subject}</span>
                              )}
                            </p>
                            {exec.scheduledFor && exec.status === "SCHEDULED" && (
                              <p className="text-xs text-warning">
                                Scheduled: {new Date(exec.scheduledFor).toLocaleString()}
                              </p>
                            )}
                            {exec.executedAt && (
                              <p className="text-xs text-muted-foreground">
                                {exec.status === "SENT" ? "Sent" : "Executed"}: {new Date(exec.executedAt).toLocaleString()}
                              </p>
                            )}
                            {children.length > 0 && (
                              <p className="text-xs text-muted-foreground">
                                {children.length} recipient{children.length !== 1 ? "s" : ""}
                              </p>
                            )}
                            {exec.errorMessage && (
                              <p className="text-xs text-destructive truncate">{exec.errorMessage}</p>
                            )}
                          </div>
                        </div>
                      </div>
                      {children.length > 0 && (
                        <div className="bg-muted/30 border-t border-border/50">
                          {children.map((child) => {
                            const childStatus = STATUS_STYLES[child.status] || STATUS_STYLES.PENDING;
                            return (
                              <div
                                key={child.id}
                                className="pl-12 pr-4 py-1.5 flex items-center justify-between text-xs"
                              >
                                <span className="text-muted-foreground truncate">
                                  {child.recipientEmail || "(unknown recipient)"}
                                </span>
                                <Badge variant={childStatus.variant}>{childStatus.label}</Badge>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                });
            })()}
          </div>
        </div>
      ))}
    </div>
  );
}
