/**
 * Admin Workflows List Page (JV-11)
 * /admin/workflows
 *
 * Shows all workflows with step counts, assignment counts, and quick actions.
 */

import { Suspense } from "react";
import Link from "next/link";
import { db } from "@/lib/db";
import { Badge } from "@/components/ui/badge";
import { DeleteWorkflowButton } from "@/components/workflows/delete-workflow-button";
import { PageHeader } from "@/components/ui/page-header";
import { ResponsiveActionsItem } from "@/components/ui/responsive-actions-menu";
import { ResponsiveDataView } from "@/components/ui/responsive-data-view";
import {
  ResponsiveRecord,
  ResponsiveRecordActions,
  ResponsiveRecordHeader,
  ResponsiveRecordMeta,
} from "@/components/ui/responsive-record";
import { isMobileResponsiveEnabled } from "@/lib/mobile-responsive-flags";
import { formatTimestamp } from "@/lib/utils";

export async function WorkflowsContent({ responsiveEnabled = false }: { responsiveEnabled?: boolean }) {
  const workflows = await db.workflow.findMany({
    include: {
      steps: { orderBy: { sortOrder: "asc" } },
      category: { select: { name: true } },
      _count: { select: { assignments: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  if (workflows.length === 0) {
    return (
      <div className="bg-card rounded-lg shadow p-12 text-center">
        <svg
          className="w-12 h-12 text-muted-foreground/50 mx-auto mb-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m3.75 9v6m3-3H9m1.5-12H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
          />
        </svg>
        <h3 className="text-lg font-medium text-foreground mb-2">No workflows yet</h3>
        <p className="text-muted-foreground mb-6">
          Create your first email workflow to automate pre- and post-event
          communications.
        </p>
        <Link
          href="/admin/workflows/new"
          className={`inline-flex rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90${responsiveEnabled ? " min-h-11 items-center justify-center" : ""}`}
        >
          Create Workflow
        </Link>
      </div>
    );
  }

  const wideTable = (
    <div className="bg-card rounded-lg shadow overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-border">
          <thead className="bg-muted">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Name
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Steps
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Workshops
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Type
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Auto-Assign
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Status
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Updated
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {workflows.map((workflow) => (
              <tr key={workflow.id} className="hover:bg-accent">
                <td className="px-4 py-4">
                  <Link
                    href={`/admin/workflows/${workflow.id}`}
                    className="text-primary hover:text-primary/80 font-medium"
                  >
                    {workflow.name}
                  </Link>
                  {workflow.description && (
                    <p className="text-sm text-muted-foreground mt-0.5 line-clamp-1">
                      {workflow.description}
                    </p>
                  )}
                </td>
                <td className="px-4 py-4 text-sm text-muted-foreground">
                  {workflow.steps.length} step{workflow.steps.length !== 1 ? "s" : ""}
                </td>
                <td className="px-4 py-4 text-sm text-muted-foreground">
                  {workflow._count.assignments} workshop{workflow._count.assignments !== 1 ? "s" : ""}
                </td>
                <td className="px-4 py-4">
                  {workflow.isTemplate ? (
                    <Badge variant="info">Template</Badge>
                  ) : (
                    <Badge variant="secondary">Custom</Badge>
                  )}
                </td>
                <td className="px-4 py-4 text-xs text-muted-foreground">
                  {workflow.workflowPhase || workflow.category?.name ? (
                    <span>
                      {workflow.workflowPhase === "PRE_EVENT" ? "Pre" : workflow.workflowPhase === "POST_EVENT" ? "Post" : ""}
                      {workflow.workflowPhase && workflow.category?.name ? " / " : ""}
                      {workflow.category?.name || ""}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className="px-4 py-4">
                  {workflow.isActive ? (
                    <Badge variant="success">Active</Badge>
                  ) : (
                    <Badge variant="outline">Inactive</Badge>
                  )}
                </td>
                <td className="px-4 py-4 text-sm text-muted-foreground">
                  {formatTimestamp(workflow.updatedAt)}
                </td>
                <td className="px-4 py-4 text-right">
                  <div className="flex items-center justify-end gap-3">
                    <Link
                      href={`/admin/workflows/${workflow.id}?preview=1`}
                      className="text-sm text-muted-foreground hover:text-foreground font-medium"
                    >
                      Preview
                    </Link>
                    <Link
                      href={`/admin/workflows/${workflow.id}`}
                      className="text-sm text-primary hover:text-primary/80 font-medium"
                    >
                      Edit
                    </Link>
                    <DeleteWorkflowButton
                      workflowId={workflow.id}
                      workflowName={workflow.name}
                      assignmentCount={workflow._count.assignments}
                    />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  return (
    <ResponsiveDataView
      enabled={responsiveEnabled}
      label="Workflows"
      wideFrom="lg"
      wideRegionLabel="Workflows table"
      wide={wideTable}
      compact={
        <div className="space-y-3">
          {workflows.map((workflow) => {
            const trigger = [
              workflow.workflowPhase === "PRE_EVENT"
                ? "Pre"
                : workflow.workflowPhase === "POST_EVENT"
                  ? "Post"
                  : null,
              workflow.category?.name ?? null,
            ].filter(Boolean).join(" / ") || "—";

            return (
              <ResponsiveRecord key={workflow.id}>
                <ResponsiveRecordHeader
                  title={workflow.name}
                  status={workflow.isActive ? <Badge variant="success">Active</Badge> : <Badge variant="outline">Inactive</Badge>}
                />
                {workflow.description ? (
                  <p className="mt-1 break-words text-sm text-muted-foreground">{workflow.description}</p>
                ) : null}
                <ResponsiveRecordMeta
                  items={[
                    { label: "Trigger", value: trigger },
                    { label: "Steps", value: `${workflow.steps.length} step${workflow.steps.length === 1 ? "" : "s"}` },
                    { label: "Workshops", value: workflow._count.assignments },
                    { label: "Updated", value: formatTimestamp(workflow.updatedAt) },
                  ]}
                />
                <ResponsiveRecordActions
                  menuLabel={`More actions for ${workflow.name}`}
                  primary={
                    <Link
                      href={`/admin/workflows/${workflow.id}`}
                      className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                    >
                      Open workflow
                    </Link>
                  }
                  secondary={
                    <>
                      <ResponsiveActionsItem asChild className="flex min-h-11 cursor-pointer items-center rounded-md px-3 text-sm outline-none focus:bg-accent">
                        <Link href={`/admin/workflows/${workflow.id}?preview=1`}>Preview workflow</Link>
                      </ResponsiveActionsItem>
                      <ResponsiveActionsItem asChild className="flex min-h-11 cursor-pointer items-center rounded-md px-3 text-sm outline-none focus:bg-accent">
                        <Link href={`/admin/workflows/${workflow.id}`}>Edit workflow</Link>
                      </ResponsiveActionsItem>
                      <ResponsiveActionsItem asChild className="flex min-h-11 cursor-pointer items-center rounded-md px-3 text-sm outline-none focus:bg-accent">
                        <DeleteWorkflowButton
                          workflowId={workflow.id}
                          workflowName={workflow.name}
                          assignmentCount={workflow._count.assignments}
                        />
                      </ResponsiveActionsItem>
                    </>
                  }
                />
              </ResponsiveRecord>
            );
          })}
        </div>
      }
    />
  );
}

export default function WorkflowsPage() {
  const responsiveEnabled = isMobileResponsiveEnabled();

  return (
    <div className={responsiveEnabled ? "min-w-0 max-w-full space-y-6" : "space-y-6"}>
      {responsiveEnabled ? (
        <PageHeader
          responsiveEnabled
          title="Workflows"
          description="Manage automated email sequences for pre- and post-event communications."
          actions={
            <Link
              href="/admin/workflows/new"
              className="inline-flex min-h-11 w-full items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Create Workflow
            </Link>
          }
        />
      ) : (
        <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Workflows</h1>
          <p className="text-muted-foreground">
            Manage automated email sequences for pre- and post-event
            communications.
          </p>
        </div>
        <Link
          href="/admin/workflows/new"
          className="inline-flex rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Create Workflow
        </Link>
      </div>
      )}

      <Suspense
        fallback={
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        }
      >
        <WorkflowsContent responsiveEnabled={responsiveEnabled} />
      </Suspense>
    </div>
  );
}
