"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { TEMPLATE_PREVIEW_DATA } from "@/lib/templates/template-preview";
import { interpolateContent } from "@/lib/templates/template-interpolation-core";
import {
    safeJsonParse,
    getInitialData,
    isDirtyCheck,
    SOLO_DEFAULTS,
    REGISTRATION_DEFAULTS,
    THANKYOU_DEFAULTS,
} from "@/lib/templates/template-editor-utils";
import type { SoloLandingFields, RegistrationFields, ThankYouFields } from "@/lib/templates/template-editor-utils";
import { ThankYouPageTemplate, SAMPLE_WORKSHOP } from "@/components/templates/thank-you-page-template";
import { RegistrationPageTemplate, SAMPLE_WORKSHOP_REGISTRATION } from "@/components/templates/registration-page-template";
import { SoloLandingPageTemplate, SAMPLE_WORKSHOP_SOLO } from "@/components/templates/solo-landing-page-template";

// Types, defaults, and utilities imported from @/lib/templates/template-editor-utils

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
    initialCustomCode?: string | null;
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
    initialCustomCode,
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
    const [customCode, setCustomCode] = useState<string | null>(initialCustomCode ?? null);
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
                body: JSON.stringify({ content, customCode }),
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

                        {/* Affiliate / Tracking Code */}
                        <Card>
                            <CardHeader>
                                <CardTitle>Affiliate / Tracking Code</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-2">
                                <div>
                                    <Label htmlFor="customCode" className="block text-sm font-medium text-foreground mb-1">
                                        Affiliate / Tracking Code
                                        <span className="ml-1 text-xs text-muted-foreground">(optional)</span>
                                    </Label>
                                    <input
                                        id="customCode"
                                        type="text"
                                        value={customCode ?? ""}
                                        onChange={(e) => setCustomCode(e.target.value || null)}
                                        placeholder="e.g. partner123"
                                        className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background"
                                    />
                                    <p className="mt-1 text-xs text-muted-foreground">
                                        Stored but not rendered until use case is confirmed.
                                    </p>
                                </div>
                            </CardContent>
                        </Card>

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
                    customCode={customCode}
                    onCustomCodeChange={setCustomCode}
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
    return (
        <SoloLandingPageTemplate
            content={{
                heroTitle: pv(data.heroTitle),
                heroSubtitle: pv(data.heroSubtitle),
                coachName: pv(data.coachName),
                coachPhoto: data.coachPhoto,
                coachTitle: pv(data.coachTitle),
                eventDay: pv(data.eventDay),
                eventDate: pv(data.eventDate),
                eventTime: pv(data.eventTime),
                eventTimezone: pv(data.eventTimezone),
                aboutTitle: pv(data.aboutTitle),
                aboutDescription: pv(data.aboutDescription),
                benefits: data.benefits.map(pv),
                videoUrl: data.videoUrl,
            }}
            workshop={SAMPLE_WORKSHOP_SOLO}
            isPreview={true}
        />
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
    return (
        <RegistrationPageTemplate
            content={{
                heroHeadline: pv(data.heroHeadline),
                heroDescription: pv(data.heroDescription),
                submitButtonText: pv(data.submitButtonText),
                privacyText: pv(data.privacyText),
                emailPlaceholder: pv(data.emailPlaceholder),
                namePlaceholder: pv(data.namePlaceholder),
                companyPlaceholder: pv(data.companyPlaceholder),
                optInText: pv(data.optInText),
            }}
            workshop={SAMPLE_WORKSHOP_REGISTRATION}
            isPreview={true}
        />
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
    return (
        <ThankYouPageTemplate
            content={{
                headline: previewValue(data.headline),
                subheadline: previewValue(data.subheadline),
                videoUrl: data.videoUrl,
                additionalMessage: previewValue(data.additionalMessage),
                calendarReminderText: previewValue(data.calendarReminderText),
            }}
            workshop={SAMPLE_WORKSHOP}
            isPreview={true}
        />
    );
}

// ---------------------------------------------------------------------------
// Fallback JSON Editor (for unsupported template types)
// ---------------------------------------------------------------------------

function FallbackJsonEditor({
    templateId,
    initialContent,
    customCode,
    onCustomCodeChange,
}: {
    templateId: string;
    initialContent: string;
    customCode: string | null;
    onCustomCodeChange: (val: string | null) => void;
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
                body: JSON.stringify({ content, customCode }),
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
            <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                    Affiliate / Tracking Code
                    <span className="ml-1 text-xs text-muted-foreground">(optional)</span>
                </label>
                <input
                    type="text"
                    value={customCode ?? ""}
                    onChange={(e) => onCustomCodeChange(e.target.value || null)}
                    placeholder="e.g. partner123"
                    className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                    Stored but not rendered until use case is confirmed.
                </p>
            </div>
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

