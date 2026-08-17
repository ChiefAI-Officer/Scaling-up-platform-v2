import type { RespondentReport } from "@/lib/assessments/respondent-report";
import type {
  SuFullLandscapeChapter,
  SuFullLandscapePage,
  SuFullLandscapeQuestion,
  SuFullLandscapeReportModel,
} from "@/lib/assessments/su-full-landscape-report";
import {
  SuFullDetailPairedBars,
  SuFullVerticalPeerChart,
} from "@/components/assessments/su-full-landscape/SuFullLandscapeCharts";
import { SuFullLandscapePage } from "@/components/assessments/su-full-landscape/SuFullLandscapePages";

const PEER_DISCLOSURE = "Peers are a current benchmark reference. Values are not yet matched to company size, growth phase, geography, or industry.";

const CHAPTER_COPY: Readonly<Record<SuFullLandscapeChapter["key"], string>> = {
  people: "The People chapter reviews the employee and culture foundations that support sustainable growth.",
  strategy: "The Strategy chapter focuses on the choices that align the organization around a clear direction.",
  execution: "The Execution chapter examines the operating disciplines that turn plans into consistent results.",
  cash: "The Cash chapter considers the practices that strengthen financial visibility and resilience.",
  you: "The You chapter reflects on leadership and internal communication as the company grows.",
};

function formatNumber(value: number): string {
  return (Math.round(value * 10) / 10).toFixed(1);
}

