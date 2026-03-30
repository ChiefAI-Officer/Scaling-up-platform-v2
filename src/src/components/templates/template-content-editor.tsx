"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { TEMPLATE_PREVIEW_DATA } from "@/lib/template-preview";
import { interpolateContent } from "@/lib/template-interpolation-core";
import {
    safeJsonParse,
    getInitialData,
    isDirtyCheck,
    SOLO_DEFAULTS,
    REGISTRATION_DEFAULTS,
    THANKYOU_DEFAULTS,
} from "@/lib/template-editor-utils";
import type { SoloLandingFields, RegistrationFields, ThankYouFields } from "@/lib/template-editor-utils";

// Types, defaults, and utilities imported from @/lib/template-editor-utils

// ---------------------------------------------------------------------------
// Helper: replace {{var}} in a single string with preview data
// ---------------------------------------------------------------------------

function previewValue(val: string): string {
    return interpolateContent(val, TEMPLATE_PREVIEW_DATA);
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface Props {
    templateId: string;
    templateType: string;
    templateName: string;
    categoryName: string;
    isActive: boolean;
    initialContent: string;
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function TemplateContentEditor({
    templateId,
    templateType,
    templateName,
    categoryName,
    isActive,
    initialContent,
}: Props) {
    // Parse initial content, merging over defaults for the active type only (I-1 fix)
    const parsed = safeJsonParse(initialContent);
    const [savedSnapshot, setSavedSnapshot] = useState(() =>
        getInitialData(templateType, parsed)
    );

    const [soloData, setSoloData] = useState<SoloLandingFields>(() =>
        templateType === "SOLO_LANDING"
            ? { ...SOLO_DEFAULTS, ...parsed }
            : SOLO_DEFAULTS
    );
    const [regData, setRegData] = useState<RegistrationFields>(() =>
        templateType === "REGISTRATION"
            ? { ...REGISTRATION_DEFAULTS, ...parsed }
            : REGISTRATION_DEFAULTS
    );
    const [tyData, setTyData] = useState<ThankYouFields>(() =>
        templateType === "THANK_YOU"
            ? { ...THANKYOU_DEFAULTS, ...parsed }
            : THANKYOU_DEFAULTS
    );
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState("");

    // Get current form data based on template type
    function getCurrentData(): Record<string, unknown> {
        switch (templateType) {
            case "SOLO_LANDING":
                return { ...soloData };
            case "REGISTRATION":
                return { ...regData };
            case "THANK_YOU":
                return { ...tyData };
            default:
                return parsed;
        }
    }

    // Unsaved changes warning (I-2 fix)
    const isDirty = isDirtyCheck(getCurrentData(), savedSnapshot);

    useEffect(() => {
        if (!isDirty) return;
        const handler = (e: BeforeUnloadEvent) => {
            e.preventDefault();
        };
        window.addEventListener("beforeunload", handler);
        return () => window.removeEventListener("beforeunload", handler);
    }, [isDirty]);

    const handleSave = async () => {
        setSaving(true);
        setMessage("");

        try {
            const currentData = getCurrentData();
            const content = JSON.stringify(currentData);
            const res = await fetch(`/api/page-templates/${templateId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ content }),
            });
            if (!res.ok) {
                setMessage(`Error: Server returned ${res.status}`);
                setSaving(false);
                return;
            }
            const data = await res.json();
            if (data.success) {
                setSavedSnapshot(currentData); // Reset dirty state
                setMessage("Saved successfully");
            } else {
                setMessage(`Error: ${data.error}`);
            }
        } catch {
            setMessage("Network error — please try again");
        }
        setSaving(false);
    };

    const typeLabel = templateType.replace(/_/g, " ");

    // For unsupported types, fall back to JSON textarea
    const isVisual = ["SOLO_LANDING", "REGISTRATION", "THANK_YOU"].includes(templateType);

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-foreground">{templateName}</h1>
                    <p className="text-sm text-muted-foreground">
                        {typeLabel} &middot; {categoryName}
                        {isActive && (
                            <span className="ml-2 text-success font-medium">
                                &bull; Active
                            </span>
                        )}
                    </p>
                </div>
            </div>

            {/* Variable info banner */}
            {isVisual && (
                <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-primary">
                    <span className="font-medium">Template variables</span> like{" "}
                    <code className="rounded bg-primary/10 px-1.5 py-0.5 text-xs font-mono">
                        {"{{coach_name}}"}
                    </code>{" "}
                    are replaced with real workshop data during auto-build. The preview shows
                    sample data.
                </div>
            )}

            {isVisual ? (
                <div className="grid grid-cols-5 gap-6">
                    {/* Form Panel — 2 columns */}
                    <div className="col-span-2 space-y-6">
                        {templateType === "SOLO_LANDING" && (
                            <SoloForm data={soloData} onChange={setSoloData} />
                        )}
                        {templateType === "REGISTRATION" && (
                            <RegistrationForm data={regData} onChange={setRegData} />
                        )}
                        {templateType === "THANK_YOU" && (
                            <ThankYouForm data={tyData} onChange={setTyData} />
                        )}

                        {/* Save button */}
                        <div className="flex items-center gap-3">
                            <Button onClick={handleSave} disabled={saving}>
                                {saving ? "Saving..." : "Save Template"}
                            </Button>
                            {message && (
                                <p
                                    className={`text-sm ${
                                        message.startsWith("Error") || message.startsWith("Network")
                                            ? "text-destructive"
                                            : "text-success"
                                    }`}
                                >
                                    {message}
                                </p>
                            )}
                        </div>
                    </div>

                    {/* Preview Panel — 3 columns */}
                    <div className="col-span-3 sticky top-4 self-start">
                        <Card className="overflow-hidden">
                            <CardHeader className="bg-muted border-b py-2">
                                <CardTitle className="text-sm font-medium">Live Preview</CardTitle>
                            </CardHeader>
                            <CardContent className="p-0">
                                <div className="max-h-[calc(100vh-200px)] overflow-y-auto">
                                    {templateType === "SOLO_LANDING" && (
                                        <SoloPreview data={soloData} />
                                    )}
                                    {templateType === "REGISTRATION" && (
                                        <RegistrationPreview data={regData} />
                                    )}
                                    {templateType === "THANK_YOU" && (
                                        <ThankYouPreview data={tyData} />
                                    )}
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </div>
            ) : (
                /* Fallback: raw JSON editor for BIO_PAGE / DUO_LANDING */
                <FallbackJsonEditor
                    templateId={templateId}
                    initialContent={initialContent}
                />
            )}
        </div>
    );
}

// ---------------------------------------------------------------------------
// SOLO_LANDING Form
// ---------------------------------------------------------------------------

function SoloForm({
    data,
    onChange,
}: {
    data: SoloLandingFields;
    onChange: (d: SoloLandingFields) => void;
}) {
    const set = (field: keyof SoloLandingFields, value: string) =>
        onChange({ ...data, [field]: value });

    return (
        <>
            <Card>
                <CardHeader>
                    <CardTitle>Hero Section</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div>
                        <Label htmlFor="heroTitle">Title</Label>
                        <Input
                            id="heroTitle"
                            value={data.heroTitle}
                            onChange={(e) => set("heroTitle", e.target.value)}
                            className="mt-1"
                        />
                    </div>
                    <div>
                        <Label htmlFor="heroSubtitle">Subtitle</Label>
                        <Input
                            id="heroSubtitle"
                            value={data.heroSubtitle}
                            onChange={(e) => set("heroSubtitle", e.target.value)}
                            className="mt-1"
                        />
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Coach Info</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div>
                        <Label htmlFor="coachName">Coach Name</Label>
                        <Input
                            id="coachName"
                            value={data.coachName}
                            onChange={(e) => set("coachName", e.target.value)}
                            className="mt-1"
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                            Use {"{{coach_name}}"} for auto-fill
                        </p>
                    </div>
                    <div>
                        <Label htmlFor="coachPhoto">Coach Photo URL</Label>
                        <Input
                            id="coachPhoto"
                            value={data.coachPhoto}
                            onChange={(e) => set("coachPhoto", e.target.value)}
                            className="mt-1"
                        />
                    </div>
                    <div>
                        <Label htmlFor="coachTitle">Coach Title</Label>
                        <Input
                            id="coachTitle"
                            value={data.coachTitle}
                            onChange={(e) => set("coachTitle", e.target.value)}
                            className="mt-1"
                        />
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Event & Content</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <Label htmlFor="eventDay">Day</Label>
                            <Input
                                id="eventDay"
                                value={data.eventDay}
                                onChange={(e) => set("eventDay", e.target.value)}
                                className="mt-1"
                            />
                        </div>
                        <div>
                            <Label htmlFor="eventDate">Date</Label>
                            <Input
                                id="eventDate"
                                value={data.eventDate}
                                onChange={(e) => set("eventDate", e.target.value)}
                                className="mt-1"
                            />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <Label htmlFor="eventTime">Time</Label>
                            <Input
                                id="eventTime"
                                value={data.eventTime}
                                onChange={(e) => set("eventTime", e.target.value)}
                                className="mt-1"
                            />
                        </div>
                        <div>
                            <Label htmlFor="eventTimezone">Timezone</Label>
                            <Input
                                id="eventTimezone"
                                value={data.eventTimezone}
                                onChange={(e) => set("eventTimezone", e.target.value)}
                                className="mt-1"
                            />
                        </div>
                    </div>
                    <div>
                        <Label htmlFor="aboutTitle">About Section Title</Label>
                        <Input
                            id="aboutTitle"
                            value={data.aboutTitle}
                            onChange={(e) => set("aboutTitle", e.target.value)}
                            className="mt-1"
                        />
                    </div>
                    <div>
                        <Label htmlFor="aboutDescription">About Description</Label>
                        <textarea
                            id="aboutDescription"
                            value={data.aboutDescription}
                            onChange={(e) => set("aboutDescription", e.target.value)}
                            rows={4}
                            className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:ring-primary"
                        />
                    </div>
                    <div>
                        <Label>Benefits (What You&rsquo;ll Learn)</Label>
                        <div className="space-y-2 mt-2">
                            {data.benefits.map((b, i) => (
                                <div key={i} className="flex gap-2">
                                    <Input
                                        value={b}
                                        onChange={(e) => {
                                            const updated = [...data.benefits];
                                            updated[i] = e.target.value;
                                            onChange({ ...data, benefits: updated });
                                        }}
                                        placeholder="Benefit point..."
                                    />
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={() =>
                                            onChange({
                                                ...data,
                                                benefits: data.benefits.filter((_, j) => j !== i),
                                            })
                                        }
                                    >
                                        &times;
                                    </Button>
                                </div>
                            ))}
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() =>
                                    onChange({ ...data, benefits: [...data.benefits, ""] })
                                }
                            >
                                + Add Benefit
                            </Button>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Video & CTA</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div>
                        <Label htmlFor="videoUrl">Video Embed URL</Label>
                        <Input
                            id="videoUrl"
                            value={data.videoUrl}
                            onChange={(e) => set("videoUrl", e.target.value)}
                            placeholder="https://player.vimeo.com/video/..."
                            className="mt-1"
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                            Vimeo or YouTube embed URL. Leave empty to hide.
                        </p>
                    </div>
                    <div>
                        <Label htmlFor="ctaText">CTA Button Text</Label>
                        <Input
                            id="ctaText"
                            value={data.ctaText}
                            onChange={(e) => set("ctaText", e.target.value)}
                            className="mt-1"
                        />
                    </div>
                </CardContent>
            </Card>
        </>
    );
}

// ---------------------------------------------------------------------------
// SOLO_LANDING Preview
// ---------------------------------------------------------------------------

function SoloPreview({ data }: { data: SoloLandingFields }) {
    const pv = (v: string) => previewValue(v);
    const partnerName = pv(TEMPLATE_PREVIEW_DATA.partnerName ?? "");
    const partnerLogoUrl = TEMPLATE_PREVIEW_DATA.partnerLogoUrl ?? "";
    const partnerTagline = pv(TEMPLATE_PREVIEW_DATA.partnerTagline ?? "");
    const hasPartner = partnerName || partnerLogoUrl || partnerTagline;

    return (
        <>
            {/* Hero */}
            <div className="bg-sidebar text-sidebar-foreground p-8">
                <div className="grid grid-cols-2 gap-6 items-center">
                    <div>
                        <span className="bg-warning text-xs px-3 py-1 rounded-full uppercase font-semibold">
                            Scaling Up
                        </span>
                        <h1 className="text-2xl font-bold mt-3 mb-2">{pv(data.heroTitle)}</h1>
                        <p className="text-sidebar-muted mb-4">{pv(data.heroSubtitle)}</p>
                        <div className="space-y-2 text-sm">
                            <div className="flex items-center gap-2">
                                <span>📅</span>
                                <span>
                                    {pv(data.eventDay)}, {pv(data.eventDate)}
                                </span>
                            </div>
                            <div className="flex items-center gap-2">
                                <span>⏰</span>
                                <span>
                                    {pv(data.eventTime)} {pv(data.eventTimezone)}
                                </span>
                            </div>
                        </div>
                    </div>
                    <div className="text-center">
                        {pv(data.coachPhoto) && !pv(data.coachPhoto).startsWith("{{") ? (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img
                                src={pv(data.coachPhoto)}
                                alt={pv(data.coachName)}
                                className="w-28 h-28 rounded-full object-cover mx-auto mb-3 border-4 border-sidebar-foreground"
                            />
                        ) : (
                            <div className="w-28 h-28 rounded-full bg-primary/80 mx-auto mb-3 flex items-center justify-center text-sidebar-muted text-xs">
                                Coach Photo
                            </div>
                        )}
                        <div className="font-bold">{pv(data.coachName)}</div>
                        <div className="text-sidebar-muted text-sm">{pv(data.coachTitle)}</div>
                        {hasPartner && (
                            <div className="mt-4 border-t border-sidebar-foreground/20 pt-4">
                                <div className="text-[10px] uppercase tracking-wide text-sidebar-muted mb-2">
                                    In Partnership With
                                </div>
                                {partnerLogoUrl ? (
                                    /* eslint-disable-next-line @next/next/no-img-element */
                                    <img
                                        src={partnerLogoUrl}
                                        alt={partnerName || "Partner"}
                                        className="mx-auto h-10 w-auto object-contain rounded bg-card p-1"
                                    />
                                ) : null}
                                {partnerName ? (
                                    <div className="mt-2 text-sm font-semibold text-sidebar-foreground">
                                        {partnerName}
                                    </div>
                                ) : null}
                                {partnerTagline ? (
                                    <div className="text-xs text-sidebar-muted">
                                        {partnerTagline}
                                    </div>
                                ) : null}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Content */}
            <div className="p-6 grid grid-cols-3 gap-6">
                <div className="col-span-2">
                    <h2 className="text-xl font-bold mb-4">
                        {pv(data.aboutTitle) || `Join us for the ${pv(data.heroTitle)}`}
                    </h2>
                    <p className="text-muted-foreground mb-6">{pv(data.aboutDescription)}</p>

                    {data.videoUrl && (
                        <div className="bg-muted aspect-video rounded-lg mb-6 flex items-center justify-center">
                            <span className="text-muted-foreground text-sm">
                                Video: {data.videoUrl}
                            </span>
                        </div>
                    )}

                    <h3 className="font-bold text-primary mb-3">What You&rsquo;ll Learn</h3>
                    <ul className="space-y-2 text-sm text-foreground">
                        {data.benefits.map((b, i) => (
                            <li key={i} className="flex items-start gap-2">
                                <span className="text-primary">✓</span>
                                <span>{pv(b)}</span>
                            </li>
                        ))}
                    </ul>
                </div>

                {/* Registration Card */}
                <div className="bg-card border rounded-lg p-4 shadow-sm self-start">
                    <div className="bg-gradient-to-r from-primary to-primary/80 text-primary-foreground p-3 -m-4 mb-4 rounded-t-lg">
                        <div className="text-xs uppercase font-semibold">Register Now</div>
                    </div>
                    <div className="text-sm font-bold mb-1">{pv(data.eventDate)}</div>
                    <div className="text-xs text-muted-foreground mb-3">
                        with {pv(data.coachName)}
                    </div>
                    <div className="text-lg font-bold text-primary mb-3">Free</div>
                    <button className="w-full bg-primary text-primary-foreground py-2 rounded-md text-sm font-semibold">
                        {pv(data.ctaText)}
                    </button>
                </div>
            </div>
        </>
    );
}

// ---------------------------------------------------------------------------
// REGISTRATION Form
// ---------------------------------------------------------------------------

function RegistrationForm({
    data,
    onChange,
}: {
    data: RegistrationFields;
    onChange: (d: RegistrationFields) => void;
}) {
    const set = (field: keyof RegistrationFields, value: string) =>
        onChange({ ...data, [field]: value });

    return (
        <>
            <div className="rounded-md border border-primary/20 bg-primary/10 px-4 py-3 text-sm text-primary">
                Coach information and workshop details are auto-mapped from the workshop and
                coach BIO profile during auto-build.
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Hero Section</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div>
                        <Label htmlFor="heroHeadline">Headline</Label>
                        <Input
                            id="heroHeadline"
                            value={data.heroHeadline}
                            onChange={(e) => set("heroHeadline", e.target.value)}
                            className="mt-1"
                        />
                    </div>
                    <div>
                        <Label htmlFor="heroDescription">Description</Label>
                        <textarea
                            id="heroDescription"
                            value={data.heroDescription}
                            onChange={(e) => set("heroDescription", e.target.value)}
                            rows={3}
                            className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:ring-primary"
                        />
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Form Configuration</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div>
                        <Label htmlFor="formTitle">Form Title</Label>
                        <Input
                            id="formTitle"
                            value={data.formTitle}
                            onChange={(e) => set("formTitle", e.target.value)}
                            className="mt-1"
                        />
                    </div>
                    <div>
                        <Label htmlFor="emailPlaceholder">Email Placeholder</Label>
                        <Input
                            id="emailPlaceholder"
                            value={data.emailPlaceholder}
                            onChange={(e) => set("emailPlaceholder", e.target.value)}
                            className="mt-1"
                        />
                    </div>
                    <div>
                        <Label htmlFor="namePlaceholder">Name Placeholder</Label>
                        <Input
                            id="namePlaceholder"
                            value={data.namePlaceholder}
                            onChange={(e) => set("namePlaceholder", e.target.value)}
                            className="mt-1"
                        />
                    </div>
                    <div>
                        <Label htmlFor="companyPlaceholder">Company Placeholder</Label>
                        <Input
                            id="companyPlaceholder"
                            value={data.companyPlaceholder}
                            onChange={(e) => set("companyPlaceholder", e.target.value)}
                            className="mt-1"
                        />
                    </div>
                    <div>
                        <Label htmlFor="optInText">Opt-in Checkbox Text</Label>
                        <Input
                            id="optInText"
                            value={data.optInText}
                            onChange={(e) => set("optInText", e.target.value)}
                            className="mt-1"
                        />
                    </div>
                    <div>
                        <Label htmlFor="submitButtonText">Submit Button Text</Label>
                        <Input
                            id="submitButtonText"
                            value={data.submitButtonText}
                            onChange={(e) => set("submitButtonText", e.target.value)}
                            className="mt-1"
                        />
                    </div>
                    <div>
                        <Label htmlFor="privacyText">Privacy Text</Label>
                        <Input
                            id="privacyText"
                            value={data.privacyText}
                            onChange={(e) => set("privacyText", e.target.value)}
                            className="mt-1"
                        />
                    </div>
                </CardContent>
            </Card>
        </>
    );
}

// ---------------------------------------------------------------------------
// REGISTRATION Preview
// ---------------------------------------------------------------------------

function RegistrationPreview({ data }: { data: RegistrationFields }) {
    const pv = (v: string) => previewValue(v);
    const coachName = pv(TEMPLATE_PREVIEW_DATA.coachName ?? "Coach");
    const coachTitle = pv(TEMPLATE_PREVIEW_DATA.coachTitle ?? "Scaling Up Certified Coach");
    const coachPhoto = TEMPLATE_PREVIEW_DATA.coachPhoto ?? "";
    const eventDate = pv(
        TEMPLATE_PREVIEW_DATA.eventDate ?? TEMPLATE_PREVIEW_DATA.workshop_date ?? ""
    );
    const eventTime = pv(
        TEMPLATE_PREVIEW_DATA.eventTime ?? TEMPLATE_PREVIEW_DATA.event_time ?? ""
    );
    const workshopTitle = pv(TEMPLATE_PREVIEW_DATA.workshopTitle ?? "{{workshop_title}}");

    return (
        <div className="grid grid-cols-2 min-h-[500px]">
            {/* Left — Hero */}
            <div className="bg-sidebar text-sidebar-foreground p-6 flex flex-col">
                <div className="flex-1">
                    <div className="bg-primary/50 rounded-lg p-4 mb-4">
                        <div className="flex items-center gap-3 mb-3">
                            {coachPhoto ? (
                                /* eslint-disable-next-line @next/next/no-img-element */
                                <img
                                    src={coachPhoto}
                                    alt={coachName}
                                    className="w-12 h-12 rounded-full object-cover border-2 border-sidebar-foreground"
                                />
                            ) : (
                                <div className="w-12 h-12 rounded-full bg-primary/60 flex items-center justify-center text-xs text-sidebar-foreground">
                                    Coach
                                </div>
                            )}
                            <div>
                                <div className="font-medium text-sm">{coachName}</div>
                                <div className="text-sidebar-muted text-xs">{coachTitle}</div>
                            </div>
                        </div>
                        <div className="text-xs space-y-1 text-sidebar-muted">
                            <div>📅 {eventDate}</div>
                            <div>⏰ {eventTime}</div>
                        </div>
                    </div>

                    <h2 className="text-lg font-bold mb-2">{pv(data.heroHeadline)}</h2>
                    <p className="text-sidebar-muted text-sm">{pv(data.heroDescription)}</p>
                </div>
            </div>

            {/* Right — Form */}
            <div className="bg-card p-6">
                <div className="border rounded-lg p-4 shadow-sm">
                    <div className="bg-gradient-to-r from-primary to-primary/80 -m-4 mb-4 p-3 rounded-t-lg">
                        <div className="text-primary-foreground text-sm font-medium">
                            {workshopTitle}
                        </div>
                        <div className="text-primary-foreground/70 text-xs">
                            with {coachName}
                        </div>
                    </div>

                    <h3 className="font-medium text-sm mb-4">{pv(data.formTitle)}</h3>

                    <div className="space-y-3">
                        <input
                            type="text"
                            placeholder={pv(data.emailPlaceholder)}
                            className="w-full border rounded px-3 py-2 text-sm bg-background"
                            disabled
                        />
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <input type="checkbox" checked readOnly className="rounded" />
                            <span>{pv(data.optInText)}</span>
                        </div>
                        <input
                            type="text"
                            placeholder={pv(data.namePlaceholder)}
                            className="w-full border rounded px-3 py-2 text-sm bg-background"
                            disabled
                        />
                        <div className="text-xs text-muted-foreground font-medium">
                            Additional information
                        </div>
                        <input
                            type="text"
                            placeholder={pv(data.companyPlaceholder)}
                            className="w-full border rounded px-3 py-2 text-sm bg-background"
                            disabled
                        />
                        <button className="w-full bg-primary text-primary-foreground py-2 rounded font-medium text-sm">
                            {pv(data.submitButtonText)}
                        </button>
                        <p className="text-xs text-muted-foreground text-center">
                            {pv(data.privacyText)}
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// THANK_YOU Form
// ---------------------------------------------------------------------------

function ThankYouForm({
    data,
    onChange,
}: {
    data: ThankYouFields;
    onChange: (d: ThankYouFields) => void;
}) {
    const set = (field: keyof ThankYouFields, value: string) =>
        onChange({ ...data, [field]: value });

    return (
        <>
            <Card>
                <CardHeader>
                    <CardTitle>Content</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div>
                        <Label htmlFor="headline">Headline</Label>
                        <Input
                            id="headline"
                            value={data.headline}
                            onChange={(e) => set("headline", e.target.value)}
                            className="mt-1"
                        />
                    </div>
                    <div>
                        <Label htmlFor="subheadline">Sub-headline</Label>
                        <textarea
                            id="subheadline"
                            value={data.subheadline}
                            onChange={(e) => set("subheadline", e.target.value)}
                            rows={2}
                            className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:ring-primary"
                        />
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Video</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div>
                        <Label htmlFor="tyVideoUrl">Video Embed URL</Label>
                        <Input
                            id="tyVideoUrl"
                            value={data.videoUrl}
                            onChange={(e) => set("videoUrl", e.target.value)}
                            placeholder="https://player.vimeo.com/video/..."
                            className="mt-1"
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                            Vimeo or YouTube embed URL. Leave empty to hide video.
                        </p>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Additional Options</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div>
                        <Label htmlFor="additionalMessage">Additional Message</Label>
                        <textarea
                            id="additionalMessage"
                            value={data.additionalMessage}
                            onChange={(e) => set("additionalMessage", e.target.value)}
                            rows={3}
                            className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:ring-primary"
                            placeholder="Any additional instructions or message..."
                        />
                    </div>
                    <div>
                        <Label htmlFor="calendarReminderText">Calendar Reminder Text</Label>
                        <Input
                            id="calendarReminderText"
                            value={data.calendarReminderText}
                            onChange={(e) => set("calendarReminderText", e.target.value)}
                            className="mt-1"
                        />
                    </div>
                </CardContent>
            </Card>
        </>
    );
}

// ---------------------------------------------------------------------------
// THANK_YOU Preview
// ---------------------------------------------------------------------------

function ThankYouPreview({ data }: { data: ThankYouFields }) {
    const pv = (v: string) => previewValue(v);
    const headline = pv(data.headline);
    const subheadline = pv(data.subheadline);
    const videoUrl = pv(data.videoUrl);
    const additionalMessage = pv(data.additionalMessage);
    const calendarReminderText = pv(data.calendarReminderText);

    return (
        <div className="min-h-[500px] relative overflow-hidden bg-sidebar">
            {/* Decorative dots */}
            <div className="absolute left-4 top-1/4 opacity-20">
                <svg
                    width="60"
                    height="200"
                    viewBox="0 0 60 200"
                    className="text-sidebar-foreground"
                >
                    <path
                        d="M30 0 L30 40 M30 60 L30 100 M30 120 L30 160 M30 180 L30 200"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeDasharray="4 4"
                        fill="none"
                    />
                    <circle cx="30" cy="50" r="5" fill="currentColor" />
                    <circle cx="30" cy="110" r="5" fill="currentColor" />
                    <circle cx="30" cy="170" r="5" fill="currentColor" />
                </svg>
            </div>
            <div className="absolute right-4 top-1/4 opacity-20">
                <svg
                    width="60"
                    height="200"
                    viewBox="0 0 60 200"
                    className="text-sidebar-foreground"
                >
                    <path
                        d="M30 0 L30 40 M30 60 L30 100 M30 120 L30 160 M30 180 L30 200"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeDasharray="4 4"
                        fill="none"
                    />
                    <circle cx="30" cy="50" r="5" fill="currentColor" />
                    <circle cx="30" cy="110" r="5" fill="currentColor" />
                    <circle cx="30" cy="170" r="5" fill="currentColor" />
                </svg>
            </div>

            <div className="relative z-10 text-sidebar-foreground text-center p-8">
                <div className="font-bold text-lg tracking-wider mb-8">SCALING UP</div>

                <h1 className="text-2xl font-serif mb-2">{headline}</h1>

                <p className="text-sidebar-muted italic mb-8 max-w-md mx-auto text-sm">
                    {subheadline}
                </p>

                {videoUrl ? (
                    <div className="max-w-sm mx-auto mb-6">
                        <div className="border-4 border-sidebar-foreground rounded-lg overflow-hidden bg-black aspect-video flex items-center justify-center">
                            <div className="text-center">
                                <div className="w-12 h-12 rounded-full bg-success flex items-center justify-center mx-auto mb-2">
                                    <svg
                                        className="w-6 h-6 text-sidebar-foreground ml-1"
                                        fill="currentColor"
                                        viewBox="0 0 20 20"
                                    >
                                        <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
                                    </svg>
                                </div>
                                <span className="text-sidebar-foreground text-xs">
                                    Video Preview
                                </span>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="max-w-sm mx-auto mb-6 border-2 border-dashed border-sidebar-muted rounded-lg p-8 text-sidebar-muted text-sm">
                        No video configured
                    </div>
                )}

                {additionalMessage && (
                    <p className="text-sidebar-muted text-sm mb-6 max-w-md mx-auto">
                        {additionalMessage}
                    </p>
                )}

                <p className="text-sidebar-muted text-xs mb-4">{calendarReminderText}</p>

                <div className="flex gap-2 justify-center">
                    <button className="bg-card/20 text-sidebar-foreground text-xs px-3 py-1.5 rounded hover:bg-card/30">
                        Google Calendar
                    </button>
                    <button className="bg-card/20 text-sidebar-foreground text-xs px-3 py-1.5 rounded hover:bg-card/30">
                        Outlook
                    </button>
                </div>
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Fallback JSON Editor (for unsupported template types)
// ---------------------------------------------------------------------------

function FallbackJsonEditor({
    templateId,
    initialContent,
}: {
    templateId: string;
    initialContent: string;
}) {
    const [content, setContent] = useState(initialContent);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState("");

    const handleSave = async () => {
        setSaving(true);
        setMessage("");

        try {
            JSON.parse(content);
        } catch {
            setMessage("Invalid JSON — please fix syntax errors before saving");
            setSaving(false);
            return;
        }

        try {
            const res = await fetch(`/api/page-templates/${templateId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ content }),
            });
            if (!res.ok) {
                setMessage(`Error: Server returned ${res.status}`);
                setSaving(false);
                return;
            }
            const data = await res.json();
            if (data.success) {
                setMessage("Saved successfully");
            } else {
                setMessage(`Error: ${data.error}`);
            }
        } catch {
            setMessage("Network error — please try again");
        }
        setSaving(false);
    };

    return (
        <div className="rounded-xl border border-border bg-card p-5 space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Template Content (JSON)
            </h2>
            <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                className="w-full h-[500px] font-mono text-xs bg-background border border-border rounded-lg p-3 resize-y"
                spellCheck={false}
            />
            <div className="flex items-center gap-3">
                <Button onClick={handleSave} disabled={saving}>
                    {saving ? "Saving..." : "Save Template"}
                </Button>
                {message && (
                    <p
                        className={`text-sm ${
                            message.startsWith("Error") || message.startsWith("Invalid")
                                ? "text-destructive"
                                : "text-success"
                        }`}
                    >
                        {message}
                    </p>
                )}
            </div>
        </div>
    );
}

