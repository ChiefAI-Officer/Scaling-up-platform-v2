import type {
  SuFullLandscapeChapterKey,
  SuFullLandscapeQuestion,
} from "@/lib/assessments/su-full-landscape-report";

const CHAPTER_CLASS: Readonly<Record<SuFullLandscapeChapterKey, string>> = {
  people: "is-people",
  strategy: "is-strategy",
  execution: "is-execution",
  cash: "is-cash",
  you: "is-you",
};

export function chapterColorClass(key: SuFullLandscapeChapterKey): string {
  return CHAPTER_CLASS[key];
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function formatValue(value: number): string {
  return value.toFixed(1);
}

function fillWidth(value: number): string {
  return `${clamp(value, 0, 10) * 10}%`;
}

function barFillClass(kind: "you" | "peers"): string {
  return `su-full-landscape-bar-fill su-full-landscape-bar-fill--${kind}`;
}

function BarMeasure({
  label,
  value,
}: {
  label: "You" | "Peers";
  value: number;
}) {
  const kind = label === "You" ? "you" : "peers";
  return (
    <div className="su-full-landscape-bar-measure">
      <span className="su-full-landscape-bar-label">{label}</span>
      <span className="su-full-landscape-bar-track" aria-hidden="true">
        <span
          className={barFillClass(kind)}
          style={{ width: fillWidth(value) }}
        />
      </span>
      <strong className="su-full-landscape-bar-value">{formatValue(value)}</strong>
    </div>
  );
}

export function SuFullVerticalPeerChart({
  chapterKey,
  questions,
  title = "Section comparison",
  instanceId = chapterKey,
}: {
  chapterKey: SuFullLandscapeChapterKey;
  questions: readonly SuFullLandscapeQuestion[];
  title?: string;
  instanceId?: string;
}) {
  const points = questions
    .map((question, index) => `${clamp(question.peers, 0, 10) * 10},${index + 0.5}`)
    .join(" ");

  return (
    <section
      className={`su-full-landscape-vertical-chart ${chapterColorClass(chapterKey)}`}
      data-testid={`su-landscape-vertical-chart-${chapterKey}`}
      aria-labelledby={`su-landscape-vertical-chart-title-${instanceId}`}
    >
      <h3
        className="su-full-landscape-chart-title"
        id={`su-landscape-vertical-chart-title-${instanceId}`}
      >
        {title}
      </h3>
      <div className="su-full-landscape-chart-plot">
        <svg
          aria-hidden="true"
          className="su-full-landscape-peer-contour"
          viewBox={`0 0 100 ${Math.max(1, questions.length)}`}
          preserveAspectRatio="none"
        >
          <polyline
            fill="none"
            points={points}
            stroke="currentColor"
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        <ol className="su-full-landscape-chart-rows">
          {questions.map((question) => (
            <li
              className="su-full-landscape-chart-row"
              key={question.stableKey}
              data-peer-score={question.peers}
              data-testid={`su-landscape-vertical-row-${question.stableKey}`}
            >
              <h4 className="su-full-landscape-chart-question">
                {question.label}
              </h4>
              <span className="su-full-landscape-vertical-you-label">You</span>
              <span className="su-full-landscape-vertical-scale" aria-hidden="true">
                <span
                  className={barFillClass("you")}
                  style={{ width: fillWidth(question.you) }}
                />
              </span>
              <strong className="su-full-landscape-bar-value">{formatValue(question.you)}</strong>
              <span className="sr-only">
                You {formatValue(question.you)}. Peers {formatValue(question.peers)}.
              </span>
            </li>
          ))}
        </ol>
      </div>
      <p className="su-full-landscape-chart-legend">
        <span aria-hidden="true" className="su-full-landscape-chart-legend-mark" />
        <span>Score of Peers</span>
      </p>
    </section>
  );
}

export function SuFullDetailPairedBars({
  chapterKey,
  question,
}: {
  chapterKey: SuFullLandscapeChapterKey;
  question: SuFullLandscapeQuestion;
}) {
  return (
    <div
      className={`su-full-landscape-detail-bars ${chapterColorClass(chapterKey)}`}
      data-testid={`su-landscape-detail-bars-${question.stableKey}`}
    >
      <BarMeasure label="You" value={question.you} />
      <BarMeasure label="Peers" value={question.peers} />
    </div>
  );
}
