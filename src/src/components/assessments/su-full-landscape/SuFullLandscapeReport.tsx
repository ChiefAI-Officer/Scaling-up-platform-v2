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
import { ReportHtmlSection } from "@/components/assessments/ReportHtmlSection";
import type { SafeReportHtmlFragment } from "@/lib/assessments/report-html";
import type { ReactNode } from "react";
import { buildSuFullPeerDisclosureModel } from "@/lib/assessments/su-full-peer-disclosure";
import { respondentNameMatchesEmail } from "@/lib/assessments/respondent-display-name";

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
    <aside className="su-full-landscape-peer-disclosure" aria-label="Peer benchmark information">
      <p>{disclosure.disclosure}</p>
      <p className="su-full-landscape-peer-provenance">{disclosure.provenanceLabel}</p>
    </aside>
  );
}

function CoverPage({ report, number }: { report: RespondentReport; number: number }) {
  const respondentNameIsEmail = respondentNameMatchesEmail(
    report.respondentName,
    report.respondentEmail,
  );

  return (
    <SuFullLandscapePage number={number} variant="cover" footerBrand={report}>
      <div className="su-full-landscape-cover-brand">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          className="su-full-landscape-cover-mark"
          src="/brand/su-logo-white.svg"
          alt="Scaling Up"
          width={180}
          height={24}
        />
        <CoachLogo url={report.coachLogoUrl} name={report.coachName} variant="cover" />
      </div>
      <div className="su-full-landscape-cover-title">
        <p>Scaling Up Assessment</p>
        <h1>{report.assessmentName}</h1>
        {report.campaignLabel && report.campaignLabel !== report.assessmentName
          ? <p>{report.campaignLabel}</p>
          : null}
      </div>
      <div className="su-full-landscape-cover-meta">
        {!respondentNameIsEmail ? (
          <p className="su-full-landscape-cover-for">
            Report for: {report.respondentName}{report.jobTitle ? ` · ${report.jobTitle}` : ""}
          </p>
        ) : null}
        {report.respondentEmail ? <p>Email: {report.respondentEmail}</p> : null}
        <p className="su-full-landscape-cover-sub">
          {report.companyName ? `${report.companyName} · ` : ""}{formatDate(report.submittedAt)}
        </p>
      </div>
    </SuFullLandscapePage>
  );
}

function CustomHtmlPage({
  report,
  html,
  number,
}: {
  report: RespondentReport;
  html: SafeReportHtmlFragment;
  number: number;
}) {
  return (
    <SuFullLandscapePage number={number} footerBrand={report}>
      <div className="su-full-landscape-custom-content">
        <ReportHtmlSection
          position="introduction"
          html={html}
          personalization={report}
        />
      </div>
    </SuFullLandscapePage>
  );
}

