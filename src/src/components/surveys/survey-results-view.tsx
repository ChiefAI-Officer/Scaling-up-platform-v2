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

// BUG-MAY6-8 (Codex round-2 catch): shared read-only view used by BOTH coach
// and admin per-workshop survey result pages. Coach + admin pages own their
// own auth + data fetch; this component is pure presentation so neither side
// can leak the other's session context.
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

        {templateGroups.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">
              No survey responses yet for this workshop.
            </CardContent>
          </Card>
        ) : (
          templateGroups.map((group) => (
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
                          className="inline-flex items-center rounded-full bg-muted px-3 py-1 text-xs text-foreground"
                          title={s.registration?.email}
                        >
                          {formatRespondentLabel(s.registration)}
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
                        <div className="text-sm text-muted-foreground">
                          {(() => {
                            const nums = allAnswers
                              .filter((a) => a.numValue !== null)
                              .map((a) => a.numValue!);
                            if (nums.length === 0) return "No responses";
                            const avg = nums.reduce((s, n) => s + n, 0) / nums.length;
                            return `Average: ${avg.toFixed(1)} (${nums.length} response${nums.length !== 1 ? "s" : ""})`;
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
                                <p className="mt-1 text-xs text-muted-foreground">
                                  — {entry.respondent}
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
          ))
        )}
      </div>
    </FadeUp>
  );
}
