"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export interface PublishFailureIssue {
  path: (string | number)[];
  code?: string;
  message: string;
}

interface PublishFailureModalProps {
  open: boolean;
  issues: PublishFailureIssue[];
  onClose: () => void;
}

/**
 * Phase E1.2 — Surfaces Zod validation issues from the publish endpoint
 * (422 PUBLISH_VALIDATION_FAILED) in a readable modal so operators can
 * see exactly which fields blocked publish.
 */
export function PublishFailureModal({
  open,
  issues,
  onClose,
}: PublishFailureModalProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent
        className="max-w-2xl"
        data-testid="publish-failure-modal"
      >
        <DialogHeader>
          <DialogTitle>Cannot publish — validation issues</DialogTitle>
          <DialogDescription>
            The template doesn&apos;t yet meet the publish-time requirements.
            Fix the issues below, save the draft, then publish again.
          </DialogDescription>
        </DialogHeader>
        <ul
          className="space-y-2 text-sm max-h-96 overflow-y-auto"
          data-testid="publish-failure-issues"
        >
          {issues.map((issue, idx) => (
            <li
              key={idx}
              className="rounded-md border border-destructive/30 bg-destructive/5 p-3"
              data-testid={`publish-failure-issue-${idx}`}
            >
              <div className="font-mono text-xs text-muted-foreground">
                {formatIssuePath(issue.path)}
              </div>
              <div className="mt-1 text-foreground">{issue.message}</div>
            </li>
          ))}
        </ul>
        <DialogFooter>
          <Button
            onClick={onClose}
            data-testid="publish-failure-modal-close"
          >
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Format a Zod issue `path` for display.
 *
 * Examples:
 *   ["scoringConfig", "domains", 0, "tiers", 1, "minMetric"]
 *     → "scoringConfig → domains[0] → tiers[1] → minMetric"
 *   ["scoringConfig", "scaleUpScore"]
 *     → "scoringConfig → scaleUpScore"
 *
 * Numeric segments are appended to the prior string segment as [N].
 * If the path begins with a numeric segment (degenerate), it renders as
 * "[N]" on its own.
 */
export function formatIssuePath(path: (string | number)[]): string {
  if (path.length === 0) return "(root)";
  const parts: string[] = [];
  for (const segment of path) {
    if (typeof segment === "number") {
      if (parts.length === 0) {
        parts.push(`[${segment}]`);
      } else {
        parts[parts.length - 1] = `${parts[parts.length - 1]}[${segment}]`;
      }
    } else {
      parts.push(segment);
    }
  }
  return parts.join(" → ");
}
