import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FadeUp } from "@/components/ui/animated";

export interface SurveyResultAnswer {
  id: string;
  questionId: string;
  value: string | null;
  numValue: number | null;
}

export interface SurveyResultResponse {
  id: string;
  answers: SurveyResultAnswer[];
  // BUG-MAY6-9: per-survey respondent attribution. Optional so older callers
  // and tests that don't pass registration still type-check.
  registration?: {
    firstName: string;
    lastName: string;
    email: string;
  } | null;
  // BUG-MAY13-2 (Task B1): structured workshop attribution for cross-workshop
  // reuse of <SurveyResultsContent>. When set AND `showWorkshop={true}` on the
  // content component, the workshop code renders as a separate styled element
  // (NOT spliced into respondent labels — that anti-pattern was flagged by
  // Codex review). Optional and ignored entirely when `showWorkshop={false}`
  // (default), preserving workshop-page consumer behavior verbatim.
  workshop?: {
    title: string;
    workshopCode: string;
  } | null;
}

function formatRespondentLabel(
  registration: SurveyResultResponse["registration"]
): string {
  if (!registration) return "Anonymous";
  const fullName = `${registration.firstName} ${registration.lastName}`.trim();
  return fullName || registration.email || "Anonymous";
}

export interface SurveyResultQuestion {
  id: string;
  label: string;
  questionType: string;
}

export interface SurveyResultTemplateGroup {
  templateName: string;
  surveyType: string;
  questions: SurveyResultQuestion[];
  responses: SurveyResultResponse[];
}

interface SurveyResultsViewProps {
  workshopTitle: string;
  backHref: string;
  templateGroups: SurveyResultTemplateGroup[];
}

interface SurveyResultsContentProps {
  templateGroups: SurveyResultTemplateGroup[];
  /**
   * When `true`, renders `response.workshop` attribution as a separate styled
   * `<span>` next to each respondent (in the pill panel, per-person RATING/NPS
   * breakdown, and TEXT/TEXTAREA attribution lines). When `false` (default) or
   * when a response has no `workshop` field, no workshop info is rendered —
   * matching the pre-B1 behavior for workshop-page consumers.
   */
  showWorkshop?: boolean;
}

// BUG-MAY6-8 (Codex round-2 catch): shared read-only view used by BOTH coach
// and admin per-workshop survey result pages. Coach + admin pages own their
// own auth + data fetch; this component is pure presentation so neither side
// can leak the other's session context.
//
// BUG-MAY13-2 (Task B1): split into a thin shell (header + Back link) +
// <SurveyResultsContent> pure body. The body is now reusable by the template
// editor's Results tab (Task B2) which mounts it with `showWorkshop={true}`.
export function SurveyResultsView({
  workshopTitle,
  backHref,
  templateGroups,
}: SurveyResultsViewProps) {
  return (
    <FadeUp>
      <div className="space-y-6">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Link
              href={backHref}
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              &larr; Back to Workshop
            </Link>
          </div>
          <h1 className="text-2xl font-bold text-foreground">Survey Results</h1>
          <p className="text-muted-foreground">{workshopTitle}</p>
        </div>

        <SurveyResultsContent templateGroups={templateGroups} />
      </div>
    </FadeUp>
  );
}

/**
 * Pure presentational body of the survey results view — extracted from
 * <SurveyResultsView> so it can be reused by the template editor's Results tab.
 *
 * Does NOT render the page header / "Back to Workshop" link — that lives in
 * <SurveyResultsView>. Consumers like the template editor tab mount this
 * directly without the workshop-page chrome.
 */
