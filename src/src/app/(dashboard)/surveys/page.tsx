"use client";

import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

interface WorkshopOption {
  id: string;
  title: string;
  eventDate: string;
}

interface WorkflowConfig {
  workshopId: string;
  workshopTitle: string;
  eventDate: string;
  preSurveyFormId: string;
  postSurveyFormId: string;
  npsSurveyFormId: string;
  isActive: boolean;
  updatedAt: string;
}

interface SurveyTrend {
  workshopId: string;
  workshopTitle: string;
  eventDate: string;
  responses: number;
  completed: number;
  avgNps: number | null;
}

interface SurveyResponseItem {
  id: string;
  surveyType: string;
  workshopId: string;
  workshopTitle: string;
  sentAt: string | null;
  completedAt: string | null;
  npsScore: number | null;
}

interface SurveysPayload {
  workshops: WorkshopOption[];
  workflowConfigs: WorkflowConfig[];
  trends: SurveyTrend[];
  responses: SurveyResponseItem[];
}

function formatTimestamp(value: string | null): string {
  if (!value) {
    return "—";
  }

  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function surveyTypeLabel(type: string): string {
  if (type === "PRE_WORKSHOP") {
    return "Pre-Event";
  }
  if (type === "POST_WORKSHOP") {
    return "Post-Event";
  }
  if (type === "NPS") {
    return "NPS";
  }
  return type;
}

export default function SurveysPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [data, setData] = useState<SurveysPayload>({
    workshops: [],
    workflowConfigs: [],
    trends: [],
    responses: [],
  });

  const [formData, setFormData] = useState({
    workshopId: "",
    preSurveyFormId: "",
    postSurveyFormId: "",
    npsSurveyFormId: "",
    isActive: true,
  });

  const selectedWorkflow = useMemo(
    () => data.workflowConfigs.find((config) => config.workshopId === formData.workshopId) || null,
    [data.workflowConfigs, formData.workshopId]
  );

  async function loadData() {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch("/api/surveys/workflows");
      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || "Failed to load survey module");
      }

      const payload = result.data as SurveysPayload;
      setData(payload);

      const defaultWorkshopId = formData.workshopId || payload.workshops[0]?.id || "";
      const existingConfig = payload.workflowConfigs.find(
        (config) => config.workshopId === defaultWorkshopId
      );

      setFormData((prev) => ({
        ...prev,
        workshopId: defaultWorkshopId,
        preSurveyFormId: existingConfig?.preSurveyFormId || "",
        postSurveyFormId: existingConfig?.postSurveyFormId || "",
        npsSurveyFormId: existingConfig?.npsSurveyFormId || "",
        isActive: existingConfig?.isActive ?? true,
      }));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleChange(event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
    const { name, value, type } = event.target;
    const nextValue =
      type === "checkbox" ? (event.target as HTMLInputElement).checked : value;

    if (name === "workshopId") {
      const matchingConfig = data.workflowConfigs.find((config) => config.workshopId === value);
      setFormData({
        workshopId: value,
        preSurveyFormId: matchingConfig?.preSurveyFormId || "",
        postSurveyFormId: matchingConfig?.postSurveyFormId || "",
        npsSurveyFormId: matchingConfig?.npsSurveyFormId || "",
        isActive: matchingConfig?.isActive ?? true,
      });
      setSuccess(null);
      return;
    }

    setFormData((prev) => ({ ...prev, [name]: nextValue }));
    setSuccess(null);
  }

  async function handleSaveWorkflow(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch("/api/surveys/workflows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || "Failed to save survey workflow");
      }

      setSuccess("Survey workflow saved and attached to event.");
      await loadData();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save workflow");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[300px] items-center justify-center text-muted-foreground">
        Loading surveys module...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Surveys</h1>
        <p className="text-muted-foreground">
          Create pre/post workflows per event and track answers in one place.
        </p>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-md border border-success/20 bg-success/10 px-4 py-3 text-sm text-success">
          {success}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Attach Survey Workflow to Event</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={handleSaveWorkflow}>
            <div>
              <Label htmlFor="workshopId">Workshop</Label>
              <select
                id="workshopId"
                name="workshopId"
                value={formData.workshopId}
                onChange={handleChange}
                className="mt-1 block w-full rounded-md border border-border px-3 py-2"
              >
                {data.workshops.map((workshop) => (
                  <option key={workshop.id} value={workshop.id}>
                    {workshop.title}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div>
                <Label htmlFor="preSurveyFormId">Pre-Event Survey ID</Label>
                <Input
                  id="preSurveyFormId"
                  name="preSurveyFormId"
                  value={formData.preSurveyFormId}
                  onChange={handleChange}
                  placeholder="typeform form id"
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="postSurveyFormId">Post-Event Survey ID</Label>
                <Input
                  id="postSurveyFormId"
                  name="postSurveyFormId"
                  value={formData.postSurveyFormId}
                  onChange={handleChange}
                  placeholder="typeform form id"
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="npsSurveyFormId">NPS Survey ID</Label>
                <Input
                  id="npsSurveyFormId"
                  name="npsSurveyFormId"
                  value={formData.npsSurveyFormId}
                  onChange={handleChange}
                  placeholder="typeform form id"
                  className="mt-1"
                />
              </div>
            </div>

            <label className="inline-flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                name="isActive"
                checked={formData.isActive}
                onChange={handleChange}
                className="rounded border-border"
              />
              Workflow active
            </label>

            <div className="flex items-center gap-3">
              <Button type="submit" disabled={saving}>
                {saving ? "Saving..." : "Save Workflow"}
              </Button>
              {selectedWorkflow && (
                <span className="text-sm text-muted-foreground">
                  Last updated {formatTimestamp(selectedWorkflow.updatedAt)}
                </span>
              )}
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Configured Event Workflows</CardTitle>
        </CardHeader>
        <CardContent>
          {data.workflowConfigs.length === 0 ? (
            <p className="text-muted-foreground">No survey workflows configured yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-border">
                <thead>
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Workshop
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Event Date
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Pre
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Post
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      NPS
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.workflowConfigs.map((config) => (
                    <tr key={config.workshopId}>
                      <td className="px-4 py-3 text-sm text-foreground">{config.workshopTitle}</td>
                      <td className="px-4 py-3 text-sm text-foreground">{formatTimestamp(config.eventDate)}</td>
                      <td className="px-4 py-3 text-sm text-foreground">{config.preSurveyFormId || "—"}</td>
                      <td className="px-4 py-3 text-sm text-foreground">{config.postSurveyFormId || "—"}</td>
                      <td className="px-4 py-3 text-sm text-foreground">{config.npsSurveyFormId || "—"}</td>
                      <td className="px-4 py-3">
                        <Badge variant={config.isActive ? "default" : "outline"}>
                          {config.isActive ? "Active" : "Inactive"}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Workshop Survey Trends</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-border">
              <thead>
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Workshop
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Event Date
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Responses
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Completed
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Avg NPS
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.trends.map((trend) => (
                  <tr key={trend.workshopId}>
                    <td className="px-4 py-3 text-sm text-foreground">{trend.workshopTitle}</td>
                    <td className="px-4 py-3 text-sm text-foreground">{formatTimestamp(trend.eventDate)}</td>
                    <td className="px-4 py-3 text-sm text-foreground">{trend.responses}</td>
                    <td className="px-4 py-3 text-sm text-foreground">{trend.completed}</td>
                    <td className="px-4 py-3 text-sm text-foreground">
                      {trend.avgNps === null ? "—" : trend.avgNps}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>All Survey Answers</CardTitle>
        </CardHeader>
        <CardContent>
          {data.responses.length === 0 ? (
            <p className="text-muted-foreground">No survey answers captured yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-border">
                <thead>
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Type
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Workshop
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Sent
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Completed
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      NPS
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.responses.map((response) => (
                    <tr key={response.id}>
                      <td className="px-4 py-3">
                        <Badge variant="outline">{surveyTypeLabel(response.surveyType)}</Badge>
                      </td>
                      <td className="px-4 py-3 text-sm text-foreground">{response.workshopTitle}</td>
                      <td className="px-4 py-3 text-sm text-foreground">{formatTimestamp(response.sentAt)}</td>
                      <td className="px-4 py-3 text-sm text-foreground">
                        {response.completedAt ? formatTimestamp(response.completedAt) : "Pending"}
                      </td>
                      <td className="px-4 py-3 text-sm text-foreground">
                        {typeof response.npsScore === "number" ? response.npsScore : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

