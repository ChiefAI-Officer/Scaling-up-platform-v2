"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatTimestamp } from "@/lib/utils";
import type { SummaryReportType } from "@/lib/assessments/summary-reports/types";

interface SummaryReportListItem {
  id: string;
  campaignId: string;
  reportType: SummaryReportType;
  name: string;
  createdByEmailSnapshot: string;
  createdAt: string;
}

export interface SummaryReportsPanelProps {
  campaignId: string;
  campaignName: string;
  assessmentName: string;
  implementedTypes: Array<{
    type: SummaryReportType;
    label: string;
    description: string;
  }>;
  /** Temporary Task 12 seam; absent means the wizard is unavailable. */
  onOpenWizard?: () => void;
}

type LoadState = "loading" | "ready" | "error" | "hidden";

function isSummaryReportListItem(
  value: unknown,
): value is SummaryReportListItem {
  if (!value || typeof value !== "object") return false;
  const report = value as Record<string, unknown>;
  return (
    typeof report.id === "string" &&
    typeof report.campaignId === "string" &&
    typeof report.reportType === "string" &&
    typeof report.name === "string" &&
    typeof report.createdByEmailSnapshot === "string" &&
    typeof report.createdAt === "string"
  );
}

function parseReports(value: unknown): SummaryReportListItem[] | null {
  if (!value || typeof value !== "object") return null;
  const reports = (value as Record<string, unknown>).reports;
  return Array.isArray(reports) && reports.every(isSummaryReportListItem)
    ? reports
    : null;
}

function artifactUrl(
  campaignId: string,
  reportId: string,
  disposition: "inline" | "attachment",
) {
  return `/api/assessment-campaigns/${encodeURIComponent(campaignId)}/summary-reports/${encodeURIComponent(reportId)}/artifact?disposition=${disposition}`;
}

export function SummaryReportsPanel({
  campaignId,
  campaignName,
  assessmentName,
  implementedTypes,
  onOpenWizard,
}: SummaryReportsPanelProps) {
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [stateCampaignId, setStateCampaignId] = useState<string | null>(null);
  const [reports, setReports] = useState<SummaryReportListItem[]>([]);
  const [selectedReport, setSelectedReport] =
    useState<SummaryReportListItem | null>(null);
  const [previewLoaded, setPreviewLoaded] = useState(false);
  const [requestRevision, setRequestRevision] = useState(0);
  const returnFocusRef = useRef<HTMLButtonElement | null>(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    const controller = new AbortController();
    const requestId = ++requestIdRef.current;

    void (async () => {
      await Promise.resolve();
      if (controller.signal.aborted) return;

      setLoadState("loading");
      setStateCampaignId(campaignId);
      setReports([]);
      setSelectedReport(null);
      setPreviewLoaded(false);

      try {
        const response = await fetch(
          `/api/assessment-campaigns/${encodeURIComponent(campaignId)}/summary-reports`,
          { signal: controller.signal },
        );
        if (requestId !== requestIdRef.current) return;
        if (response.status === 404) {
          setStateCampaignId(campaignId);
          setLoadState("hidden");
          return;
        }
        if (!response.ok) throw new Error("Unable to list summary reports");

        const body = await response.json();
        if (controller.signal.aborted || requestId !== requestIdRef.current) {
          return;
        }

        const parsed = parseReports(body);
        if (!parsed) throw new Error("Malformed summary report list");

        setReports(
          parsed
            .filter((report) => report.campaignId === campaignId)
            .sort(
              (left, right) =>
                right.createdAt.localeCompare(left.createdAt) ||
                right.id.localeCompare(left.id),
            ),
        );
        setStateCampaignId(campaignId);
        setLoadState("ready");
      } catch (error) {
        if (
          controller.signal.aborted ||
          requestId !== requestIdRef.current ||
          (error instanceof DOMException && error.name === "AbortError")
        ) {
          return;
        }
        setStateCampaignId(campaignId);
        setLoadState("error");
      }
    })();

    return () => controller.abort();
  }, [campaignId, requestRevision]);

  const activeReport =
    selectedReport?.campaignId === campaignId ? selectedReport : null;
  const displayLoadState: LoadState =
    stateCampaignId === campaignId ? loadState : "loading";

  if (displayLoadState === "hidden") return null;

  const typeLabel = (type: SummaryReportType) =>
    implementedTypes.find((implementedType) => implementedType.type === type)
      ?.label ?? type;
  const inlineUrl = activeReport
    ? artifactUrl(campaignId, activeReport.id, "inline")
    : "";
  const attachmentUrl = activeReport
    ? artifactUrl(campaignId, activeReport.id, "attachment")
    : "";

  function closeDialog() {
    setSelectedReport(null);
    setPreviewLoaded(false);
  }

  return (
    <Card className="bg-white">
      <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1.5">
          <CardTitle>Reports</CardTitle>
          <div className="text-sm font-medium text-foreground">
            Summary Reports
          </div>
          <CardDescription>
            {campaignName} · {assessmentName}
          </CardDescription>
        </div>
        <Button onClick={onOpenWizard} disabled={!onOpenWizard}>
          Open Wizard
        </Button>
      </CardHeader>
      <CardContent>
        {displayLoadState === "loading" && (
          <p className="text-sm text-muted-foreground">
            Loading summary reports…
          </p>
        )}
        {displayLoadState === "error" && (
          <div className="flex items-center gap-3" role="alert">
            <p className="text-sm text-muted-foreground">
              Summary reports are temporarily unavailable.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setRequestRevision((revision) => revision + 1)}
            >
              Retry
            </Button>
          </div>
        )}
        {displayLoadState === "ready" && reports.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No summary reports yet.
          </p>
        )}
        {displayLoadState === "ready" && reports.length > 0 && (
          <ul className="space-y-3">
            {reports.map((report) => (
              <li
                key={report.id}
                className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="space-y-1">
                  <p className="font-medium text-foreground">{report.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {typeLabel(report.reportType)} ·{" "}
                    {formatTimestamp(report.createdAt)} · Created by{" "}
                    {report.createdByEmailSnapshot}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={(event) => {
                    returnFocusRef.current = event.currentTarget;
                    setPreviewLoaded(false);
                    setSelectedReport(report);
                  }}
                >
                  View {report.name}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      <Dialog
        open={activeReport !== null}
        onOpenChange={(open) => {
          if (!open) closeDialog();
        }}
      >
        <DialogContent
          aria-describedby={undefined}
          className="max-w-5xl"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            returnFocusRef.current?.focus();
          }}
        >
          {activeReport && (
            <>
              <DialogHeader>
                <DialogTitle>{activeReport.name}</DialogTitle>
              </DialogHeader>
              <div className="min-h-72 rounded-md border bg-muted/30 p-3">
                {previewLoaded ? (
                  <iframe
                    className="h-[60vh] w-full rounded border bg-white"
                    src={inlineUrl}
                    title={`${activeReport.name} PDF preview`}
                  />
                ) : (
                  <div className="flex h-56 items-center justify-center">
                    <Button onClick={() => setPreviewLoaded(true)}>View</Button>
                  </div>
                )}
              </div>
              <DialogFooter>
                <a
                  className="inline-flex h-10 items-center justify-center rounded-md px-4 py-2 text-sm font-semibold text-primary underline-offset-4 hover:underline"
                  href={inlineUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  View in new tab
                </a>
                <a
                  className="inline-flex h-10 items-center justify-center rounded-md px-4 py-2 text-sm font-semibold text-primary underline-offset-4 hover:underline"
                  href={attachmentUrl}
                  download
                >
                  Download
                </a>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
