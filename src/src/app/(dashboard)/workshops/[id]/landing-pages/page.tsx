"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface Workshop {
    id: string;
    title: string;
    workshopCode: string | null;
    coach: {
        id: string;
        firstName: string;
        lastName: string;
    };
    landingPages: Array<{
        id: string;
        template: string;
        status: string;
        slug: string;
    }>;
}

interface TemplateLibraryItem {
    id: string;
    template: string;
    status: string;
    slug: string;
    createdAt: string;
    workshopId: string;
    workshopTitle: string;
}

type PageTab = "LANDING" | "REGISTRATION" | "THANK_YOU";

const PAGE_TABS: { value: PageTab; label: string; description: string }[] = [
    {
        value: "LANDING",
        label: "Landing Pages",
        description: "Workshop landing pages for marketing and registration",
    },
    {
        value: "REGISTRATION",
        label: "Registration / Payment",
        description: "Registration form sub-page linked from landing pages",
    },
    {
        value: "THANK_YOU",
        label: "Thank You",
        description: "Post-registration confirmation with video",
    },
];

const LANDING_TEMPLATES = [
    {
        value: "SOLO_LANDING",
        label: "Solo Landing Page",
        description: "Single coach workshop (Exit & Valuation)",
        icon: "📄",
        editPath: "solo-landing",
    },
    {
        value: "DUO_LANDING",
        label: "Duo Workshop Landing Page",
        description: "Two-coach AI Workshop landing page",
        icon: "👥",
        editPath: "duo-landing",
    },
];

