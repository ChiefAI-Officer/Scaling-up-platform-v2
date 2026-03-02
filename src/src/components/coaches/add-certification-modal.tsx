"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

interface WorkshopType {
    id: string;
    name: string;
    slug: string;
}

interface AddCertificationModalProps {
    coachId: string;
    existingWorkshopTypeIds: string[];
}

export function AddCertificationModal({ coachId, existingWorkshopTypeIds }: AddCertificationModalProps) {
    const router = useRouter();
    const [isOpen, setIsOpen] = useState(false);
    const [workshopTypes, setWorkshopTypes] = useState<WorkshopType[]>([]);
    const [selectedTypeId, setSelectedTypeId] = useState("");
    const [expiresAt, setExpiresAt] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    // Load available workshop types when modal opens
    useEffect(() => {
        if (!isOpen || workshopTypes.length > 0) return;
        async function loadTypes() {
            try {
                const res = await fetch("/api/workshop-types");
                if (res.ok) {
                    const data = await res.json();
                    setWorkshopTypes(data.data || []);
                }
            } catch {
                // Will be populated by the parent if this fails
            }
        }
        loadTypes();
    }, []);

    const availableTypes = workshopTypes.filter(
        (wt) => !existingWorkshopTypeIds.includes(wt.id)
    );

    async function handleSubmit() {
        if (!selectedTypeId) {
            setError("Please select a workshop type");
            return;
        }

        setLoading(true);
        setError("");

        try {
            const res = await fetch(`/api/coaches/${coachId}/certifications`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    workshopTypeId: selectedTypeId,
                    ...(expiresAt ? { expiresAt } : {}),
                }),
            });

            if (!res.ok) {
                const data = await res.json();
                setError(data.error || "Failed to add certification");
                return;
            }

            setIsOpen(false);
            setSelectedTypeId("");
            setExpiresAt("");
            router.refresh();
        } catch {
            setError("Network error — please try again");
        } finally {
            setLoading(false);
        }
    }

    return (
        <>
            <button
                onClick={() => setIsOpen(true)}
                className="block w-full text-center bg-success/10 text-success px-4 py-2 rounded-lg hover:bg-success/20 transition-colors text-sm font-medium cursor-pointer border border-success/20"
            >
                + Add Certification
            </button>

            {isOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center">
                    <div
                        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                        onClick={() => setIsOpen(false)}
                    />
                    <div className="relative bg-card rounded-2xl shadow-xl max-w-md w-full mx-4 animate-in fade-in zoom-in-95 duration-200">
                        <button
                            onClick={() => setIsOpen(false)}
                            className="absolute top-4 right-4 rounded-full p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-all duration-200 cursor-pointer"
                        >
                            <X className="w-4 h-4" />
                        </button>

                        <div className="p-6">
                            <h3 className="text-lg font-semibold text-foreground mb-4">
                                Grant Workshop Certification
                            </h3>

                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-foreground mb-1">
                                        Workshop Type *
                                    </label>
                                    {availableTypes.length === 0 ? (
                                        <p className="text-sm text-muted-foreground">
                                            {workshopTypes.length === 0
                                                ? "Loading workshop types..."
                                                : "Coach is already certified for all workshop types"}
                                        </p>
                                    ) : (
                                        <select
                                            value={selectedTypeId}
                                            onChange={(e) => setSelectedTypeId(e.target.value)}
                                            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                                        >
                                            <option value="">Select a workshop type</option>
                                            {availableTypes.map((wt) => (
                                                <option key={wt.id} value={wt.id}>
                                                    {wt.name}
                                                </option>
                                            ))}
                                        </select>
                                    )}
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-foreground mb-1">
                                        Expiration Date (optional)
                                    </label>
                                    <input
                                        type="date"
                                        value={expiresAt}
                                        onChange={(e) => setExpiresAt(e.target.value)}
                                        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                                    />
                                </div>

                                {error && (
                                    <p className="text-sm text-destructive">{error}</p>
                                )}
                            </div>

                            <div className="mt-6 flex justify-end gap-3">
                                <Button variant="outline" onClick={() => setIsOpen(false)} disabled={loading}>
                                    Cancel
                                </Button>
                                <Button
                                    onClick={handleSubmit}
                                    disabled={loading || !selectedTypeId}
                                >
                                    {loading ? "Granting..." : "Grant Certification"}
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