function formatDate(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function rawFte(rawAnswers: unknown): number | null {
  if (!Array.isArray(rawAnswers)) return null;
  const answer = rawAnswers.find(
    (value) => value !== null
      && typeof value === "object"
      && (value as Record<string, unknown>).stableKey === "Q_FTE_CONTRACT",
  ) as Record<string, unknown> | undefined;
  return answer && typeof answer.value === "number" && Number.isFinite(answer.value)
    ? answer.value
    : null;
}

function scaleUpScore(report: RespondentReport): string {
  const value = report.result?.scaleUpScore;
  return typeof value === "number" && Number.isFinite(value)
    ? `${Math.round(value)} / 100`
    : "Not available";
}

function questionByKey(model: SuFullLandscapeReportModel): ReadonlyMap<string, SuFullLandscapeQuestion> {
  return new Map(
    model.chapters.flatMap((chapter) =>
      chapter.questions.map((question) => [question.stableKey, question] as const),
    ),
  );
}

function CoverPage({ report, number }: { report: RespondentReport; number: number }) {
  return (
    <SuFullLandscapePage number={number}>
      <p>Scaling Up Assessment</p>
      <h1>{report.assessmentName}</h1>
      <p>Prepared for {report.respondentName}</p>
      {report.companyName ? <p>{report.companyName}</p> : null}
      <p>Submitted {formatDate(report.submittedAt)}</p>
      {report.coachName ? <p>Coach: {report.coachName}</p> : null}
    </SuFullLandscapePage>
  );
}

function PrefacePage({ number }: { number: number }) {
  return (
    <SuFullLandscapePage number={number}>
      <h2>Welcome</h2>
      <p>
        This report turns your submitted assessment into a practical view of the
        systems that support your company&apos;s growth. Use it to identify the
        conversations, choices, and actions that deserve attention next.
      </p>
      <p>
        Your answers and feedback are preserved from the completed assessment;
        peer values are shown only as the current benchmark reference described
        in this report.
      </p>
    </SuFullLandscapePage>
  );
}

function ContentsPage({ number }: { number: number }) {
  const entries = [
    ["People", 7, ["Your Employees (8–9)", "Company Culture (10)"]],
    ["Strategy", 11, ["Strategy (12–13)"]],
    ["Execution", 14, ["Leadership Team (15)", "Operational Processes (16)", "Sales and Marketing (17)", "Scalability, Innovation and Technology (18)"]],
    ["Cash", 19, ["Cash (20)"]],
    ["You", 21, ["Your Leadership (22–23)", "Internal Communication (24)"]],
  ] as const;
  return (
    <SuFullLandscapePage number={number}>
      <h2>Contents</h2>
      <ol>
        {entries.map(([label, page, subsections]) => (
          <li key={label}>
            {label} <span>{page}</span>
            <ul>{subsections.map((subsection) => <li key={subsection}>{subsection}</li>)}</ul>
          </li>
        ))}
      </ol>
      <p>Chapter key: People · Strategy · Execution · Cash · You</p>
      <p>Appendix A: chapter comparisons <span>26</span></p>
    </SuFullLandscapePage>
  );
}

function IntroductionPage({ report, model, number }: {
  report: RespondentReport;
  model: SuFullLandscapeReportModel;
  number: number;
}) {
  const fte = rawFte(report.rawAnswers);
  return (
    <SuFullLandscapePage number={number}>
      <h2>Introduction</h2>
      <p><strong>ScaleUp Score</strong> {scaleUpScore(report)}</p>
      <p>{PEER_DISCLOSURE}</p>
      {model.growthPhase && fte !== null ? (
        <section aria-label="Growth phase">
          <h3>Phase {model.growthPhase.number} from FTE {fte}</h3>
          <p>{model.growthPhase.name}</p>
        </section>
      ) : null}
      <p>Read each chapter as a focused conversation: compare the values, review the frozen feedback, then choose the next useful action.</p>
    </SuFullLandscapePage>
  );
}

function ProfilePage({ model, number }: { model: SuFullLandscapeReportModel; number: number }) {
  return (
    <SuFullLandscapePage number={number}>
      <h2>Your profile</h2>
      <table>
        <thead><tr><th>Chapter / subsection</th><th>You</th><th>Peers</th><th>Deviation</th></tr></thead>
        <tbody>
          {model.profileRows.map((row) => (
            <tr key={row.stableKey}>
              <th>{row.label}</th>
              <td>{formatNumber(row.youAverage)}</td>
              <td>{formatNumber(row.peersAverage)}</td>
              <td>{formatNumber(row.deviation)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>Strongest chapter: {model.strongestChapter.label}. Focus chapter: {model.weakestChapter.label}.</p>
    </SuFullLandscapePage>
  );
}

function PeerDashboardPage({ model, number }: { model: SuFullLandscapeReportModel; number: number }) {
  return (
    <SuFullLandscapePage number={number}>
      <h2>Peers and comparisons</h2>
      <p>Benchmark reference updated {formatDate(model.benchmarkUpdatedAt)}.</p>
      <table>
        <thead><tr><th>Chapter</th><th>You</th><th>Peers</th></tr></thead>
        <tbody>{model.chapters.map((chapter) => (
          <tr key={chapter.key}><th>{chapter.label}</th><td>{formatNumber(chapter.youAverage)}</td><td>{formatNumber(chapter.peersAverage)}</td></tr>
        ))}</tbody>
      </table>
      <p>Closest comparisons: {model.closestQuestions.map((question) => question.label).join("; ")}.</p>
      <p>Largest gaps: {model.largestGapQuestions.map((question) => question.label).join("; ")}.</p>
      <p>{PEER_DISCLOSURE}</p>
    </SuFullLandscapePage>
  );
}

function ChapterPage({ chapter, number }: { chapter: SuFullLandscapeChapter; number: number }) {
  return (
    <SuFullLandscapePage number={number} chapterKey={chapter.key}>
      <h2>{chapter.label}</h2>
      <p>{CHAPTER_COPY[chapter.key]}</p>
      <SuFullVerticalPeerChart chapterKey={chapter.key} questions={chapter.questions} title={`${chapter.label} comparison`} />
    </SuFullLandscapePage>
  );
}

function DetailPage({
  page,
  questions,
}: {
  page: Extract<SuFullLandscapePage, { kind: "detail" }>;
  questions: ReadonlyMap<string, SuFullLandscapeQuestion>;
}) {
  return (
    <SuFullLandscapePage number={page.number} chapterKey={page.chapterKey}>
      <h2>Detailed comparison</h2>
      {page.questionKeys.map((key) => {
        const question = questions.get(key);
        if (!question) throw new Error(`Landscape detail page ${page.number} is missing ${key}`);
        return (
          <article
            className="su-full-landscape-detail"
            data-testid={`su-full-landscape-detail-${question.stableKey}`}
            data-question-key={question.stableKey}
            key={question.stableKey}
          >
            <h3>{question.label}</h3>
            <SuFullDetailPairedBars chapterKey={page.chapterKey} question={question} />
            <p><strong>Frozen feedback</strong> {question.recommendation ?? "No frozen feedback was recorded for this question."}</p>
          </article>
        );
      })}
    </SuFullLandscapePage>
  );
}

function ConclusionPage({ report, model, contactEmail, number }: {
  report: RespondentReport;
  model: SuFullLandscapeReportModel;
  contactEmail?: string | null;
  number: number;
}) {
  return (
    <SuFullLandscapePage number={number}>
      <h2>Conclusion</h2>
      <p><strong>ScaleUp Score</strong> {scaleUpScore(report)}</p>
      <p>Your strongest chapter is {model.strongestChapter.label}; your focus chapter is {model.weakestChapter.label}.</p>
      <h3>Next steps</h3>
      <p>Choose one priority from the feedback, agree a concrete owner and review date, and return to the remaining findings in your next planning cycle.</p>
      {contactEmail ? <p><a href={`mailto:${contactEmail}`}>Contact your coach</a></p> : null}
    </SuFullLandscapePage>
  );
}

function AppendixPage({ model, number }: { model: SuFullLandscapeReportModel; number: number }) {
  return (
    <SuFullLandscapePage number={number}>
      <h2>Appendix A: chapter comparisons</h2>
      {model.chapters.map((chapter) => (
        <SuFullVerticalPeerChart
          chapterKey={chapter.key}
          key={chapter.key}
          questions={chapter.questions}
          title={`${chapter.label} comparison`}
        />
      ))}
    </SuFullLandscapePage>
  );
}

export function SuFullLandscapeReport({
  report,
  model,
  contactEmail,
}: {
  report: RespondentReport;
  model: SuFullLandscapeReportModel;
  contactEmail?: string | null;
}) {
  const chapters = new Map(model.chapters.map((chapter) => [chapter.key, chapter]));
  const questions = questionByKey(model);

  return (
    <div className="su-full-landscape-report">
      {model.pages.map((page) => {
        switch (page.kind) {
          case "cover": return <CoverPage key={page.number} number={page.number} report={report} />;
          case "preface": return <PrefacePage key={page.number} number={page.number} />;
          case "contents": return <ContentsPage key={page.number} number={page.number} />;
          case "introduction": return <IntroductionPage key={page.number} number={page.number} report={report} model={model} />;
          case "profile": return <ProfilePage key={page.number} number={page.number} model={model} />;
          case "peer-dashboard": return <PeerDashboardPage key={page.number} number={page.number} model={model} />;
          case "chapter": {
            const chapter = chapters.get(page.chapterKey);
            if (!chapter) throw new Error(`Landscape chapter page ${page.number} is missing ${page.chapterKey}`);
            return <ChapterPage chapter={chapter} key={page.number} number={page.number} />;
          }
          case "detail": return <DetailPage key={page.number} page={page} questions={questions} />;
          case "conclusion": return <ConclusionPage key={page.number} number={page.number} report={report} model={model} contactEmail={contactEmail} />;
          case "appendix": return <AppendixPage key={page.number} number={page.number} model={model} />;
          default: {
            const impossible: never = page;
            throw new Error(`Unsupported landscape page: ${JSON.stringify(impossible)}`);
          }
        }
      })}
    </div>
  );
}
