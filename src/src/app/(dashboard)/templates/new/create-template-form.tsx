"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const TEMPLATE_TYPES = [
    { value: "BIO_PAGE", label: "Bio Page" },
    { value: "SOLO_LANDING", label: "Solo Landing" },
    { value: "DUO_LANDING", label: "Duo Landing" },
    { value: "REGISTRATION", label: "Registration" },
    { value: "THANK_YOU", label: "Thank You" },
];

export function CreateTemplateForm({
    categories,
    responsiveEnabled = false,
}: {
    categories: { id: string; name: string }[];
    responsiveEnabled?: boolean;
}) {
    const router = useRouter();
    const [name, setName] = useState("");
    const [templateType, setTemplateType] = useState("");
    const [categoryId, setCategoryId] = useState("");
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name || !templateType) {
            setError("Name and template type are required");
            return;
        }

        setSaving(true);
        setError("");

        const res = await fetch("/api/page-templates", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                name,
                templateType,
                categoryId: categoryId || null,
            }),
        });

        const data = await res.json();
        if (data.success) {
            router.push(`/templates/${data.data.id}/edit`);
        } else {
            setError(data.error || "Failed to create template");
            setSaving(false);
        }
    };

    return (
        <form
            onSubmit={handleSubmit}
            aria-label={responsiveEnabled ? "Create template" : undefined}
            className={responsiveEnabled ? "min-w-0 space-y-4" : "space-y-4"}
        >
            <div>
                <label htmlFor={responsiveEnabled ? "templateName" : undefined} className="block text-sm font-medium text-foreground mb-1">
                    Template Name *
                </label>
                <input
                    id={responsiveEnabled ? "templateName" : undefined}
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g., AI Workshop Solo Landing"
                    className={responsiveEnabled ? "min-h-11 min-w-0 max-w-full w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" : "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"}
                    required
                />
            </div>

            <div>
                <label htmlFor={responsiveEnabled ? "templateType" : undefined} className="block text-sm font-medium text-foreground mb-1">
                    Template Type *
                </label>
                <select
                    id={responsiveEnabled ? "templateType" : undefined}
                    value={templateType}
                    onChange={(e) => setTemplateType(e.target.value)}
                    className={responsiveEnabled ? "min-h-11 min-w-0 max-w-full w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" : "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"}
                    required
                >
                    <option value="">Select type...</option>
                    {TEMPLATE_TYPES.map((t) => (
                        <option key={t.value} value={t.value}>
                            {t.label}
                        </option>
                    ))}
                </select>
            </div>

            <div>
                <label htmlFor={responsiveEnabled ? "templateCategory" : undefined} className="block text-sm font-medium text-foreground mb-1">
                    Category (optional — blank = global)
                </label>
                <select
                    id={responsiveEnabled ? "templateCategory" : undefined}
                    value={categoryId}
                    onChange={(e) => setCategoryId(e.target.value)}
                    className={responsiveEnabled ? "min-h-11 min-w-0 max-w-full w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" : "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"}
                >
                    <option value="">Global (all categories)</option>
                    {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                            {c.name}
                        </option>
                    ))}
                </select>
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <button
                type="submit"
                disabled={saving}
                className={responsiveEnabled ? "min-h-11 w-full rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 sm:w-auto" : "rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"}
            >
                {saving ? "Creating..." : "Create Template"}
            </button>
        </form>
    );
}
