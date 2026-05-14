"use client";

/**
 * Round 15 Wave 4 — <SurveyResponsesTable>.
 *
 * Per-response browse table for the aggregated survey results page. Renders
 * one row per completed survey with sortable columns, conditional answer
 * columns (NPS Score / Avg Rating / Comment), an empty state, and a cap
 * banner. Workshop column links to the admin workshop detail page.
 *
 * Intentionally NO "Respondent" column — respondent identity is surfaced
 * only via the CSV export (Wave 5), keeping the at-a-glance browse PII-aware.
 */

import * as React from "react";
import Link from "next/link";
import { ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { formatTimestampDateTime } from "@/lib/utils";
import type { SurveyResponseRow } from "@/lib/surveys/survey-service";
import type { SurveyQuestion } from "@prisma/client";

// ---------- props ----------

export interface SurveyResponsesTableProps {
  rows: SurveyResponseRow[];
  questions: SurveyQuestion[];
  surveyType: string;
  totalCount: number;
  cappedAt: number | null;
  exportHref: string;
}

// ---------- sort state ----------

type SortKey =
  | "workshop"
  | "workshopCode"
  | "coach"
  | "category"
  | "completedAt"
  | "npsScore"
  | "avgRating"
  | "comment";

type SortDir = "asc" | "desc";

// ---------- conditional-column derivation ----------

function findFirstQuestionId(
  questions: SurveyQuestion[],
  predicate: (q: SurveyQuestion) => boolean,
): string | null {
  const q = questions.find(predicate);
  return q ? q.id : null;
}

function getRatingQuestionIds(questions: SurveyQuestion[]): Set<string> {
  return new Set(questions.filter((q) => q.questionType === "RATING").map((q) => q.id));
}

function rowHasAnyAnswerIn(row: SurveyResponseRow, ids: Set<string>): boolean {
  for (const id of ids) {
    const a = row.answersByQuestionId.get(id);
    if (a && (a.numValue !== null || (a.value !== null && a.value !== ""))) return true;
  }
  return false;
}

function rowHasNumericAnswerFor(row: SurveyResponseRow, questionId: string | null): boolean {
  if (!questionId) return false;
  const a = row.answersByQuestionId.get(questionId);
  return !!a && a.numValue !== null;
}

function rowHasTextAnswerFor(row: SurveyResponseRow, questionId: string | null): boolean {
  if (!questionId) return false;
  const a = row.answersByQuestionId.get(questionId);
  return !!a && a.value !== null && a.value.length > 0;
}

// ---------- per-row cell values ----------

function getRowNpsScore(row: SurveyResponseRow, npsQuestionId: string | null): number | null {
  if (!npsQuestionId) return null;
  const a = row.answersByQuestionId.get(npsQuestionId);
  return a && a.numValue !== null ? a.numValue : null;
}

function getRowAvgRating(row: SurveyResponseRow, ratingIds: Set<string>): number | null {
  const vals: number[] = [];
  for (const id of ratingIds) {
    const a = row.answersByQuestionId.get(id);
    if (a && a.numValue !== null) vals.push(a.numValue);
  }
  if (vals.length === 0) return null;
  const avg = vals.reduce((sum, n) => sum + n, 0) / vals.length;
  return Math.round(avg * 10) / 10;
}

function getRowComment(row: SurveyResponseRow, commentQuestionId: string | null): string | null {
  if (!commentQuestionId) return null;
  const a = row.answersByQuestionId.get(commentQuestionId);
  return a && a.value && a.value.length > 0 ? a.value : null;
}

function truncate60(text: string): string {
  if (text.length <= 60) return text;
  return `${text.slice(0, 60)}…`;
}

// ---------- stable sort comparator ----------

/**
 * Compare two cell values for sorting. Null/undefined values sort LAST in ASC
 * and FIRST in DESC (consistent with the contacts-table convention). Strings
 * are compared via `localeCompare` for predictable case-insensitive ordering.
 */
function compareCells(
  a: string | number | Date | null | undefined,
  b: string | number | Date | null | undefined,
  dir: SortDir,
): number {
  const aNull = a === null || a === undefined;
  const bNull = b === null || b === undefined;
  if (aNull && bNull) return 0;
  if (aNull) return dir === "asc" ? 1 : -1;
  if (bNull) return dir === "asc" ? -1 : 1;

  let cmp = 0;
  if (a instanceof Date && b instanceof Date) {
    cmp = a.getTime() - b.getTime();
  } else if (typeof a === "number" && typeof b === "number") {
    cmp = a - b;
  } else {
    cmp = String(a).localeCompare(String(b), undefined, { sensitivity: "base" });
  }
  return dir === "asc" ? cmp : -cmp;
}

// ---------- component ----------

export function SurveyResponsesTable({
  rows,
  questions,
  surveyType,
  totalCount,
  cappedAt,
  exportHref,
}: SurveyResponsesTableProps) {
  // Default sort matches the server-side findMany orderBy.
  const [sortKey, setSortKey] = React.useState<SortKey>("completedAt");
  const [sortDir, setSortDir] = React.useState<SortDir>("desc");

  // Question-type indexing (derived once per render — cheap, small input).
  const npsQuestionId = React.useMemo(
    () => findFirstQuestionId(questions, (q) => q.questionType === "NPS"),
    [questions],
  );
  const ratingIds = React.useMemo(() => getRatingQuestionIds(questions), [questions]);
  const commentQuestionId = React.useMemo(
    () =>
      findFirstQuestionId(
        questions,
        (q) => q.questionType === "TEXT" || q.questionType === "TEXTAREA",
      ),
    [questions],
  );

  // Conditional column visibility (per spec).
  const showNps =
    surveyType === "NPS" || rows.some((r) => rowHasNumericAnswerFor(r, npsQuestionId));
  const showAvgRating = ratingIds.size > 0 && rows.some((r) => rowHasAnyAnswerIn(r, ratingIds));
  const showComment = !!commentQuestionId && rows.some((r) => rowHasTextAnswerFor(r, commentQuestionId));

  // Stable copy + sort (never mutate the prop array).
  const sortedRows = React.useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      switch (sortKey) {
        case "workshop":
          return compareCells(a.workshop.title, b.workshop.title, sortDir);
        case "workshopCode":
          return compareCells(a.workshop.workshopCode, b.workshop.workshopCode, sortDir);
        case "coach":
          return compareCells(a.coach?.name ?? null, b.coach?.name ?? null, sortDir);
        case "category":
          return compareCells(a.category?.name ?? null, b.category?.name ?? null, sortDir);
        case "completedAt":
          return compareCells(a.completedAt, b.completedAt, sortDir);
        case "npsScore":
          return compareCells(
            getRowNpsScore(a, npsQuestionId),
            getRowNpsScore(b, npsQuestionId),
            sortDir,
          );
        case "avgRating":
          return compareCells(
            getRowAvgRating(a, ratingIds),
            getRowAvgRating(b, ratingIds),
            sortDir,
          );
        case "comment":
          return compareCells(
            getRowComment(a, commentQuestionId),
            getRowComment(b, commentQuestionId),
            sortDir,
          );
        default:
          return 0;
      }
    });
    return copy;
  }, [rows, sortKey, sortDir, npsQuestionId, ratingIds, commentQuestionId]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      // First click on a different header switches to that key ASC.
      setSortDir("asc");
    }
  };

  const renderSortIndicator = (key: SortKey) => {
    if (sortKey !== key) return <ArrowUpDown className="h-3 w-3 opacity-40" aria-hidden />;
    return sortDir === "asc"
      ? <ArrowUp className="h-3 w-3" aria-hidden />
      : <ArrowDown className="h-3 w-3" aria-hidden />;
  };

  // Inline renderer (NOT a nested component definition — those get re-created
  // every render, which would unmount/remount the buttons and detach cached
  // refs in tests).
  //
  // a11y: `aria-sort` on the <TableHead> announces the current sort state of
  // the active column to screen readers (the visible ArrowUp/ArrowDown icons
  // are aria-hidden). The button has no `aria-label` — the visible <span>
  // text becomes its accessible name automatically, avoiding "Workshop,
  // Workshop" double-read.
  const sortableHeader = (label: string, key: SortKey) => (
    <TableHead
      key={key}
      aria-sort={
        sortKey === key
          ? sortDir === "asc"
            ? "ascending"
            : "descending"
          : "none"
      }
    >
      <button
        type="button"
        onClick={() => handleSort(key)}
        className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground"
      >
        <span>{label}</span>
        {renderSortIndicator(key)}
      </button>
    </TableHead>
  );

  // Total visible columns (used for the empty-state colSpan).
  const visibleColCount =
    5 + // workshop, code, coach, category, completed
    (showNps ? 1 : 0) +
    (showAvgRating ? 1 : 0) +
    (showComment ? 1 : 0);

  return (
    <div className="space-y-3">
      {/* Header row: cap banner + Export CSV */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          {cappedAt !== null && (
            <p className="text-sm text-muted-foreground">
              Showing {cappedAt} of {totalCount} responses — narrow filters or use Export CSV to see all.
            </p>
          )}
        </div>
        <div className="flex-shrink-0">
          <Button asChild variant="outline" size="sm">
            <a href={exportHref}>Export CSV</a>
          </Button>
        </div>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            {sortableHeader("Workshop", "workshop")}
            {sortableHeader("Workshop Code", "workshopCode")}
            {sortableHeader("Coach", "coach")}
            {sortableHeader("Category", "category")}
            {sortableHeader("Completed At", "completedAt")}
            {showNps && sortableHeader("NPS Score", "npsScore")}
            {showAvgRating && sortableHeader("Avg Rating", "avgRating")}
            {showComment && sortableHeader("Comment", "comment")}
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedRows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={visibleColCount} className="h-24 text-center">
                <div className="space-y-1">
                  <p className="font-medium text-foreground">No responses match these filters.</p>
                  <p className="text-xs text-muted-foreground">
                    Try widening the date range or clearing coach / category filters.
                  </p>
                </div>
              </TableCell>
            </TableRow>
          ) : (
            sortedRows.map((row) => {
              const avg = showAvgRating ? getRowAvgRating(row, ratingIds) : null;
              const nps = showNps ? getRowNpsScore(row, npsQuestionId) : null;
              const comment = showComment ? getRowComment(row, commentQuestionId) : null;

              return (
                <TableRow key={row.surveyId}>
                  <TableCell className="font-medium">
                    <Link
                      href={`/workshops/${row.workshop.id}`}
                      className="text-primary hover:text-primary/80"
                    >
                      {row.workshop.title}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground font-mono text-xs">
                    {row.workshop.workshopCode ?? "—"}
                  </TableCell>
                  <TableCell>{row.coach?.name ?? "—"}</TableCell>
                  <TableCell>{row.category?.name ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatTimestampDateTime(row.completedAt)}
                  </TableCell>
                  {showNps && (
                    <TableCell className="tabular-nums">{nps !== null ? nps : "—"}</TableCell>
                  )}
                  {showAvgRating && (
                    <TableCell className="tabular-nums">{avg !== null ? avg.toFixed(1) : "—"}</TableCell>
                  )}
                  {showComment && (
                    <TableCell className="text-muted-foreground">
                      {comment ? truncate60(comment) : "—"}
                    </TableCell>
                  )}
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </div>
  );
}
