"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  pageId: string;
  templateLabel: string;
}

export function DeleteLandingPageButton({ pageId, templateLabel }: Props) {
  const [deleting, setDeleting] = useState(false);
  const router = useRouter();

  async function handleDelete() {
    if (!confirm(`Delete the master template for "${templateLabel}"? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/landing-pages/${pageId}`, { method: "DELETE" });
      if (res.ok) {
        router.refresh();
      } else {
        const json = await res.json();
        alert(json.error || "Delete failed");
      }
    } catch {
      alert("Delete failed");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <button
      onClick={handleDelete}
      disabled={deleting}
      className="rounded-md border border-destructive/50 px-3 py-1.5 text-sm font-medium text-destructive hover:bg-destructive/10 disabled:opacity-50"
    >
      {deleting ? "Deleting…" : "Delete"}
    </button>
  );
}
