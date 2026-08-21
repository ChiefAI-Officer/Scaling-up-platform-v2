import type { RespondentReport } from "@/lib/assessments/respondent-report";
import { CoachLogo } from "@/components/assessments/CoachLogo";
import type {
  SuFullLandscapeChapter,
  SuFullLandscapePage as SuFullLandscapePageDescriptor,
  SuFullLandscapeQuestion,
  SuFullLandscapeReportModel,
} from "@/lib/assessments/su-full-landscape-report";
import {
  SuFullDetailPairedBars,
  SuFullVerticalPeerChart,
} from "@/components/assessments/su-full-landscape/SuFullLandscapeCharts";
import {
  SuFullLandscapePage,
  type SuFullLandscapeFooterBrand,
} from "@/components/assessments/su-full-landscape/SuFullLandscapePages";
import { buildSuFullPeerDisclosureModel } from "@/lib/assessments/su-full-peer-disclosure";

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

function scaleUpScore(value: number): string {
  return `${Math.round(value)} / 100`;
}

function questionByKey(model: SuFullLandscapeReportModel): ReadonlyMap<string, SuFullLandscapeQuestion> {
  return new Map(
    model.chapters.flatMap((chapter) =>
      chapter.questions.map((question) => [question.stableKey, question] as const),
    ),
  );
}

export function PeerSnapshotDisclosure({
  provenance,
}: {
  provenance: SuFullLandscapeReportModel["peerProvenance"];
}) {
  const disclosure = buildSuFullPeerDisclosureModel(provenance);
  return (
    <aside className="su-full-landscape-peer-disclosure" aria-label="Peer benchmark provenance">
      <p>{disclosure.disclosure}</p>
      <p className="su-full-landscape-peer-provenance">{disclosure.provenanceLabel}</p>
    </aside>
  );
}

function CoverPage({ report, number }: { report: RespondentReport; number: number }) {
  return (
    <SuFullLandscapePage number={number} footerBrand={report}>
      <div className="su-full-landscape-cover-brand">
        <span className="su-full-landscape-cover-mark">Scaling Up</span>
        <CoachLogo url={report.coachLogoUrl} name={report.coachName} variant="cover" />
      </div>
      <p>Scaling Up Assessment</p>
      <h1>{report.assessmentName}</h1>
      <p>Prepared for {report.respondentName}</p>
      {report.companyName ? <p>{report.companyName}</p> : null}
      <p>Submitted {formatDate(report.submittedAt)}</p>
      {report.coachName ? <p>Coach: {report.coachName}</p> : null}
    </SuFullLandscapePage>
  );
}

function PrefacePage({ number, footerBrand }: { number: number; footerBrand: SuFullLandscapeFooterBrand }) {
  return (
    <SuFullLandscapePage number={number} footerBrand={footerBrand}>
      <h2>Welcome</h2>
      <p>
        This report turns your submitted assessment into a practical view of the
        systems that support your company&apos;s growth. Use it to identify the
        conversations, choices, and actions that deserve attention next.
      </p>
      <p>
        Your answers and feedback are preserved from the completed assessment;
        peer values are shown only with the benchmark provenance described in this
        report.
      </p>
    </SuFullLandscapePage>
  );
}

