"use client";

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";

interface Category {
    id: string;
    name: string;
}

interface PricingTier {
    id: string;
    name: string;
    amountCents: number;
    description: string | null;
    isActive: boolean;
    categoryId: string;
    category: { id: string; name: string };
    _count: { workshops: number };
}

function formatPrice(cents: number): string {
    return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
    }).format(cents / 100);
}

export default function PricingTiersPage() {
    const [tiers, setTiers] = useState<PricingTier[]>([]);
    const [categories, setCategories] = useState<Category[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [filterCategory, setFilterCategory] = useState<string>("ALL");

    // Form state
    const [showForm, setShowForm] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [formCategoryId, setFormCategoryId] = useState("");
    const [formName, setFormName] = useState("");
    const [formAmount, setFormAmount] = useState("");
    const [formDescription, setFormDescription] = useState("");
    const [formSaving, setFormSaving] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);

    const loadData = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const [tiersRes, catsRes] = await Promise.all([
                fetch("/api/pricing-tiers?all=true", { cache: "no-store" }),
                fetch("/api/categories?all=true", { cache: "no-store" }),
            ]);

            if (!tiersRes.ok) throw new Error("Failed to load pricing tiers");
            if (!catsRes.ok) throw new Error("Failed to load categories");

            const tiersData = await tiersRes.json();
            const catsData = await catsRes.json();

            setTiers(Array.isArray(tiersData) ? tiersData : []);
            setCategories(Array.isArray(catsData) ? catsData : []);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to load");
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        void loadData();
    }, [loadData]);

    const filteredTiers =
        filterCategory === "ALL"
            ? tiers
            : tiers.filter((t) => t.categoryId === filterCategory);

    function openCreate() {
        setEditingId(null);
        setFormCategoryId(categories[0]?.id || "");
        setFormName("");
        setFormAmount("");
        setFormDescription("");
        setFormError(null);
        setShowForm(true);
    }

    function openEdit(tier: PricingTier) {
        setEditingId(tier.id);
        setFormCategoryId(tier.categoryId);
        setFormName(tier.name);
        setFormAmount((tier.amountCents / 100).toFixed(2));
        setFormDescription(tier.description || "");
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
        if (!formCategoryId) {
            setFormError("Category is required");
            return;
        }

        const dollars = parseFloat(formAmount);
        if (isNaN(dollars) || dollars < 0) {
            setFormError("Amount must be a valid non-negative number");
            return;
        }

        setFormSaving(true);
        setFormError(null);

        try {
            const url = editingId
                ? `/api/pricing-tiers/${editingId}`
                : "/api/pricing-tiers";
            const method = editingId ? "PATCH" : "POST";

            const body: Record<string, unknown> = {
                name: formName.trim(),
                amountCents: Math.round(dollars * 100),
                description: formDescription.trim() || null,
            };
            if (!editingId) {
                body.categoryId = formCategoryId;
            }

            const res = await fetch(url, {
                method,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Save failed");

            closeForm();
            await loadData();
        } catch (err) {
            setFormError(err instanceof Error ? err.message : "Save failed");
        } finally {
            setFormSaving(false);
        }
    }

    async function handleToggleActive(tier: PricingTier) {
        try {
            const res = await fetch(`/api/pricing-tiers/${tier.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ isActive: !tier.isActive }),
            });
            if (!res.ok) {
                const data = await res.json();
                alert(data.error || "Failed to update");
                return;
            }
            await loadData();
        } catch {
            alert("Failed to update pricing tier");
        }
    }

    async function handleDelete(tier: PricingTier) {
        if (!confirm(`Delete "${tier.name}" (${formatPrice(tier.amountCents)})? This cannot be undone.`)) return;

        try {
            const res = await fetch(`/api/pricing-tiers/${tier.id}`, { method: "DELETE" });
            const data = await res.json();
            if (!res.ok) {
                alert(data.error || "Delete failed");
                return;
            }
            await loadData();
        } catch {
            alert("Failed to delete pricing tier");
        }
    }

    return (
        <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
        >
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h2 className="text-2xl font-bold text-purple-900">Pricing Tiers</h2>
                    <p className="text-sm text-gray-600 mt-1">
                        Manage pricing options that appear in the workshop request wizard.
                    </p>
                </div>
                <button
                    onClick={openCreate}
                    disabled={categories.length === 0}
                    className="px-4 py-2 bg-purple-700 text-white rounded-lg hover:bg-purple-800 font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                    title={categories.length === 0 ? "Create a category first" : ""}
                >
                    + Add Pricing Tier
                </button>
            </div>

            {/* Category Filter */}
            {categories.length > 0 && (
                <div className="flex gap-2 mb-4 flex-wrap">
                    <button
                        onClick={() => setFilterCategory("ALL")}
                        className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                            filterCategory === "ALL"
                                ? "bg-purple-700 text-white border-purple-700"
                                : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                        }`}
                    >
                        All Categories
                    </button>
                    {categories.map((cat) => (
                        <button
                            key={cat.id}
                            onClick={() => setFilterCategory(cat.id)}
                            className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                                filterCategory === cat.id
                                    ? "bg-purple-700 text-white border-purple-700"
                                    : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                            }`}
                        >
                            {cat.name}
                        </button>
                    ))}
                </div>
            )}

            {/* Create/Edit Form */}
            {showForm && (
                <div className="bg-white rounded-xl shadow-sm border p-6 mb-6">
                    <h3 className="font-semibold text-lg mb-4">
                        {editingId ? "Edit Pricing Tier" : "New Pricing Tier"}
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Category <span className="text-red-500">*</span>
                            </label>
                            <select
                                value={formCategoryId}
                                onChange={(e) => setFormCategoryId(e.target.value)}
                                disabled={!!editingId}
                                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 disabled:bg-gray-100"
                            >
                                <option value="">Select category...</option>
                                {categories.map((cat) => (
                                    <option key={cat.id} value={cat.id}>
                                        {cat.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Name <span className="text-red-500">*</span>
                            </label>
                            <input
                                type="text"
                                value={formName}
                                onChange={(e) => setFormName(e.target.value)}
                                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                                placeholder="e.g. Standard, Premium, Enterprise"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Price (USD) <span className="text-red-500">*</span>
                            </label>
                            <div className="relative">
                                <span className="absolute left-3 top-2 text-gray-500">$</span>
                                <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    value={formAmount}
                                    onChange={(e) => setFormAmount(e.target.value)}
                                    className="w-full pl-7 pr-3 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                                    placeholder="0.00"
                                />
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Description
                            </label>
                            <input
                                type="text"
                                value={formDescription}
                                onChange={(e) => setFormDescription(e.target.value)}
                                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                                placeholder="Optional description"
                            />
                        </div>
                    </div>
                    {formError && (
                        <p className="text-sm text-red-600 mt-3">{formError}</p>
                    )}
                    <div className="flex gap-3 mt-4">
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
            )}

            {/* Pricing Tiers List */}
            {isLoading ? (
                <div className="bg-white rounded-xl shadow-sm p-8 text-center text-gray-500">
                    Loading pricing tiers...
                </div>
            ) : error ? (
                <div className="bg-white rounded-xl shadow-sm p-8 text-center text-red-600">
                    {error}
                </div>
            ) : filteredTiers.length === 0 ? (
                <div className="bg-white rounded-xl shadow-sm p-8 text-center text-gray-500">
                    {categories.length === 0
                        ? "Create categories first, then add pricing tiers."
                        : "No pricing tiers found. Click \"+ Add Pricing Tier\" to create one."}
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
                                    Category
                                </th>
                                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                                    Price
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
                            {filteredTiers.map((tier) => (
                                <tr key={tier.id} className={!tier.isActive ? "bg-gray-50 opacity-60" : ""}>
                                    <td className="px-6 py-4">
                                        <div className="font-medium text-gray-900">{tier.name}</div>
                                        {tier.description && (
                                            <div className="text-sm text-gray-500 mt-0.5">
                                                {tier.description}
                                            </div>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 text-sm text-gray-700">
                                        {tier.category.name}
                                    </td>
                                    <td className="px-6 py-4 text-sm text-gray-900 text-right font-medium">
                                        {formatPrice(tier.amountCents)}
                                    </td>
                                    <td className="px-6 py-4 text-sm text-gray-900">
                                        {tier._count.workshops}
                                    </td>
                                    <td className="px-6 py-4">
                                        <button
                                            onClick={() => handleToggleActive(tier)}
                                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium cursor-pointer ${
                                                tier.isActive
                                                    ? "bg-green-100 text-green-800 hover:bg-green-200"
                                                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                                            }`}
                                        >
                                            {tier.isActive ? "Active" : "Inactive"}
                                        </button>
                                    </td>
                                    <td className="px-6 py-4 text-right text-sm space-x-3">
                                        <button
                                            onClick={() => openEdit(tier)}
                                            className="text-purple-600 hover:text-purple-800 font-medium"
                                        >
                                            Edit
                                        </button>
                                        {tier._count.workshops === 0 && (
                                            <button
                                                onClick={() => handleDelete(tier)}
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
        </motion.div>
    );
}
