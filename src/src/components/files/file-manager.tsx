"use client";

import { useState, useRef } from "react";
import { upload } from "@vercel/blob/client";
import { sanitizeFilename, validateFile } from "@/lib/files/file-rules";
import { cn, formatTimestamp } from "@/lib/utils";
import { ResponsiveDataView } from "@/components/ui/responsive-data-view";
import {
  FileRecordCard,
  formatFileSize,
  getFileIcon,
  type FileRecord,
} from "@/components/files/file-record-card";

interface Workshop {
  id: string;
  title: string;
  workshopCode: string;
}

export interface FileManagerProps {
  initialFiles: FileRecord[];
  workshops: Workshop[];
  responsiveEnabled?: boolean;
}

const FILE_CATEGORIES = [
  { value: "", label: "No category" },
  { value: "pre-work", label: "Pre-work Materials" },
  { value: "handout", label: "Workshop Handouts" },
  { value: "presentation", label: "Presentations" },
  { value: "follow-up", label: "Follow-up Resources" },
  { value: "invoice", label: "Invoices & Billing" },
  { value: "other", label: "Other" },
];

export function FileManager({
  initialFiles,
  workshops,
  responsiveEnabled = false,
}: FileManagerProps) {
  const [files, setFiles] = useState<FileRecord[]>(initialFiles);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [filterWorkshop, setFilterWorkshop] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // MR-41: Edit file metadata
  const [editingFile, setEditingFile] = useState<FileRecord | null>(null);
  const [editCategory, setEditCategory] = useState("");
  const [editWorkshopId, setEditWorkshopId] = useState("");
  const [saving, setSaving] = useState(false);

  function openEdit(file: FileRecord) {
    setEditingFile(file);
    setEditCategory(file.category || "");
    setEditWorkshopId(file.workshopId || "");
  }

  async function handleSaveEdit() {
    if (!editingFile) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/files/${editingFile.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          category: editCategory || null,
          workshopId: editWorkshopId || null,
        }),
      });
      const json = await res.json();
      if (res.ok) {
        setFiles((prev) => prev.map((f) => (f.id === editingFile.id ? { ...f, ...json.data } : f)));
        setEditingFile(null);
        setSuccess("File updated");
      } else {
        setError(json.error || "Save failed");
      }
    } catch {
      setError("Save failed");
    } finally {
      setSaving(false);
    }
  }

  // Upload form state
  const [uploadWorkshopId, setUploadWorkshopId] = useState("");
  const [uploadCategory, setUploadCategory] = useState("");

  const filteredFiles = files.filter((f) => {
    if (filterWorkshop && f.workshopId !== filterWorkshop) return false;
    if (filterCategory && f.category !== filterCategory) return false;
    return true;
  });

  async function handleUpload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setUploadProgress(null);

    const fileEl = fileInputRef.current;
    if (!fileEl?.files?.length) {
      setError("Please select a file to upload");
      return;
    }

    const selectedFile = fileEl.files[0];
    const validationError = validateFile(selectedFile);
    if (validationError) {
      setError(validationError);
      return;
    }

    setUploading(true);

    try {
      await upload(sanitizeFilename(selectedFile.name), selectedFile, {
        access: "public",
        handleUploadUrl: "/api/files/client-upload",
        multipart: selectedFile.size > 5 * 1024 * 1024,
        clientPayload: JSON.stringify({
          originalFilename: selectedFile.name,
          contentType: selectedFile.type,
          sizeBytes: selectedFile.size,
          workshopId: uploadWorkshopId || null,
          category: uploadCategory || null,
        }),
        onUploadProgress: ({ percentage }) => {
          setUploadProgress(Math.round(percentage));
        },
      });

      // Re-fetch all files to get relations
      const listRes = await fetch("/api/files");
      const listJson = await listRes.json();
      if (listRes.ok) {
        setFiles(listJson.data);
      }

      setSuccess(`"${selectedFile.name}" uploaded successfully`);
      fileEl.value = "";
      setUploadWorkshopId("");
      setUploadCategory("");
      setUploadProgress(null);
    } catch (uploadError) {
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : "Upload failed. Please try again."
      );
    } finally {
      setUploading(false);
      setUploadProgress(null);
    }
  }

  async function handleDelete(fileId: string, filename: string) {
    if (!confirm(`Delete "${filename}"? This cannot be undone.`)) return;

    setDeletingId(fileId);
    setError(null);

    try {
      const res = await fetch(`/api/files/${fileId}`, { method: "DELETE" });

      if (!res.ok) {
        const json = await res.json();
        setError(json.error || "Delete failed");
        return;
      }

      setFiles((prev) => prev.filter((f) => f.id !== fileId));
      setSuccess(`"${filename}" deleted`);
    } catch {
      setError("Delete failed. Please try again.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-6">
      {/* Upload Form */}
      <div className="rounded-lg bg-card p-6 shadow">
        <h2 className="text-lg font-medium text-foreground mb-4">Upload File</h2>
        <form
          onSubmit={handleUpload}
          className={cn(
            "grid grid-cols-1 gap-4 sm:grid-cols-4",
            responsiveEnabled && "sm:grid-cols-2 lg:grid-cols-4",
          )}
        >
          <div className="sm:col-span-2">
            <label htmlFor="file-input" className="block text-sm font-medium text-foreground mb-1">
              File (max 250MB)
            </label>
            <input
              id="file-input"
              ref={fileInputRef}
              type="file"
              className={cn(
                "block w-full text-sm text-muted-foreground file:mr-4 file:rounded-md file:border-0 file:bg-primary/10 file:px-4 file:py-2 file:text-sm file:font-medium file:text-primary hover:file:bg-primary/15",
                responsiveEnabled && "min-w-0 max-w-full file:min-h-11",
              )}
            />
          </div>

          <div>
            <label htmlFor="upload-workshop" className="block text-sm font-medium text-foreground mb-1">
              Workshop (optional)
            </label>
            <select
              id="upload-workshop"
              value={uploadWorkshopId}
              onChange={(e) => setUploadWorkshopId(e.target.value)}
              className={cn("block w-full rounded-md border-border text-sm shadow-sm focus:border-primary focus:ring-primary", responsiveEnabled && "min-h-11 min-w-0")}
            >
              <option value="">No workshop</option>
              {workshops.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.workshopCode} — {w.title}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="upload-category" className="block text-sm font-medium text-foreground mb-1">
              Category (optional)
            </label>
            <select
              id="upload-category"
              value={uploadCategory}
              onChange={(e) => setUploadCategory(e.target.value)}
              className={cn("block w-full rounded-md border-border text-sm shadow-sm focus:border-primary focus:ring-primary", responsiveEnabled && "min-h-11 min-w-0")}
            >
              {FILE_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>

          <div className={cn("sm:col-span-4 flex items-center gap-4", responsiveEnabled && "sm:col-span-2 lg:col-span-4")}>
            <button
              type="submit"
              disabled={uploading}
              className={cn("inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50", responsiveEnabled && "min-h-11 justify-center")}
            >
              {uploading
                ? uploadProgress !== null
                  ? `Uploading... ${uploadProgress}%`
                  : "Uploading..."
                : "Upload"}
            </button>
          </div>
        </form>
      </div>

      {/* Status Messages */}
      {error && (
        <div className="rounded-md bg-destructive/10 p-4">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}
      {success && (
        <div className="rounded-md bg-success/10 p-4">
          <p className="text-sm text-success">{success}</p>
        </div>
      )}

      {/* Filters */}
      <div className="rounded-lg bg-card p-4 shadow">
        <div className={cn("flex flex-wrap items-center gap-4", responsiveEnabled && "flex-col items-stretch sm:flex-row sm:items-center")}>
          <span className="text-sm font-medium text-foreground">Filter:</span>
          <select
            value={filterWorkshop}
            onChange={(e) => setFilterWorkshop(e.target.value)}
            className={cn("rounded-md border-border text-sm shadow-sm focus:border-primary focus:ring-primary", responsiveEnabled && "min-h-11 min-w-0")}
          >
            <option value="">All workshops</option>
            {workshops.map((w) => (
              <option key={w.id} value={w.id}>
                {w.workshopCode} — {w.title}
              </option>
            ))}
          </select>
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className={cn("rounded-md border-border text-sm shadow-sm focus:border-primary focus:ring-primary", responsiveEnabled && "min-h-11 min-w-0")}
          >
            <option value="">All categories</option>
            {FILE_CATEGORIES.filter((c) => c.value).map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
          <span className="text-sm text-muted-foreground">
            {filteredFiles.length} file{filteredFiles.length !== 1 ? "s" : ""}
          </span>
        </div>
      </div>

      {/* File List */}
      <div className="rounded-lg bg-card shadow">
        {filteredFiles.length === 0 ? (
          <div className="rounded-lg border-2 border-dashed border-border p-12 text-center">
            <h3 className="text-lg font-medium text-foreground">No files</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Upload your first file to get started.
            </p>
          </div>
        ) : (
          <ResponsiveDataView
            enabled={responsiveEnabled}
            label="Files"
            compact={
              <div className="space-y-3 p-3">
                {filteredFiles.map((file) => (
                  <FileRecordCard
                    key={file.id}
                    file={file}
                    deleting={deletingId === file.id}
                    onEdit={openEdit}
                    onDelete={handleDelete}
                  />
                ))}
              </div>
            }
            wide={
          <div
            className="overflow-x-auto"
            role={responsiveEnabled ? "region" : undefined}
            aria-label={responsiveEnabled ? "File table" : undefined}
            tabIndex={responsiveEnabled ? 0 : undefined}
          >
            <table className="min-w-full divide-y divide-border">
              <thead className="bg-muted">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    File
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Workshop
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Category
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Workflow Step
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Size
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Uploaded
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-card">
                {filteredFiles.map((file) => (
                  <tr key={file.id} className="hover:bg-accent">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{getFileIcon(file.contentType)}</span>
                        <div>
                          <a
                            href={file.downloadUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm font-medium text-primary hover:text-primary/80"
                          >
                            {file.filename}
                          </a>
                          <div className="text-xs text-muted-foreground">{file.contentType}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-foreground">
                      {file.workshop ? (
                        <span title={file.workshop.title}>
                          {file.workshop.workshopCode}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {file.category ? (
                        <span className="inline-flex rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-foreground">
                          {file.category}
                        </span>
                      ) : (
                        <span className="text-sm text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm text-foreground">
                      {file.workflowStep ? (
                        <span className="inline-flex rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                          {file.workflowStep.subject || file.workflowStep.stepType}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm text-foreground">
                      {formatFileSize(file.sizeBytes)}
                    </td>
                    <td className="px-6 py-4 text-sm text-muted-foreground">
                      {formatTimestamp(file.createdAt)}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <a
                          href={file.downloadUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm font-medium text-primary hover:text-primary/80"
                        >
                          View
                        </a>
                        <button
                          onClick={() => openEdit(file)}
                          className="text-sm font-medium text-muted-foreground hover:text-foreground"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(file.id, file.filename)}
                          disabled={deletingId === file.id}
                          className="text-sm font-medium text-destructive hover:text-destructive/80 disabled:opacity-50"
                        >
                          {deletingId === file.id ? "..." : "Delete"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
            }
          />
        )}
      </div>

      {/* MR-41: Edit file metadata modal */}
      {editingFile && (
        <div className={cn("fixed inset-0 z-50 flex items-center justify-center bg-black/40", responsiveEnabled && "p-4")}>
          <div className={cn("bg-card rounded-lg shadow-lg w-full max-w-sm p-6 space-y-4", responsiveEnabled && "min-w-0 max-h-[calc(100dvh-2rem)] overflow-y-auto")}>
            <h3 className="text-base font-semibold text-foreground">Edit File Metadata</h3>
            <p className="text-sm text-muted-foreground truncate">{editingFile.filename}</p>

            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Workshop</label>
                <select
                  value={editWorkshopId}
                  onChange={(e) => setEditWorkshopId(e.target.value)}
                  className={cn("block w-full rounded-md border border-border px-3 py-2 text-sm", responsiveEnabled && "min-h-11 min-w-0")}
                >
                  <option value="">No workshop</option>
                  {workshops.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.workshopCode} — {w.title}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Category</label>
                <select
                  value={editCategory}
                  onChange={(e) => setEditCategory(e.target.value)}
                  className={cn("block w-full rounded-md border border-border px-3 py-2 text-sm", responsiveEnabled && "min-h-11 min-w-0")}
                >
                  {FILE_CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className={cn("flex justify-end gap-2 pt-2", responsiveEnabled && "flex-col sm:flex-row")}>
              <button
                onClick={() => setEditingFile(null)}
                className={cn("rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-accent", responsiveEnabled && "min-h-11")}
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={saving}
                className={cn("rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50", responsiveEnabled && "min-h-11")}
              >
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