function ContentsPage({ number, footerBrand }: { number: number; footerBrand: SuFullLandscapeFooterBrand }) {
  const entries = [
    ["People", 7, ["Your Employees (8–9)", "Company Culture (10)"]],
    ["Strategy", 11, ["Strategy (12–13)"]],
    ["Execution", 14, ["Leadership Team (15)", "Operational Processes (16)", "Sales and Marketing (17)", "Scalability, Innovation and Technology (18)"]],
    ["Cash", 19, ["Cash (20)"]],
    ["You", 21, ["Your Leadership (22–23)", "Internal Communication (24)"]],
  ] as const;
  return (
    <SuFullLandscapePage number={number} footerBrand={footerBrand}>
      <h2>Contents</h2>
      <ol>
        {entries.map(([label, page, subsections]) => (
          <li key={label}>
            {label} <span>{page}</span>
            <ul>{subsections.map((subsection) => <li key={subsection}>{subsection}</li>)}</ul>
          </li>
        ))}
      </ol>
      <ul className="su-full-landscape-chapter-key" aria-label="Chapter key">
        {(["people", "strategy", "execution", "cash", "you"] as const).map((chapter) => (
          <li className={`is-${chapter}`} key={chapter}>
            <span aria-hidden="true" />
            {chapter[0].toUpperCase() + chapter.slice(1)}
          </li>
        ))}
      </ul>
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
    <SuFullLandscapePage number={number} footerBrand={report}>
      <h2>Introduction</h2>
      <p><strong>ScaleUp Score</strong> {scaleUpScore(model.scaleUpScore)}</p>
      <PeerSnapshotDisclosure provenance={model.peerProvenance} />
      {model.growthPhase && fte !== null ? (
        <section aria-label="Growth phase">
          <h3>Phase {model.growthPhase.number} from FTE {fte}</h3>
          <p>{model.growthPhase.name}</p>
        </section>
      ) : null}
      <p>Read each chapter as a focused conversation: compare the values, review your feedback, then choose the next useful action.</p>
    </SuFullLandscapePage>
  );
}

function ProfilePage({ model, number, footerBrand }: { model: SuFullLandscapeReportModel; number: number; footerBrand: SuFullLandscapeFooterBrand }) {
  return (
    <SuFullLandscapePage number={number} footerBrand={footerBrand}>
      <h2>Your profile</h2>
      <table>
        <thead><tr><th>Chapter / subsection</th><th>You</th><th>Peers</th><th>Deviation</th></tr></thead>
        <tbody>
          {model.chapters.flatMap((chapter) => [
            <tr className="su-full-landscape-profile-row--chapter" key={`chapter-${chapter.key}`}>
              <th><strong>{chapter.label}</strong> <span>Chapter aggregate</span></th>
              <td>{formatNumber(chapter.youAverage)}</td>
              <td>{formatNumber(chapter.peersAverage)}</td>
              <td>{formatNumber(chapter.youAverage - chapter.peersAverage)}</td>
            </tr>,
            ...model.profileRows
              .filter((row) => row.chapterKey === chapter.key)
              .map((row) => (
                <tr className="su-full-landscape-profile-row--subsection" key={row.stableKey}>
                  <th>{row.label} <span>Subsection</span></th>
                  <td>{formatNumber(row.youAverage)}</td>
                  <td>{formatNumber(row.peersAverage)}</td>
                  <td>{formatNumber(row.deviation)}</td>
                </tr>
              )),
          ])}
        </tbody>
      </table>
      <p>Strongest chapter: {model.strongestChapter.label}. Focus chapter: {model.weakestChapter.label}.</p>
    </SuFullLandscapePage>
  );
}

function PeerDashboardPage({ model, number, footerBrand }: { model: SuFullLandscapeReportModel; number: number; footerBrand: SuFullLandscapeFooterBrand }) {
  return (
    <SuFullLandscapePage number={number} footerBrand={footerBrand}>
      <h2>Peers and comparisons</h2>
      <PeerSnapshotDisclosure provenance={model.peerProvenance} />
      <table>
        <thead><tr><th>Chapter</th><th>You</th><th>Peers</th></tr></thead>
        <tbody>{model.chapters.map((chapter) => (
          <tr key={chapter.key}><th>{chapter.label}</th><td>{formatNumber(chapter.youAverage)}</td><td>{formatNumber(chapter.peersAverage)}</td></tr>
        ))}</tbody>
      </table>
      <p>Closest comparisons: {model.closestQuestions.map((question) => question.label).join("; ")}.</p>
      <p>Largest gaps: {model.largestGapQuestions.map((question) => question.label).join("; ")}.</p>
    </SuFullLandscapePage>
  );
}