export default function WorkshopEditorPage() {
    const params = useParams();
    const router = useRouter();
    const workshopId = params.id as string;

    const [workshop, setWorkshop] = useState<Workshop | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<PageTab>("LANDING");

    // Template library state
    const [libraryItems, setLibraryItems] = useState<TemplateLibraryItem[]>([]);
    const [libraryLoading, setLibraryLoading] = useState(false);
    const [selectedSourceId, setSelectedSourceId] = useState("");
    const [copyTarget, setCopyTarget] = useState<string | null>(null);
    const [copying, setCopying] = useState(false);
    const [copyMessage, setCopyMessage] = useState<string | null>(null);

    useEffect(() => {
        async function loadWorkshop() {
            try {
                const res = await fetch(`/api/workshops/${workshopId}`);
                const data = await res.json();
                if (data.success) {
                    setWorkshop(data.data);
                } else {
                    setError(data.error || "Failed to load workshop");
                }
            } catch {
                setError("Failed to load workshop");
            } finally {
                setLoading(false);
            }
        }
        loadWorkshop();
    }, [workshopId]);

    function getPageStatus(template: string) {
        const page = workshop?.landingPages?.find((p) => p.template === template);
        if (!page) return { status: "NOT_CREATED", label: "Not Created", slug: null };
        if (page.status === "PUBLISHED") return { status: "PUBLISHED", label: "Published", slug: page.slug };
        return { status: "DRAFT", label: "Draft", slug: page.slug };
    }

    function statusBadgeVariant(status: string): "default" | "secondary" | "outline" {
        if (status === "PUBLISHED") return "default";
        if (status === "DRAFT") return "outline";
        return "secondary";
    }

    // Load template library when opening copy panel
    async function loadLibrary(template: string) {
        setCopyTarget(template);
        setLibraryLoading(true);
        setCopyMessage(null);
        setSelectedSourceId("");
        try {
            const res = await fetch(`/api/landing-pages/library?template=${template}`);
            const data = await res.json();
            setLibraryItems(data.success ? data.data || [] : []);
        } catch {
            setLibraryItems([]);
        } finally {
            setLibraryLoading(false);
        }
    }

    async function handleCopyTemplate() {
        if (!copyTarget || !selectedSourceId) return;
        setCopying(true);
        setCopyMessage(null);
        try {
            const res = await fetch("/api/landing-pages/library", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    targetWorkshopId: workshopId,
                    targetTemplate: copyTarget,
                    sourceLandingPageId: selectedSourceId,
                }),
            });
            const data = await res.json();
            if (!data.success) throw new Error(data.error || "Copy failed");

            setCopyMessage("Content copied successfully. You can now edit the page.");
            // Update local state
            setWorkshop((prev) => {
                if (!prev) return prev;
                const existing = prev.landingPages.find((p) => p.template === copyTarget);
                if (existing) {
                    return {
                        ...prev,
                        landingPages: prev.landingPages.map((p) =>
                            p.template === copyTarget ? { ...p, status: "DRAFT" } : p
                        ),
                    };
                }
                return {
                    ...prev,
                    landingPages: [
                        ...prev.landingPages,
                        { id: data.data.id, template: copyTarget!, status: "DRAFT", slug: data.data.slug || "" },
                    ],
                };
            });
        } catch (err) {
            setCopyMessage(err instanceof Error ? err.message : "Copy failed");
        } finally {
            setCopying(false);
        }
    }

    const formatDate = (value: string) =>
        new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

    if (loading) {
        return <div className="flex items-center justify-center min-h-[400px] text-muted-foreground">Loading...</div>;
    }

    if (error || !workshop) {
        return (
            <div className="max-w-4xl mx-auto">
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
                    {error || "Workshop not found"}
                </div>
            </div>
        );
    }

    // Determine which templates to show based on active tab
    function renderTabContent() {
        if (activeTab === "LANDING") {
            return (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {LANDING_TEMPLATES.map((tpl) => {
                        const info = getPageStatus(tpl.value);
                        return (
                            <Card key={tpl.value} className="hover:shadow-md transition-shadow">
                                <CardContent className="pt-6">
                                    <div className="text-center mb-4">
                                        <span className="text-3xl">{tpl.icon}</span>
                                        <h3 className="font-semibold mt-2">{tpl.label}</h3>
                                        <p className="text-sm text-muted-foreground mt-1">{tpl.description}</p>
                                    </div>

                                    <div className="flex justify-center mb-4">
                                        <Badge variant={statusBadgeVariant(info.status)}>
                                            {info.label}
                                        </Badge>
                                    </div>

                                    <div className="space-y-2">
                                        <Button
                                            className="w-full"
                                            onClick={() => router.push(`/workshops/${workshopId}/landing-pages/${tpl.editPath}`)}
                                        >
                                            {info.status === "NOT_CREATED" ? "Create Page" : "Edit Page"}
                                        </Button>

                                        <div className="flex gap-2">
                                            {info.slug && (
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    className="flex-1 text-xs"
                                                    onClick={() => window.open(`/workshop/${info.slug}`, "_blank")}
                                                >
                                                    Preview
                                                </Button>
                                            )}
                                            {["SOLO_LANDING", "DUO_LANDING"].includes(tpl.value) && (
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    className="flex-1 text-xs"
                                                    onClick={() => loadLibrary(tpl.value)}
                                                >
                                                    Copy from...
                                                </Button>
                                            )}
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        );
                    })}
                </div>
            );
        }

        // Registration or Thank You — single page type
        const template = activeTab === "REGISTRATION" ? "REGISTRATION" : "THANK_YOU";
        const editPath = activeTab === "REGISTRATION" ? "registration" : "thank-you";
        const info = getPageStatus(template);

        return (
            <Card>
                <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                        <div>
                            <h3 className="font-semibold text-lg">
                                {activeTab === "REGISTRATION" ? "Registration / Payment Page" : "Thank You Page"}
                            </h3>
                            <p className="text-sm text-muted-foreground mt-1">
                                {activeTab === "REGISTRATION"
                                    ? "The form page visitors see when they click \"Register Here\" on the landing page."
                                    : "Confirmation page shown after successful registration, with optional video and calendar links."}
                            </p>
                            <div className="mt-2">
                                <Badge variant={statusBadgeVariant(info.status)}>
                                    {info.label}
                                </Badge>
                            </div>
                        </div>
                        <div className="flex gap-2">
                            {info.slug && (
                                <Button
                                    variant="outline"
                                    onClick={() => window.open(`/workshop/${info.slug}`, "_blank")}
                                >
                                    Preview
                                </Button>
                            )}
                            <Button onClick={() => router.push(`/workshops/${workshopId}/landing-pages/${editPath}`)}>
                                {info.status === "NOT_CREATED" ? "Create Page" : "Edit Page"}
                            </Button>
                        </div>
                    </div>

                    {activeTab === "REGISTRATION" && (
                        <div className="mt-4 pt-4 border-t">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => loadLibrary("REGISTRATION")}
                            >
                                Copy content from another workshop...
                            </Button>
                        </div>
                    )}
                </CardContent>
            </Card>
        );
    }

    return (
        <div className="max-w-5xl mx-auto">
            {/* Breadcrumb */}
            <div className="mb-6">
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                    <Link href="/workshops" className="hover:text-foreground">Workshops</Link>
                    <span>/</span>
                    <Link href={`/workshops/${workshopId}`} className="hover:text-foreground">{workshop.title}</Link>
                    <span>/</span>
                    <span className="text-foreground">Workshop Editor</span>
                </div>
                <h1 className="text-2xl font-bold text-foreground">Workshop Editor</h1>
                <p className="text-muted-foreground">
                    Manage pages for <strong>{workshop.title}</strong>
                    {workshop.workshopCode && <span className="text-muted-foreground ml-2">({workshop.workshopCode})</span>}
                </p>
            </div>

            {/* Page Type Tabs */}
            <div className="border-b mb-6">
                <nav className="flex gap-1">
                    {PAGE_TABS.map((tab) => (
                        <button
                            key={tab.value}
                            onClick={() => { setActiveTab(tab.value); setCopyTarget(null); setCopyMessage(null); }}
                            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                                activeTab === tab.value
                                    ? "border-blue-600 text-blue-600"
                                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
                            }`}
                        >
                            {tab.label}
                        </button>
                    ))}
                </nav>
            </div>

            {/* Tab description */}
            <p className="text-sm text-muted-foreground mb-4">
                {PAGE_TABS.find((t) => t.value === activeTab)?.description}
            </p>

            {/* Tab Content */}
            {renderTabContent()}

            {/* Template Library Panel (shown when "Copy from..." is clicked) */}
            {copyTarget && (
                <Card className="mt-6">
                    <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                            <CardTitle className="text-base">Copy Content from Existing Page</CardTitle>
                            <Button variant="ghost" size="sm" onClick={() => { setCopyTarget(null); setCopyMessage(null); }}>
                                Close
                            </Button>
                        </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        {libraryLoading ? (
                            <p className="text-sm text-muted-foreground">Loading available pages...</p>
                        ) : libraryItems.length === 0 ? (
                            <p className="text-sm text-muted-foreground">No existing pages of this type found to copy from.</p>
                        ) : (
                            <>
                                <select
                                    value={selectedSourceId}
                                    onChange={(e) => setSelectedSourceId(e.target.value)}
                                    className="w-full rounded-md border border-border px-3 py-2 text-sm"
                                >
                                    <option value="">Select a page to copy from...</option>
                                    {libraryItems.map((item) => (
                                        <option key={item.id} value={item.id}>
                                            {item.workshopTitle} ({formatDate(item.createdAt)})
                                        </option>
                                    ))}
                                </select>

                                <div className="flex items-center gap-3">
                                    <Button
                                        onClick={handleCopyTemplate}
                                        disabled={!selectedSourceId || copying}
                                        size="sm"
                                    >
                                        {copying ? "Copying..." : "Apply Template"}
                                    </Button>
                                    <span className="text-xs text-muted-foreground">
                                        This copies content as a draft. You can edit it afterward.
                                    </span>
                                </div>
                            </>
                        )}

                        {copyMessage && (
                            <div className={`text-sm px-3 py-2 rounded-md border ${
                                copyMessage.includes("success")
                                    ? "bg-green-50 border-green-200 text-green-700"
                                    : "bg-red-50 border-red-200 text-red-700"
                            }`}>
                                {copyMessage}
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}

            {/* Quick Actions */}
            <div className="mt-6 flex gap-3">
                <Button
                    variant="outline"
                    onClick={() => router.push(`/workshops/${workshopId}`)}
                >
                    Back to Workshop
                </Button>
            </div>
        </div>
    );
}
