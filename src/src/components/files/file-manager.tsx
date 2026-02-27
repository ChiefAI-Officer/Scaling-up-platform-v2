"use client";

import { useState, useRef } from "react";

interface FileRecord {
  id: string;
  filename: string;
  downloadUrl: string;
  blobUrl?: string | null;
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

interface Workshop {
  id: string;
  title: string;
  workshopCode: string;
}

interface Props {
  initialFiles: FileRecord[];
  workshops: Workshop[];
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

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileIcon(contentType: string): string {
  if (contentType.startsWith("image/")) return "🖼️";
  if (contentType === "application/pdf") return "📄";
  if (contentType.includes("spreadsheet") || contentType.includes("excel")) return "📊";
  if (contentType.includes("presentation") || contentType.includes("powerpoint")) return "📽️";
  if (contentType.includes("word") || contentType.includes("document")) return "📝";
  if (contentType.startsWith("text/")) return "📃";
  return "📎";
}

export function FileManager({ initialFiles, workshops }: Props) {
  const [files, setFiles] = useState<FileRecord[]>(initialFiles);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [filterWorkshop, setFilterWorkshop] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

    const fileEl = fileInputRef.current;
    if (!fileEl?.files?.length) {
      setError("Please select a file to upload");
      return;
    }

    setUploading(true);

    try {
      const formData = new FormData();
      formData.append("file", fileEl.files[0]);
      if (uploadWorkshopId) formData.append("workshopId", uploadWorkshopId);
      if (uploadCategory) formData.append("category", uploadCategory);

      const res = await fetch("/api/files", {
        method: "POST",
        body: formData,
      });

      const json = await res.json();

      if (!res.ok) {
        setError(json.error || "Upload failed");
        return;
      }

      // Re-fetch all files to get relations
      const listRes = await fetch("/api/files");
      const listJson = await listRes.json();
      if (listRes.ok) {
        setFiles(listJson.data);
      } else {
        // Fallback: add the new file without relations
        setFiles((prev) => [json.data, ...prev]);
      }

      setSuccess(`"${fileEl.files[0].name}" uploaded successfully`);
      fileEl.value = "";
      setUploadWorkshopId("");
      setUploadCategory("");
    } catch {
      setError("Upload failed. Please try again.");
    } finally {
      setUploading(false);
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
        <form onSubmit={handleUpload} className="grid grid-cols-1 gap-4 sm:grid-cols-4">
          <div className="sm:col-span-2">
            <label htmlFor="file-input" className="block text-sm font-medium text-foreground mb-1">
              File (max 10MB)
            </label>
            <input
              id="file-input"
              ref={fileInputRef}
              type="file"
              className="block w-full text-sm text-muted-foreground file:mr-4 file:rounded-md file:border-0 file:bg-blue-50 file:px-4 file:py-2 file:text-sm file:font-medium file:text-blue-700 hover:file:bg-blue-100"
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
              className="block w-full rounded-md border-border text-sm shadow-sm focus:border-blue-500 focus:ring-blue-500"
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
              className="block w-full rounded-md border-border text-sm shadow-sm focus:border-blue-500 focus:ring-blue-500"
            >
              {FILE_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>

          <div className="sm:col-span-4 flex items-center gap-4">
            <button
              type="submit"
              disabled={uploading}
              className="inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {uploading ? "Uploading..." : "Upload"}
            </button>
          </div>
        </form>
      </div>

      {/* Status Messages */}
      {error && (
        <div className="rounded-md bg-red-50 p-4">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}
      {success && (
        <div className="rounded-md bg-green-50 p-4">
          <p className="text-sm text-green-700">{success}</p>
        </div>
      )}

      {/* Filters */}
      <div className="rounded-lg bg-card p-4 shadow">
        <div className="flex flex-wrap items-center gap-4">
          <span className="text-sm font-medium text-foreground">Filter:</span>
          <select
            value={filterWorkshop}
            onChange={(e) => setFilterWorkshop(e.target.value)}
            className="rounded-md border-border text-sm shadow-sm focus:border-blue-500 focus:ring-blue-500"
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
            className="rounded-md border-border text-sm shadow-sm focus:border-blue-500 focus:ring-blue-500"
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
          <div className="overflow-x-auto">
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
                            className="text-sm font-medium text-blue-600 hover:text-blue-800"
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
                        <span className="inline-flex rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800">
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
                      {new Date(file.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <a
                          href={file.downloadUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm font-medium text-blue-600 hover:text-blue-800"
                        >
                          View
                        </a>
                        <button
                          onClick={() => handleDelete(file.id, file.filename)}
                          disabled={deletingId === file.id}
                          className="text-sm font-medium text-red-600 hover:text-red-800 disabled:opacity-50"
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
        )}
      </div>
    </div>
  );
}