function ChapterPage({ chapter, number, footerBrand }: { chapter: SuFullLandscapeChapter; number: number; footerBrand: SuFullLandscapeFooterBrand }) {
  return (
    <SuFullLandscapePage number={number} chapterKey={chapter.key} variant="chapter" footerBrand={footerBrand}>
      <div className="su-full-landscape-chapter-copy">
        <p className="su-full-landscape-chapter-kicker">{chapter.key}</p>
        <h2>{chapter.label}</h2>
        <p>{CHAPTER_COPY[chapter.key]}</p>
      </div>
      <SuFullVerticalPeerChart chapterKey={chapter.key} instanceId={`page-${number}-${chapter.key}`} questions={chapter.questions} title={`${chapter.label} comparison`} />
    </SuFullLandscapePage>
  );
}

function DetailPage({
  page,
  questions,
  peerProvenance,
  footerBrand,
}: {
  page: Extract<SuFullLandscapePageDescriptor, { kind: "detail" }>;
  questions: ReadonlyMap<string, SuFullLandscapeQuestion>;
  peerProvenance: SuFullLandscapeReportModel["peerProvenance"];
  footerBrand: SuFullLandscapeFooterBrand;
}) {
  return (
    <SuFullLandscapePage number={page.number} chapterKey={page.chapterKey} variant="detail" footerBrand={footerBrand}>
      <h2>Detailed comparison</h2>
      <PeerSnapshotDisclosure provenance={peerProvenance} />
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
            <p className="su-full-landscape-feedback">{question.recommendation}</p>
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
    <SuFullLandscapePage number={number} footerBrand={report}>
      <h2>Conclusion</h2>
      <p><strong>ScaleUp Score</strong> {scaleUpScore(model.scaleUpScore)}</p>
      <p>Your strongest chapter is {model.strongestChapter.label}; your focus chapter is {model.weakestChapter.label}.</p>
      <h3>Next steps</h3>
      <p>Choose one priority from the feedback, agree a concrete owner and review date, and return to the remaining findings in your next planning cycle.</p>
      {(contactEmail ?? report.referringCoachEmail) ? (
        <p><a href={`mailto:${contactEmail ?? report.referringCoachEmail}`}>Contact your coach</a></p>
      ) : null}
    </SuFullLandscapePage>
  );
}

function AppendixPage({ model, number, footerBrand }: { model: SuFullLandscapeReportModel; number: number; footerBrand: SuFullLandscapeFooterBrand }) {
  return (
    <SuFullLandscapePage number={number} variant="appendix" footerBrand={footerBrand}>
      <h2>Appendix A: chapter comparisons</h2>
      {model.chapters.map((chapter) => (
        <SuFullVerticalPeerChart
          chapterKey={chapter.key}
          key={chapter.key}
          questions={chapter.questions}
          instanceId={`appendix-${chapter.key}`}
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
    <div className="su-public-brand su-report su-full-landscape">
      <div className="su-full-landscape-report" data-testid="su-full-landscape-report">
        {model.pages.map((page) => {
        switch (page.kind) {
          case "cover": return <CoverPage key={page.number} number={page.number} report={report} />;
          case "preface": return <PrefacePage key={page.number} number={page.number} footerBrand={report} />;
          case "contents": return <ContentsPage key={page.number} number={page.number} footerBrand={report} />;
          case "introduction": return <IntroductionPage key={page.number} number={page.number} report={report} model={model} />;
          case "profile": return <ProfilePage key={page.number} number={page.number} model={model} footerBrand={report} />;
          case "peer-dashboard": return <PeerDashboardPage key={page.number} number={page.number} model={model} footerBrand={report} />;
          case "chapter": {
            const chapter = chapters.get(page.chapterKey);
            if (!chapter) throw new Error(`Landscape chapter page ${page.number} is missing ${page.chapterKey}`);
            return <ChapterPage chapter={chapter} key={page.number} number={page.number} footerBrand={report} />;
          }
          case "detail": return <DetailPage key={page.number} page={page} questions={questions} peerProvenance={model.peerProvenance} footerBrand={report} />;
          case "conclusion": return <ConclusionPage key={page.number} number={page.number} report={report} model={model} contactEmail={contactEmail} />;
          case "appendix": return <AppendixPage key={page.number} number={page.number} model={model} footerBrand={report} />;
          default: {
            const impossible: never = page;
            throw new Error(`Unsupported landscape page: ${JSON.stringify(impossible)}`);
          }
        }
        })}
      </div>
    </div>
  );
}