export function SurveyResultsContent({
  templateGroups,
  showWorkshop = false,
}: SurveyResultsContentProps) {
  if (templateGroups.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-muted-foreground">
          No survey responses yet for this workshop.
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      {templateGroups.map((group) => (
        <Card key={group.templateName}>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>{group.templateName}</CardTitle>
              <Badge variant="secondary">
                {group.responses.length} response
                {group.responses.length !== 1 ? "s" : ""}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* BUG-MAY6-9: who answered — pill panel at top of each template card */}
            {group.responses.length > 0 && (
              <div className="rounded-lg border border-border/50 bg-muted/20 p-3">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                  Respondents ({group.responses.length})
                </h3>
                <div className="flex flex-wrap gap-2">
                  {group.responses.map((s) => (
                    <span
                      key={s.id}
                      className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs text-foreground"
                      title={s.registration?.email}
                    >
                      <span>{formatRespondentLabel(s.registration)}</span>
                      {showWorkshop && s.workshop && (
                        <span
                          className="text-xs text-muted-foreground"
                          title={s.workshop.title}
                        >
                          {s.workshop.workshopCode}
                        </span>
                      )}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {group.questions.map((question) => {
              const allAnswers = group.responses.flatMap((s) =>
                s.answers.filter((a) => a.questionId === question.id)
              );

              return (
                <div key={question.id} className="space-y-2">
                  <h3 className="text-sm font-semibold text-foreground">
                    {question.label}
                  </h3>

                  {(question.questionType === "RATING" ||
                    question.questionType === "NPS") && (
                    <div className="space-y-2">
                      {(() => {
                        const nums = allAnswers
                          .filter((a) => a.numValue !== null)
                          .map((a) => a.numValue!);
                        if (nums.length === 0) {
                          return (
                            <p className="text-sm text-muted-foreground">
                              No responses
                            </p>
                          );
                        }
                        const avg = nums.reduce((s, n) => s + n, 0) / nums.length;
                        const denominator = question.questionType === "NPS" ? 10 : 5;
                        // Build per-respondent entries using the same pattern as TEXT/TEXTAREA
                        const perPerson = group.responses.flatMap((s) =>
                          s.answers
                            .filter(
                              (a) =>
                                a.questionId === question.id &&
                                a.numValue !== null
                            )
                            .map((a) => ({
                              answerId: a.id,
                              score: a.numValue!,
                              respondent: formatRespondentLabel(s.registration),
                              workshop: s.workshop,
                            }))
                        );
                        return (
                          <>
                            <p className="text-sm text-muted-foreground">
                              {`Average: ${avg.toFixed(1)} (${nums.length} response${nums.length !== 1 ? "s" : ""})`}
                            </p>
                            <div className="space-y-1 mt-1">
                              {perPerson.map((entry) => (
                                <div
                                  key={entry.answerId}
                                  className="flex items-center gap-2 text-sm text-foreground"
                                >
                                  <span className="text-muted-foreground">●</span>
                                  <span className="font-medium">{entry.respondent}:</span>
                                  <span>
                                    {entry.score}/{denominator}
                                  </span>
                                  {showWorkshop && entry.workshop && (
                                    <span
                                      className="text-xs text-muted-foreground"
                                      title={entry.workshop.title}
                                    >
                                      {entry.workshop.workshopCode}
                                    </span>
                                  )}
                                </div>
                              ))}
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  )}

                  {["SINGLE_CHOICE", "MULTI_CHOICE", "YES_NO"].includes(
                    question.questionType
                  ) && (
                    <div className="space-y-1">
                      {(() => {
                        const dist: Record<string, number> = {};
                        for (const answer of allAnswers) {
                          const val = answer.value || "No answer";
                          if (question.questionType === "MULTI_CHOICE") {
                            try {
                              const choices = JSON.parse(val) as string[];
                              for (const c of choices) dist[c] = (dist[c] || 0) + 1;
                            } catch {
                              dist[val] = (dist[val] || 0) + 1;
                            }
                          } else {
                            dist[val] = (dist[val] || 0) + 1;
                          }
                        }
                        return Object.entries(dist)
                          .sort((a, b) => b[1] - a[1])
                          .map(([label, count]) => (
                            <div key={label} className="flex items-center gap-2 text-sm">
                              <div className="flex-1 bg-muted rounded-full h-2 overflow-hidden">
                                <div
                                  className="bg-primary h-full rounded-full"
                                  style={{
                                    width: `${allAnswers.length > 0 ? (count / allAnswers.length) * 100 : 0}%`,
                                  }}
                                />
                              </div>
                              <span className="text-muted-foreground min-w-[120px]">
                                {label} ({count})
                              </span>
                            </div>
                          ));
                      })()}
                    </div>
                  )}

                  {["TEXT", "TEXTAREA"].includes(question.questionType) && (
                    <div className="space-y-2">
                      {(() => {
                        // BUG-MAY6-9: render per-response so we can attach
                        // respondent attribution to each text answer.
                        const entries = group.responses.flatMap((s) =>
                          s.answers
                            .filter((a) => a.questionId === question.id)
                            .map((a) => ({
                              answerId: a.id,
                              value: a.value,
                              respondent: formatRespondentLabel(s.registration),
                              workshop: s.workshop,
                            }))
                        );
                        if (entries.length === 0) {
                          return (
                            <p className="text-sm text-muted-foreground">
                              No responses
                            </p>
                          );
                        }
                        return entries.map((entry) => (
                          <div
                            key={entry.answerId}
                            className="rounded-md bg-muted px-3 py-2"
                          >
                            <p className="text-sm text-foreground whitespace-pre-wrap">
                              {entry.value || "—"}
                            </p>
                            <p className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                              <span>— {entry.respondent}</span>
                              {showWorkshop && entry.workshop && (
                                <span
                                  className="text-xs text-muted-foreground"
                                  title={entry.workshop.title}
                                >
                                  {entry.workshop.workshopCode}
                                </span>
                              )}
                            </p>
                          </div>
                        ));
                      })()}
                    </div>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      ))}
    </>
  );
}
