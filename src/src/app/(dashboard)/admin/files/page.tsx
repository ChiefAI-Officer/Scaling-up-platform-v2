/**
 * Admin File Manager — /admin/files
 * Upload, view, and manage file attachments for workshops and workflow steps.
 */

import { Suspense } from "react";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/authorization";
import { FileManager } from "@/components/files/file-manager";
import { mapFileForClient } from "@/lib/file-service";

async function FilesPageData() {
  await requireAdmin();

  const [files, workshops] = await Promise.all([
    db.fileAttachment.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        workshop: { select: { id: true, title: true, workshopCode: true } },
        workflowStep: { select: { id: true, stepType: true, subject: true } },
      },
    }),
    db.workshop.findMany({
      select: { id: true, title: true, workshopCode: true },
      orderBy: { title: "asc" },
    }),
  ]);

  // Serialize dates for client component
  const serializedFiles = files.map((f) =>
    mapFileForClient({
      ...f,
      createdAt: f.createdAt.toISOString(),
    })
  );

  return (
    <FileManager
      initialFiles={serializedFiles}
      workshops={workshops}
    />
  );
}

export default function AdminFilesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">File Manager</h1>
        <p className="text-muted-foreground">
          Upload and manage files for workshops and workflow email attachments.
        </p>
      </div>

      <Suspense
        fallback={
          <div className="flex min-h-[200px] items-center justify-center text-muted-foreground">
            Loading files...
          </div>
        }
      >
        <FilesPageData />
      </Suspense>
    </div>
  );
}
