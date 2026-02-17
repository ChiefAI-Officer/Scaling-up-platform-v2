"use client";

import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface Workshop {
    id: string;
    title: string;
    workshopCode: string | null;
    eventDate: string;
    followUpStatus: string | null;
}

interface FollowUpFormData {
    workshopId: string;
    implementedTools: string[];
    challenges: string;
    successes: string;
    recommendationScore: number;
    additionalComments: string;
}

const scalingUpTools = [
    "One-Page Strategic Plan",
    "Rockefeller Habits Checklist",
    "Meeting Rhythm",
    "Brand Promise",
    "Core Values",
    "BHAG (Big Hairy Audacious Goal)",
    "Cash Acceleration Strategies",
    "Talent Assessment",
    "Customer Feedback Systems",
];

export default function FollowUpPage() {
    const [workshops, setWorkshops] = useState<Workshop[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [submitted, setSubmitted] = useState(false);
    const [formData, setFormData] = useState<FollowUpFormData>({
        workshopId: "",
        implementedTools: [],
        challenges: "",
        successes: "",
        recommendationScore: 8,
        additionalComments: "",
    });

    useEffect(() => {
        fetch("/api/portal/follow-up")
            .then((res) => res.json())
            .then((data) => {
                if (data.success) {
                    setWorkshops(data.data);
                } else {
                    setError(data.error || "Failed to load workshops");
                }
            })
            .catch(() => setError("Failed to connect to server"))
            .finally(() => setLoading(false));
    }, []);

    const handleToolToggle = (tool: string) => {
        setFormData((prev) => ({
            ...prev,
            implementedTools: prev.implementedTools.includes(tool)
                ? prev.implementedTools.filter((t) => t !== tool)
                : [...prev.implementedTools, tool],
        }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.workshopId) return;

        setSubmitting(true);
        setError(null);

        try {
            const res = await fetch("/api/portal/follow-up", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(formData),
            });

            const data = await res.json();
            if (res.ok && data.success) {
                setSubmitted(true);
            } else {
                setError(data.error || "Failed to submit report");
            }
        } catch {
            setError("Network error. Please try again.");
        } finally {
            setSubmitting(false);
        }
    };

    if (submitted) {
        return (
            <div className="max-w-2xl mx-auto py-8">
                <Card>
                    <CardContent className="pt-8 pb-8 text-center">
                        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                            <span className="text-green-600 text-2xl">&#10003;</span>
                        </div>
                        <h2 className="text-xl font-semibold text-gray-900 mb-2">Thank You!</h2>
                        <p className="text-gray-600 mb-1">Your 90-day follow-up report has been submitted successfully.</p>
                        <p className="text-gray-500 text-sm">This feedback helps us improve our workshops and track progress.</p>
                        <Button
                            className="mt-6"
                            variant="outline"
                            onClick={() => {
                                setSubmitted(false);
                                setFormData({ workshopId: "", implementedTools: [], challenges: "", successes: "", recommendationScore: 8, additionalComments: "" });
                            }}
                        >
                            Submit Another Report
                        </Button>
                    </CardContent>
                </Card>
            </div>
        );
    }

    if (loading) {
        return (
            <div className="max-w-2xl">
                <h1 className="text-2xl font-bold text-gray-900 mb-6">90-Day Follow-Up Report</h1>
                <Card>
                    <CardContent className="py-12 text-center text-gray-500">Loading workshops...</CardContent>
                </Card>
            </div>
        );
    }

    const availableWorkshops = workshops.filter((w) => w.followUpStatus !== "SUBMITTED");

    return (
        <div className="max-w-2xl">
            <h1 className="text-2xl font-bold text-gray-900 mb-6">90-Day Follow-Up Report</h1>

            {error && (
                <div className="mb-4 px-4 py-3 rounded-lg text-sm bg-red-50 text-red-800 border border-red-200">
                    {error}
                </div>
            )}

            {availableWorkshops.length === 0 ? (
                <Card>
                    <CardContent className="py-12 text-center">
                        <p className="text-gray-500">No workshops pending a follow-up report.</p>
                        <p className="text-gray-400 text-sm mt-1">Follow-up reports are available after workshops reach Post-Event or Completed status.</p>
                    </CardContent>
                </Card>
            ) : (
                <form onSubmit={handleSubmit}>
                    <Card className="mb-6">
                        <CardHeader>
                            <CardTitle>Select Workshop</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <select
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                value={formData.workshopId}
                                onChange={(e) => setFormData({ ...formData, workshopId: e.target.value })}
                                required
                            >
                                <option value="">Choose a workshop...</option>
                                {availableWorkshops.map((ws) => (
                                    <option key={ws.id} value={ws.id}>
                                        {ws.title} {ws.workshopCode ? `(${ws.workshopCode})` : ""} — {new Date(ws.eventDate).toLocaleDateString()}
                                    </option>
                                ))}
                            </select>
                        </CardContent>
                    </Card>

                    <Card className="mb-6">
                        <CardHeader>
                            <CardTitle>Which Scaling Up tools have you implemented?</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                {scalingUpTools.map((tool) => (
                                    <label key={tool} className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100">
                                        <input
                                            type="checkbox"
                                            className="rounded border-gray-300"
                                            checked={formData.implementedTools.includes(tool)}
                                            onChange={() => handleToolToggle(tool)}
                                        />
                                        <span className="text-sm text-gray-700">{tool}</span>
                                    </label>
                                ))}
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="mb-6">
                        <CardHeader>
                            <CardTitle>Your Journey</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="space-y-2">
                                <Label>What challenges have you faced implementing these tools?</Label>
                                <Textarea
                                    value={formData.challenges}
                                    onChange={(e) => setFormData({ ...formData, challenges: e.target.value })}
                                    placeholder="Describe any obstacles or difficulties..."
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>What successes have you experienced?</Label>
                                <Textarea
                                    value={formData.successes}
                                    onChange={(e) => setFormData({ ...formData, successes: e.target.value })}
                                    placeholder="Share your wins and achievements..."
                                />
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="mb-6">
                        <CardHeader>
                            <CardTitle>How likely are you to recommend this workshop? (NPS)</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="flex items-center gap-4">
                                <span className="text-sm text-gray-500">0</span>
                                <input
                                    type="range"
                                    min="0"
                                    max="10"
                                    className="flex-1"
                                    value={formData.recommendationScore}
                                    onChange={(e) => setFormData({ ...formData, recommendationScore: parseInt(e.target.value) })}
                                    aria-label="Recommendation score from 0 to 10"
                                />
                                <span className="text-sm text-gray-500">10</span>
                                <span className="text-2xl font-bold text-blue-600 min-w-[3rem] text-center">{formData.recommendationScore}</span>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="mb-6">
                        <CardContent className="pt-6 space-y-2">
                            <Label>Additional Comments</Label>
                            <Textarea
                                value={formData.additionalComments}
                                onChange={(e) => setFormData({ ...formData, additionalComments: e.target.value })}
                                placeholder="Any other feedback or suggestions..."
                            />
                        </CardContent>
                    </Card>

                    <Button type="submit" disabled={submitting || !formData.workshopId} className="w-full sm:w-auto">
                        {submitting ? "Submitting..." : "Submit Follow-Up Report"}
                    </Button>
                </form>
            )}
        </div>
    );
}
