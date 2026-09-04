"use client";

import {
  ResponsiveActionsItem,
  ResponsiveActionsMenu,
} from "@/components/ui/responsive-actions-menu";
import { formatTimestamp } from "@/lib/utils";

export interface FileRecord {
  id: string;
  filename: string;
  downloadUrl: string;
  publicUrl?: string;
  contentType: string;
  sizeBytes: number;
  workshopId: string | null;
  workshopCode: string | null;
  workflowStepId: string | null;
  uploadedBy: string;
  category: string | null;
  createdAt: string;
  workshop: { id: string; title: string; workshopCode: string } | null;
  workflowStep: { id: string; stepType: string; subject: string | null } | null;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function getFileIcon(contentType: string): string {
  if (contentType.startsWith("image/")) return "🖼️";
  if (contentType === "application/pdf") return "📄";
  if (contentType.includes("spreadsheet") || contentType.includes("excel")) return "📊";
  if (contentType.includes("presentation") || contentType.includes("powerpoint")) return "📽️";
  if (contentType.includes("word") || contentType.includes("document")) return "📝";
  if (contentType.startsWith("text/")) return "📃";
  return "📎";
}

export function FileRecordCard({
  file,
  deleting,
  onCopyImageUrl,
  onEdit,
  onDelete,
}: {
  file: FileRecord;
  deleting: boolean;
  onCopyImageUrl: (publicUrl: string) => void;
  onEdit: (file: FileRecord) => void;
  onDelete: (fileId: string, filename: string) => void;
}) {
  return (
    <article role="listitem" className="min-w-0 rounded-xl border border-border bg-card p-4">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2">
          <span className="text-lg" aria-hidden>{getFileIcon(file.contentType)}</span>
          <div className="min-w-0">
            <a
              href={file.downloadUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 min-w-11 max-w-full items-center break-all text-sm font-medium text-primary"
              data-touch-target
            >
              {file.filename}
            </a>
            <p className="break-all text-xs text-muted-foreground">{file.contentType}</p>
          </div>
        </div>

        <ResponsiveActionsMenu label="More file actions">
          <ResponsiveActionsItem asChild>
            <a
              href={file.downloadUrl}
              download
              className="flex min-h-11 cursor-pointer items-center rounded-md px-3 text-sm outline-none focus:bg-muted"
              data-touch-target
            >
              Download
            </a>
          </ResponsiveActionsItem>
          {file.contentType.startsWith("image/") && file.publicUrl && (
            <ResponsiveActionsItem asChild>
              <button
                type="button"
                onClick={() =>
                  file.publicUrl && onCopyImageUrl(file.publicUrl)
                }
                className="flex min-h-11 w-full cursor-pointer items-center rounded-md px-3 text-left text-sm outline-none focus:bg-muted"
                data-touch-target
              >
                Copy image URL
              </button>
            </ResponsiveActionsItem>
          )}
          <ResponsiveActionsItem asChild>
            <button
              type="button"
              onClick={() => onEdit(file)}
              className="flex min-h-11 w-full cursor-pointer items-center rounded-md px-3 text-left text-sm outline-none focus:bg-muted"
              data-touch-target
            >
              Edit
            </button>
          </ResponsiveActionsItem>
          <ResponsiveActionsItem asChild>
            <button
              type="button"
              onClick={() => onDelete(file.id, file.filename)}
              disabled={deleting}
              className="flex min-h-11 w-full cursor-pointer items-center rounded-md px-3 text-left text-sm text-destructive outline-none focus:bg-muted disabled:opacity-50"
              data-touch-target
            >
              {deleting ? "Deleting…" : "Delete"}
            </button>
          </ResponsiveActionsItem>
        </ResponsiveActionsMenu>
      </div>

      <dl className="mt-3 grid grid-cols-1 gap-x-4 gap-y-3 text-sm min-[400px]:grid-cols-2">
        <div>
          <dt className="text-muted-foreground">Size</dt>
          <dd>{formatFileSize(file.sizeBytes)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Category</dt>
          <dd>{file.category ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Workshop</dt>
          <dd className="break-words">
            {file.workshop ? `${file.workshop.workshopCode} — ${file.workshop.title}` : "—"}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Workflow step</dt>
          <dd className="break-words">
            {file.workflowStep?.subject || file.workflowStep?.stepType || "—"}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Uploaded by</dt>
          <dd className="break-all">{file.uploadedBy}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Uploaded</dt>
          <dd>{formatTimestamp(file.createdAt)}</dd>
        </div>
      </dl>
    </article>
  );
}