function ContentsPage({ model, number, footerBrand }: {
  model: SuFullLandscapeReportModel;
  number: number;
  footerBrand: SuFullLandscapeFooterBrand;
}) {
  const chapterPageNumber = (chapterKey: SuFullLandscapeChapterKey) => {
    const page = model.pages.find((candidate) =>
      candidate.kind === "chapter" && candidate.chapterKey === chapterKey,
    );
    if (!page) throw new Error(`Landscape contents is missing the ${chapterKey} chapter page`);
    return page.number;
  };
  const detailPageNumber = (questionKey: string) => {
    const page = model.pages.find((candidate) =>
      candidate.kind === "detail" && candidate.questionKeys.includes(questionKey),
    );
    if (!page) throw new Error(`Landscape contents is missing the ${questionKey} detail page`);
    return page.number;
  };
  const detailRange = (firstQuestionKey: string, lastQuestionKey: string) =>
    `${detailPageNumber(firstQuestionKey)}–${detailPageNumber(lastQuestionKey)}`;
  const appendixPage = model.pages.find((candidate) => candidate.kind === "appendix");
  if (!appendixPage) throw new Error("Landscape contents is missing the appendix page");
  const entries = [
    ["People", chapterPageNumber("people"), [`Your Employees (${detailRange("Q01", "Q08")})`, `Company Culture (${detailRange("Q09", "Q13")})`]],
    ["Strategy", chapterPageNumber("strategy"), [`Strategy (${detailRange("Q14", "Q20")})`]],
    ["Execution", chapterPageNumber("execution"), [`Leadership Team (${detailRange("Q21", "Q24")})`, `Operational Processes (${detailRange("Q25", "Q29")})`, `Sales and Marketing (${detailRange("Q30", "Q34")})`, `Scalability, Innovation and Technology (${detailRange("Q35", "Q40")})`]],
    ["Cash", chapterPageNumber("cash"), [`Cash (${detailRange("Q41", "Q45")})`]],
    ["You", chapterPageNumber("you"), [`Your Leadership (${detailRange("Q46", "Q55")})`, `Internal Communication (${detailRange("Q56", "Q61")})`]],
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
      <p>Appendix A: chapter comparisons <span>{appendixPage.number}</span></p>
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

function ConclusionPage({ report, model, contactEmail, number, beforeConclusion, conclusionHtml }: {
  report: RespondentReport;
  model: SuFullLandscapeReportModel;
  contactEmail?: string | null;
  number: number;
  beforeConclusion?: ReactNode;
  conclusionHtml?: SafeReportHtmlFragment | null;
}) {
  return (
    <SuFullLandscapePage number={number} footerBrand={report}>
      {beforeConclusion}
      <h2>Conclusion</h2>
      <p><strong>ScaleUp Score</strong> {scaleUpScore(model.scaleUpScore)}</p>
      <p>Your strongest chapter is {model.strongestChapter.label}; Your focus chapter is {model.weakestChapter.label}.</p>
      {conclusionHtml ? (
        <div className="su-full-landscape-custom-content">
          <ReportHtmlSection
            position="conclusion"
            html={conclusionHtml}
            personalization={report}
          />
        </div>
      ) : (
        <DefaultNextSteps report={report} contactEmail={contactEmail} />
      )}
    </SuFullLandscapePage>
  );
}

function DefaultNextSteps({ report, contactEmail }: {
  report: RespondentReport;
  contactEmail?: string | null;
}) {
  return (
    <>
      <h3>Next steps</h3>
      <p>Choose one priority from the feedback, agree a concrete owner and review date, and return to the remaining findings in your next planning cycle.</p>
      {(contactEmail ?? report.referringCoachEmail) ? (
        <p><a href={`mailto:${contactEmail ?? report.referringCoachEmail}`}>Contact your coach</a></p>
      ) : null}
    </>
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
  beforeConclusion,
}: {
  report: RespondentReport;
  model: SuFullLandscapeReportModel;
  contactEmail?: string | null;
  beforeConclusion?: ReactNode;
}) {
  const chapters = new Map(model.chapters.map((chapter) => [chapter.key, chapter]));
  const questions = questionByKey(model);

  return (
    <div className="su-public-brand su-report su-full-landscape">
      <div className="su-full-landscape-report" data-testid="su-full-landscape-report">
        {model.pages.map((page) => {
        switch (page.kind) {
          case "cover": return <CoverPage key={page.number} number={page.number} report={report} />;
          case "preface": return <CustomHtmlPage key={page.number} number={page.number} report={report} html={report.reportHtml!.introductionHtml!} />;
          case "contents": return <ContentsPage key={page.number} model={model} number={page.number} footerBrand={report} />;
          case "introduction": return <IntroductionPage key={page.number} number={page.number} report={report} model={model} />;
          case "profile": return <ProfilePage key={page.number} number={page.number} model={model} footerBrand={report} />;
          case "chapter": {
            const chapter = chapters.get(page.chapterKey);
            if (!chapter) throw new Error(`Landscape chapter page ${page.number} is missing ${page.chapterKey}`);
            return <ChapterPage chapter={chapter} key={page.number} number={page.number} footerBrand={report} />;
          }
          case "detail": return <DetailPage key={page.number} page={page} questions={questions} peerProvenance={model.peerProvenance} footerBrand={report} />;
          case "conclusion": return <ConclusionPage key={page.number} number={page.number} report={report} model={model} contactEmail={contactEmail} beforeConclusion={beforeConclusion} conclusionHtml={report.reportHtml?.conclusionHtml} />;
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
