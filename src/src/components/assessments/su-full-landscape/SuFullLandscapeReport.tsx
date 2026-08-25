import type { RespondentReport } from "@/lib/assessments/respondent-report";
import { CoachLogo } from "@/components/assessments/CoachLogo";
import type {
  SuFullLandscapeChapter,
  SuFullLandscapeChapterKey,
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
  const pageNumber = (kind: "introduction" | "profile" | "conclusion") => {
    const page = model.pages.find((candidate) => candidate.kind === kind);
    if (!page) throw new Error(`Landscape contents is missing the ${kind} page`);
    return page.number;
  };
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
  const detailRange = (firstQuestionKey: string, lastQuestionKey: string) => {
    const firstPage = detailPageNumber(firstQuestionKey);
    const lastPage = detailPageNumber(lastQuestionKey);
    return firstPage === lastPage ? String(firstPage) : `${firstPage}–${lastPage}`;
  };
  const appendixPage = model.pages.find((candidate) => candidate.kind === "appendix");
  if (!appendixPage) throw new Error("Landscape contents is missing the appendix page");
  const entries = [
    {
      key: "people",
      label: "People",
      page: chapterPageNumber("people"),
      subsections: [
        { key: "your-employees", label: "Your Employees", pages: detailRange("Q01", "Q08") },
        { key: "company-culture", label: "Company Culture", pages: detailRange("Q09", "Q13") },
      ],
    },
    {
      key: "strategy",
      label: "Strategy",
      page: chapterPageNumber("strategy"),
      subsections: [
        { key: "goals-and-strategy", label: "Goals and Strategy", pages: detailRange("Q14", "Q20") },
      ],
    },
    {
      key: "execution",
      label: "Execution",
      page: chapterPageNumber("execution"),
      subsections: [
        { key: "leadership-team", label: "Leadership Team", pages: detailRange("Q21", "Q24") },
        { key: "operational-processes", label: "Operational Processes", pages: detailRange("Q25", "Q29") },
        { key: "sales-and-marketing", label: "Sales and Marketing", pages: detailRange("Q30", "Q34") },
        { key: "scalability-innovation-and-technology", label: "Scalability, Innovation and Technology", pages: detailRange("Q35", "Q40") },
      ],
    },
    {
      key: "cash",
      label: "Cash",
      page: chapterPageNumber("cash"),
      subsections: [
        { key: "finance-and-cash", label: "Finance and Cash", pages: detailRange("Q41", "Q45") },
      ],
    },
    {
      key: "you",
      label: "You",
      page: chapterPageNumber("you"),
      subsections: [
        { key: "your-leadership", label: "Your Leadership", pages: detailRange("Q46", "Q55") },
        { key: "internal-communication", label: "Internal Communication", pages: detailRange("Q56", "Q61") },
      ],
    },
  ] as const;
  return (
    <SuFullLandscapePage number={number} footerBrand={footerBrand}>
      <section className="su-full-toc" aria-label="Table of contents">
        <h2>Table of Contents</h2>
        <div className="su-full-toc-layout">
          <ol className="su-full-toc-list">
            <li className="su-full-toc-entry su-full-toc-entry--plain" data-testid="toc-introduction">
              <span className="su-full-toc-index" aria-hidden="true" />
              <span>Introduction</span> <span className="su-full-toc-page">{pageNumber("introduction")}</span>
            </li>
            <li className="su-full-toc-entry su-full-toc-entry--plain" data-testid="toc-profile">
              <span className="su-full-toc-index">1.</span>
              <span>Your Profile</span> <span className="su-full-toc-page">{pageNumber("profile")}</span>
            </li>
            {entries.map((entry, index) => (
              <li className={`su-full-toc-group is-${entry.key}`} key={entry.key}>
                <div className="su-full-toc-entry" data-testid={`toc-domain-${entry.key}`}>
                  <span className="su-full-toc-index">{index + 2}.</span>
                  <span className={`su-full-toc-domain su-full-toc-domain--${entry.key}`}>{entry.label}</span>{" "}
                  <span className="su-full-toc-page">{entry.page}</span>
                </div>
                <ul className="su-full-toc-subsections">
                  {entry.subsections.map((subsection) => (
                    <li data-testid={`toc-subsection-${subsection.key}`} key={subsection.key}>
                      <span className="su-full-toc-subsection">{subsection.label}</span>{" "}
                      <span className="su-full-toc-page">{subsection.pages}</span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
            <li className="su-full-toc-entry su-full-toc-entry--plain" data-testid="toc-conclusion">
              <span className="su-full-toc-index" aria-hidden="true" />
              <span>In conclusion</span> <span className="su-full-toc-page">{pageNumber("conclusion")}</span>
            </li>
            <li className="su-full-toc-entry su-full-toc-entry--plain" data-testid="toc-appendix">
              <span className="su-full-toc-index" aria-hidden="true" />
              <span>Appendix A</span> <span className="su-full-toc-page">{appendixPage.number}</span>
            </li>
          </ol>
          <figure className="su-full-toc-decisions">
            <div className="su-full-toc-decision-graphic">
              <svg
                aria-label="Five Scaling Up decisions"
                className="su-full-toc-decision-ring"
                role="img"
                viewBox="0 0 120 120"
              >
                {(["people", "strategy", "execution", "cash", "you"] as const).map((chapter, index) => (
                  <circle
                    className={`is-${chapter}`}
                    cx="60"
                    cy="60"
                    fill="none"
                    key={chapter}
                    pathLength="100"
                    r="39"
                    stroke="var(--chapter-color)"
                    strokeDasharray="19 81"
                    strokeWidth="15"
                    transform={`rotate(${-90 + (index * 72)} 60 60)`}
                  />
                ))}
                <circle className="su-full-toc-decision-center is-you" cx="60" cy="60" fill="var(--chapter-color)" r="20" />
                <text fill="#ffffff" fontSize="12" fontWeight="700" textAnchor="middle" x="60" y="64">YOU</text>
              </svg>
              <span aria-hidden="true" className="su-full-toc-decision-label su-full-toc-decision-label--people is-people">people</span>
              <span aria-hidden="true" className="su-full-toc-decision-label su-full-toc-decision-label--strategy is-strategy">strategy</span>
              <span aria-hidden="true" className="su-full-toc-decision-label su-full-toc-decision-label--execution is-execution">execution</span>
              <span aria-hidden="true" className="su-full-toc-decision-label su-full-toc-decision-label--cash is-cash">cash</span>
            </div>
            <figcaption>
              The five Scaling Up decisions organize the core report. Subsections are indented beneath the decision they belong to.
            </figcaption>
          </figure>
        </div>
      </section>
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
  const strongestRelative = [...model.profileRows]
    .sort((a, b) => b.deviation - a.deviation || a.stableKey.localeCompare(b.stableKey))[0];
  const weakestRelative = [...model.profileRows]
    .sort((a, b) => a.deviation - b.deviation || a.stableKey.localeCompare(b.stableKey))[0];
  const formatDeviation = (value: number) => `${value >= 0 ? "+" : ""}${formatNumber(value)}`;

  return (
    <SuFullLandscapePage number={number} footerBrand={footerBrand}>
      <section className="su-full-profile" aria-label="Your profile">
        <h2>Your Profile</h2>
        <p className="su-full-profile-intro">
          We begin with an overview of the main sections. Your results are compared with the peer benchmark associated with this completed assessment.
        </p>
        <div className="su-full-profile-layout">
          <table className="su-full-profile-table">
            <thead><tr><th scope="col">Chapter / subsection</th><th scope="col">You</th><th scope="col">Peers</th><th scope="col">Deviation</th></tr></thead>
            <tbody>
              {model.chapters.flatMap((chapter) => [
                <tr
                  className={`su-full-landscape-profile-row--chapter is-${chapter.key}`}
                  data-testid={`profile-domain-${chapter.key}`}
                  key={`chapter-${chapter.key}`}
                >
                  <th scope="row">{chapter.label}</th>
                  <td>{formatNumber(chapter.youAverage)}</td>
                  <td>{formatNumber(chapter.peersAverage)}</td>
                  <td>{formatDeviation(chapter.youAverage - chapter.peersAverage)}</td>
                </tr>,
                ...model.profileRows
                  .filter((row) => row.chapterKey === chapter.key)
                  .map((row) => (
                    <tr className={`su-full-landscape-profile-row--subsection is-${chapter.key}`} key={row.stableKey}>
                      <th scope="row">{row.label}</th>
                      <td>{formatNumber(row.youAverage)}</td>
                      <td>{formatNumber(row.peersAverage)}</td>
                      <td>{formatDeviation(row.deviation)}</td>
                    </tr>
                  )),
              ])}
            </tbody>
          </table>
          <aside className="su-full-profile-commentary" data-testid="profile-result-commentary">
            <p><strong>{model.strongestChapter.label} is your strongest chapter.</strong> It has your highest chapter score in this completed assessment.</p>
            <p><strong>{model.weakestChapter.label} is the current focus chapter.</strong> It has your lowest chapter score in this completed assessment.</p>
            <p><strong>{strongestRelative.label} has the highest relative deviation from Peers.</strong> The difference is {formatDeviation(strongestRelative.deviation)}.</p>
            <p><strong>{weakestRelative.label} has the lowest relative deviation from Peers.</strong> The difference is {formatDeviation(weakestRelative.deviation)}.</p>
            <p>Relative deviations compare the two displayed scores; they are not separate findings or readiness labels.</p>
          </aside>
        </div>
      </section>
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
