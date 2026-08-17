"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ResponsiveActionsItem } from "@/components/ui/responsive-actions-menu";

interface Props {
  templateId: string;
  templateName: string;
  surveyCount: number;
  responsiveEnabled?: boolean;
  menuItem?: boolean;
}

export function DeleteSurveyTemplateButton({ templateId, templateName, surveyCount, responsiveEnabled = false, menuItem = false }: Props) {
  const [deleting, setDeleting] = useState(false);
  const router = useRouter();

  async function handleDelete() {
    const warning = surveyCount > 0
      ? `"${templateName}" has ${surveyCount} linked survey record(s). Deleting it will archive the template and preserve historical responses. Continue?`
      : `Delete survey template "${templateName}"? This cannot be undone.`;
    if (!confirm(warning)) return;

    setDeleting(true);
    try {
      const res = await fetch(`/api/survey-templates/${templateId}`, { method: "DELETE" });
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

  const button = (
    <button
      onClick={handleDelete}
      disabled={deleting}
      className={responsiveEnabled ? "flex min-h-11 w-full items-center rounded-md px-3 text-sm font-medium text-destructive outline-none hover:bg-accent hover:text-destructive/80 disabled:opacity-50" : "text-sm font-medium text-destructive hover:text-destructive/80 disabled:opacity-50"}
    >
      {deleting ? "Deleting…" : "Delete"}
    </button>
  );

  return menuItem ? <ResponsiveActionsItem asChild>{button}</ResponsiveActionsItem> : button;
}
