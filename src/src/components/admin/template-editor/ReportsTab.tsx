"use client";

import React from "react";
import type { ReportHtmlConfigV1 } from "@/lib/assessments/report-html";

const PREVIEW_HEAD = `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https: data:; style-src 'unsafe-inline'; font-src https: data:"><style>body{margin:0;padding:20px;color:#0f172a;font-family:Inter,system-ui,sans-serif;font-size:14px;line-height:1.5;overflow-wrap:anywhere}img{max-width:100%;height:auto}table{max-width:100%;border-collapse:collapse}</style></head><body>`;
const PREVIEW_FOOT = "</body></html>";

function HtmlRegion({
  id,
  title,
  label,
  helper,
  value,
  previewTitle,
  onChange,
  isReadOnly,
}: {
  id: string;
  title: string;
  label: string;
  helper: string;
  value: string | null;
  previewTitle: string;
  onChange: (value: string) => void;
  isReadOnly: boolean;
}) {
  const html = value ?? "";
  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div className="grid min-h-[280px] gap-0 lg:grid-cols-2">
        <div className="border-b border-border p-5 lg:border-b-0 lg:border-r">
          <div className="mb-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-base font-semibold text-foreground">{title}</h3>
              <span className="rounded-full bg-muted px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Optional HTML
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{helper}</p>
          </div>
          <label className="sr-only" htmlFor={id}>
            {label}
          </label>
          <textarea
            id={id}
            aria-label={label}
            value={html}
            onChange={(event) => onChange(event.target.value)}
            disabled={isReadOnly}
            maxLength={100_000}
            spellCheck={false}
            className="min-h-[168px] w-full resize-y rounded-lg border border-slate-700 bg-slate-950 p-4 font-mono text-xs leading-6 text-slate-100 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-70"
          />
          <div className="mt-2 flex items-start justify-between gap-4 text-[11px] text-muted-foreground">
            <span>
              Paste HTML. Unsafe scripts and attributes are removed when you save the draft.
            </span>
            <span className="shrink-0">{html.length.toLocaleString()} / 100,000</span>
          </div>
        </div>
        <div className="bg-muted/30 p-5">
          <div className="mb-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Preview
          </div>
          <iframe
            title={previewTitle}
            sandbox=""
            srcDoc={`${PREVIEW_HEAD}${html}${PREVIEW_FOOT}`}
            className="h-[210px] w-full rounded-lg border border-border bg-white"
          />
        </div>
      </div>
    </section>
  );
}

export function ReportsTab({
  value,
  onChange,
  isReadOnly,
}: {
  value: ReportHtmlConfigV1;
  onChange: (next: ReportHtmlConfigV1) => void;
  isReadOnly: boolean;
}) {
  return (
    <div className="space-y-4" data-testid="reports-tab">
      <div>
        <h2 className="text-xl font-semibold text-foreground">Report content</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Add HTML before and after the generated result. Leave either field blank to keep its current default.
        </p>
      </div>

      <HtmlRegion
        id="report-introduction-html"
        title="Introduction / preface"
        label="Introduction / preface HTML"
        helper="Appears after the report cover and before generated results."
        value={value.introductionHtml}
        previewTitle="Introduction HTML preview"
        onChange={(introductionHtml) =>
          onChange({ ...value, introductionHtml })
        }
        isReadOnly={isReadOnly}
      />

      <section className="flex items-center gap-4 rounded-xl border border-dashed border-border bg-muted/30 px-5 py-4">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-border bg-background text-muted-foreground">
          ▥
        </div>
        <div>
          <h3 className="text-sm font-semibold text-foreground">Generated report</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Questions, scoring, findings, peer benchmarks, and answers generate this section automatically.
          </p>
        </div>
      </section>

      <HtmlRegion
        id="report-conclusion-html"
        title="Conclusion / call to action"
        label="Conclusion / call-to-action HTML"
        helper="Appears after generated results and before the report footer."
        value={value.conclusionHtml}
        previewTitle="Conclusion HTML preview"
        onChange={(conclusionHtml) => onChange({ ...value, conclusionHtml })}
        isReadOnly={isReadOnly}
      />
    </div>
  );
}
