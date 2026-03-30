"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/use-toast";

interface PageTemplateToggleProps {
  templateId: string;
  isActive: boolean;
}

export function PageTemplateToggle({ templateId, isActive }: PageTemplateToggleProps) {
  const [active, setActive] = useState(isActive);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const router = useRouter();

  const handleToggle = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/page-templates/${templateId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !active }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error((json as { error?: string }).error || "Failed to update");
      }
      setActive(!active);
      router.refresh();
      toast({
        title: active ? "Template deactivated" : "Template activated",
        description: active
          ? "This template will no longer be used for auto-build."
          : "This template is now active for auto-build.",
      });
    } catch (err) {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Failed to update template status",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleToggle}
      disabled={loading}
      className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium transition-all disabled:opacity-50 ${
        active
          ? "bg-success text-white hover:bg-success/90 shadow-sm"
          : "border border-primary text-primary hover:bg-primary hover:text-primary-foreground"
      }`}
      title={active ? "Click to deactivate template" : "Click to activate template for auto-build"}
    >
      {loading ? (
        <svg className="animate-spin h-3.5 w-3.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
      ) : active ? (
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
      ) : null}
      {loading ? "..." : active ? "Active" : "Set Active"}
    </button>
  );
}
