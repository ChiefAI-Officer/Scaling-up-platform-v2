"use client";

import { useCallback, useEffect, useState } from "react";

interface Category {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    isActive: boolean;
    _count: { workshops: number };
    pricingTiers: { id: string; name: string; amountCents: number; isActive: boolean }[];
}

export default function CategoriesPage() {
    const [categories, setCategories] = useState<Category[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Form state
    const [showForm, setShowForm] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [formName, setFormName] = useState("");
    const [formDescription, setFormDescription] = useState("");
    const [formSaving, setFormSaving] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);

    const loadCategories = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const res = await fetch("/api/categories?all=true", { cache: "no-store" });
            if (!res.ok) throw new Error("Failed to load categories");
            const data = await res.json();
            setCategories(Array.isArray(data) ? data : []);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to load");
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        void loadCategories();
    }, [loadCategories]);

    function openCreate() {
        setEditingId(null);
        setFormName("");
        setFormDescription("");
        setFormError(null);
        setShowForm(true);
    }

    function openEdit(cat: Category) {
        setEditingId(cat.id);
        setFormName(cat.name);
        setFormDescription(cat.description || "");
        setFormError(null);
        setShowForm(true);
    }

    function closeForm() {
        setShowForm(false);
        setEditingId(null);
        setFormError(null);
    }

    async function handleSave() {
        if (!formName.trim()) {
            setFormError("Name is required");
            return;
        }

        setFormSaving(true);
        setFormError(null);

        try {
            const url = editingId ? `/api/categories/${editingId}` : "/api/categories";
            const method = editingId ? "PATCH" : "POST";

            const res = await fetch(url, {
                method,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: formName.trim(),
                    description: formDescription.trim() || null,
                }),
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Save failed");

            closeForm();
            await loadCategories();
        } catch (err) {
            setFormError(err instanceof Error ? err.message : "Save failed");
        } finally {
            setFormSaving(false);
        }
    }

    async function handleToggleActive(cat: Category) {
        try {
            const res = await fetch(`/api/categories/${cat.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ isActive: !cat.isActive }),
            });
            if (!res.ok) {
                const data = await res.json();
                alert(data.error || "Failed to update");
                return;
            }
            await loadCategories();
        } catch {
            alert("Failed to update category");
        }
    }

    async function handleDelete(cat: Category) {
        if (!confirm(`Delete "${cat.name}"? This cannot be undone.`)) return;

        try {
            const res = await fetch(`/api/categories/${cat.id}`, { method: "DELETE" });
            const data = await res.json();
            if (!res.ok) {
                alert(data.error || "Delete failed");
                return;
            }
            await loadCategories();
        } catch {
            alert("Failed to delete category");
        }
    }

    return (
        <div>
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h2 className="text-2xl font-bold text-purple-900">Workshop Categories</h2>
                    <p className="text-sm text-gray-600 mt-1">
                        Manage workshop categories that coaches select when creating workshops.
                    </p>
                </div>
                <button
                    onClick={openCreate}
                    className="px-4 py-2 bg-purple-700 text-white rounded-lg hover:bg-purple-800 font-medium text-sm"
                >
                    + Add Category
                </button>
            </div>

            {/* Create/Edit Form */}
            {showForm && (
                <div className="bg-white rounded-xl shadow-sm border p-6 mb-6">
                    <h3 className="font-semibold text-lg mb-4">
                        {editingId ? "Edit Category" : "New Category"}
                    </h3>
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Name <span className="text-red-500">*</span>
                            </label>
                            <input
                                type="text"
                                value={formName}
                                onChange={(e) => setFormName(e.target.value)}
                                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                                placeholder="e.g. Master Class, Growth Summit"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Description
                            </label>
                            <textarea
                                value={formDescription}
                                onChange={(e) => setFormDescription(e.target.value)}
                                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                                rows={2}
                                placeholder="Optional description"
                            />
                        </div>
                        {formError && (
                            <p className="text-sm text-red-600">{formError}</p>
                        )}
                        <div className="flex gap-3">
                            <button
                                onClick={handleSave}
                                disabled={formSaving}
                                className="px-4 py-2 bg-purple-700 text-white rounded-lg hover:bg-purple-800 font-medium text-sm disabled:opacity-50"
                            >
                                {formSaving ? "Saving..." : editingId ? "Update" : "Create"}
                            </button>
                            <button
                                onClick={closeForm}
                                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 font-medium text-sm"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Category List */}
            {isLoading ? (
                <div className="bg-white rounded-xl shadow-sm p-8 text-center text-gray-500">
                    Loading categories...
                </div>
            ) : error ? (
                <div className="bg-white rounded-xl shadow-sm p-8 text-center text-red-600">
                    {error}
                </div>
            ) : categories.length === 0 ? (
                <div className="bg-white rounded-xl shadow-sm p-8 text-center text-gray-500">
                    No categories yet. Click &quot;+ Add Category&quot; to create one.
                </div>
            ) : (
                <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                                    Name
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                                    Slug
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                                    Pricing Tiers
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                                    Workshops
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                                    Status
                                </th>
                                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                                    Actions
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                            {categories.map((cat) => (
                                <tr key={cat.id} className={!cat.isActive ? "bg-gray-50 opacity-60" : ""}>
                                    <td className="px-6 py-4">
                                        <div className="font-medium text-gray-900">{cat.name}</div>
                                        {cat.description && (
                                            <div className="text-sm text-gray-500 mt-0.5">{cat.description}</div>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 text-sm text-gray-500 font-mono">
                                        {cat.slug}
                                    </td>
                                    <td className="px-6 py-4 text-sm text-gray-900">
                                        {cat.pricingTiers.length}
                                    </td>
                                    <td className="px-6 py-4 text-sm text-gray-900">
                                        {cat._count.workshops}
                                    </td>
                                    <td className="px-6 py-4">
                                        <button
                                            onClick={() => handleToggleActive(cat)}
                                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium cursor-pointer ${
                                                cat.isActive
                                                    ? "bg-green-100 text-green-800 hover:bg-green-200"
                                                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                                            }`}
                                        >
                                            {cat.isActive ? "Active" : "Inactive"}
                                        </button>
                                    </td>
                                    <td className="px-6 py-4 text-right text-sm space-x-3">
                                        <button
                                            onClick={() => openEdit(cat)}
                                            className="text-purple-600 hover:text-purple-800 font-medium"
                                        >
                                            Edit
                                        </button>
                                        {cat._count.workshops === 0 && (
                                            <button
                                                onClick={() => handleDelete(cat)}
                                                className="text-red-600 hover:text-red-800 font-medium"
                                            >
                                                Delete
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
