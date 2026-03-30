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
}: {
    categories: { id: string; name: string }[];
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
        <form onSubmit={handleSubmit} className="space-y-4">
            <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                    Template Name *
                </label>
                <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g., AI Workshop Solo Landing"
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                    required
                />
            </div>

            <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                    Template Type *
                </label>
                <select
                    value={templateType}
                    onChange={(e) => setTemplateType(e.target.value)}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
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
                <label className="block text-sm font-medium text-foreground mb-1">
                    Category (optional — blank = global)
                </label>
                <select
                    value={categoryId}
                    onChange={(e) => setCategoryId(e.target.value)}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
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
                className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
                {saving ? "Creating..." : "Create Template"}
            </button>
        </form>
    );
}
