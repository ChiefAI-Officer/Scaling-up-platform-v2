"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

export interface AssessmentTemplateFormProps {
  mode: "create";
}

export function AssessmentTemplateForm({ mode: _mode }: AssessmentTemplateFormProps) {
  const router = useRouter();
  const { toast } = useToast();

  const [name, setName] = useState("");
  const [alias, setAlias] = useState("");
  const [description, setDescription] = useState("");
  const [invitationSubject, setInvitationSubject] = useState(
    "You're invited to take an assessment",
  );
  const [invitationBodyMarkdown, setInvitationBodyMarkdown] = useState(
    "Hi {{respondentFirstName}},\n\nYou've been invited to take the {{campaignName}} assessment.\n\n[Start the assessment]({{invitationUrl}})\n\nThe survey closes on {{closeAt}}.",
  );
  const [aggregationMode, setAggregationMode] = useState<
    "FULL_VISIBILITY" | "CEO_ONLY"
  >("FULL_VISIBILITY");
  const [language, setLanguage] = useState("en");

  const [questionsJson, setQuestionsJson] = useState("[]");
  const [sectionsJson, setSectionsJson] = useState("[]");
  const [scoringConfigJson, setScoringConfigJson] = useState("{}");
  const [reportConfigJson, setReportConfigJson] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [jsonError, setJsonError] = useState<string | null>(null);

  function parseOrError<T>(raw: string, fieldName: string): T | null {
    try {
      return JSON.parse(raw) as T;
    } catch (e) {
      setJsonError(
        `${fieldName} is not valid JSON: ${
          e instanceof Error ? e.message : "parse error"
        }`,
      );
      return null;
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setJsonError(null);

    const questions = parseOrError<unknown[]>(questionsJson, "questions");
    if (!questions) return;
    const sections = parseOrError<unknown[]>(sectionsJson, "sections");
    if (!sections) return;
    const scoringConfig = parseOrError<unknown>(scoringConfigJson, "scoringConfig");
    if (scoringConfig === null && jsonError) return;
    const reportConfig = reportConfigJson.trim()
      ? parseOrError<unknown>(reportConfigJson, "reportConfig")
      : null;
    if (reportConfig === null && reportConfigJson.trim() && jsonError) return;

    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/assessment-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          alias,
          description: description.trim() || null,
          invitationSubject,
          invitationBodyMarkdown,
          aggregationMode,
          language,
          questions,
          sections,
          scoringConfig,
          reportConfig,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 409) {
          toast({
            title: "Alias already in use",
            description: "Pick a different alias and try again.",
            variant: "destructive",
          });
          return;
        }
        if (res.status === 400 && body.details) {
          toast({
            title: "Validation failed",
            description: JSON.stringify(body.details.fieldErrors ?? body.details),
            variant: "destructive",
          });
          return;
        }
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      toast({ title: "Template created" });
      router.push(`/admin/assessment-templates/${body.data.id}`);
    } catch (e) {
      toast({
        title: "Could not create template",
        description: e instanceof Error ? e.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="bg-card border border-border rounded-xl p-6 space-y-4">
        <h2 className="text-sm font-semibold text-foreground">Metadata</h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-foreground mb-1">
              Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={200}
              className="w-full px-3 py-2 text-sm border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              data-testid="template-name"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-foreground mb-1">
              Alias (URL slug, immutable)
            </label>
            <input
              type="text"
              value={alias}
              onChange={(e) => setAlias(e.target.value.toLowerCase())}
              required
              pattern="[a-z0-9][a-z0-9-]*"
              maxLength={80}
              className="w-full px-3 py-2 text-sm border border-border rounded-md bg-background text-foreground font-mono focus:outline-none focus:ring-2 focus:ring-primary/30"
              placeholder="my-template"
              data-testid="template-alias"
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              Lowercase, digits, dashes only.
            </p>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-foreground mb-1">
            Description
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            maxLength={2000}
            className="w-full px-3 py-2 text-sm border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
            data-testid="template-description"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-foreground mb-1">
              Aggregation mode
            </label>
            <select
              value={aggregationMode}
              onChange={(e) =>
                setAggregationMode(
                  e.target.value as "FULL_VISIBILITY" | "CEO_ONLY",
                )
              }
              className="w-full px-3 py-2 text-sm border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              data-testid="template-aggregation-mode"
            >
              <option value="FULL_VISIBILITY">FULL_VISIBILITY</option>
              <option value="CEO_ONLY">CEO_ONLY</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-foreground mb-1">
              Language
            </label>
            <input
              type="text"
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              required
              maxLength={8}
              className="w-full px-3 py-2 text-sm border border-border rounded-md bg-background text-foreground font-mono focus:outline-none focus:ring-2 focus:ring-primary/30"
              data-testid="template-language"
            />
          </div>
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl p-6 space-y-4">
        <h2 className="text-sm font-semibold text-foreground">Invitation email</h2>
        <div>
          <label className="block text-xs font-medium text-foreground mb-1">
            Subject
          </label>
          <input
            type="text"
            value={invitationSubject}
            onChange={(e) => setInvitationSubject(e.target.value)}
            required
            maxLength={200}
            className="w-full px-3 py-2 text-sm border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
            data-testid="template-invitation-subject"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-foreground mb-1">
            Body (Markdown)
          </label>
          <textarea
            value={invitationBodyMarkdown}
            onChange={(e) => setInvitationBodyMarkdown(e.target.value)}
            required
            rows={8}
            maxLength={5000}
            className="w-full px-3 py-2 text-sm border border-border rounded-md bg-background text-foreground font-mono focus:outline-none focus:ring-2 focus:ring-primary/30"
            data-testid="template-invitation-body"
          />
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl p-6 space-y-4">
        <h2 className="text-sm font-semibold text-foreground">
          Content (paste JSON)
        </h2>
        <p className="text-xs text-muted-foreground">
          The deeper shape (question types, scoring tiers) is validated at
          first-campaign-submit. For now, paste the JSON blobs produced by your
          authoring script. See <code>prisma/seed-rockefeller-assessment.ts</code>{" "}
          for a worked example.
        </p>
        {jsonError && (
          <div className="text-xs text-destructive bg-destructive/10 border border-destructive/20 px-3 py-2 rounded">
            {jsonError}
          </div>
        )}
        <JsonField
          label="questions (array)"
          value={questionsJson}
          onChange={setQuestionsJson}
          testId="template-questions-json"
          rows={6}
        />
        <JsonField
          label="sections (array)"
          value={sectionsJson}
          onChange={setSectionsJson}
          testId="template-sections-json"
          rows={4}
        />
        <JsonField
          label="scoringConfig (object)"
          value={scoringConfigJson}
          onChange={setScoringConfigJson}
          testId="template-scoring-json"
          rows={6}
        />
        <JsonField
          label="reportConfig (object, optional)"
          value={reportConfigJson}
          onChange={setReportConfigJson}
          testId="template-report-json"
          rows={4}
          placeholder="Leave blank for null"
        />
      </div>

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={() => router.push("/admin/assessment-templates")}
          disabled={submitting}
          className="inline-flex items-center text-sm font-medium px-3 py-2 rounded-md border border-border bg-card text-foreground hover:bg-muted disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="inline-flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          data-testid="template-submit"
        >
          {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          Create template
        </button>
      </div>
    </form>
  );
}

function JsonField({
  label,
  value,
  onChange,
  testId,
  rows,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  testId: string;
  rows: number;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-foreground mb-1">
        {label}
      </label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        placeholder={placeholder}
        className="w-full px-3 py-2 text-xs border border-border rounded-md bg-background text-foreground font-mono focus:outline-none focus:ring-2 focus:ring-primary/30"
        data-testid={testId}
      />
    </div>
  );
}
