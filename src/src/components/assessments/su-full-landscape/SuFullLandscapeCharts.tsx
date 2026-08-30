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

function barFillClass(kind: "you" | "previous" | "peers"): string {
  return `su-full-landscape-bar-fill su-full-landscape-bar-fill--${kind}`;
}

function BarMeasure({
  chapterKey,
  label,
  questionKey,
  value,
}: {
  chapterKey: SuFullLandscapeChapterKey;
  label: "You" | "Focus" | "Earlier" | "Peers";
  questionKey: string;
  value: number;
}) {
  const kind = label === "Peers" ? "peers" : label === "Earlier" ? "previous" : "you";
  return (
    <div
      className={`su-full-landscape-bar-measure ${chapterColorClass(chapterKey)}`}
      data-testid={`su-full-detail-${kind}-${questionKey}`}
    >
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
  previousByKey,
}: {
  chapterKey: SuFullLandscapeChapterKey;
  questions: readonly Pick<
    SuFullLandscapeQuestion,
    "stableKey" | "label" | "you" | "peers"
  >[];
  title?: string;
  instanceId?: string;
  previousByKey?: ReadonlyMap<string, number>;
}) {
  const points = questions
    .map((question, index) => `${clamp(question.peers, 0, 10) * 10},${index + 0.5}`)
    .join(" ");
  const previousPoints = previousByKey
    ? questions.map((question, index) => `${clamp(previousByKey.get(question.stableKey) ?? 0, 0, 10) * 10},${index + 0.5}`).join(" ")
    : null;

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
          {previousPoints ? <polyline
            className="su-full-landscape-previous-contour"
            fill="none"
            points={previousPoints}
            stroke="currentColor"
            strokeDasharray="5 4"
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
          /> : null}
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
              <span className="su-full-landscape-vertical-you-label">{previousByKey ? "Focus" : "You"}</span>
              <span className="su-full-landscape-vertical-scale" aria-hidden="true">
                <span
                  className={barFillClass("you")}
                  style={{ width: fillWidth(question.you) }}
                />
              </span>
              <strong className="su-full-landscape-bar-value">{formatValue(question.you)}</strong>
              {previousByKey ? <>
                <span className="su-full-landscape-mobile-peer-label">Earlier</span>
                <span className="su-full-landscape-mobile-peer-scale" aria-hidden="true"><span className={barFillClass("previous")} style={{ width: fillWidth(previousByKey.get(question.stableKey) ?? 0) }} /></span>
                <strong className="su-full-landscape-mobile-peer-value">{formatValue(previousByKey.get(question.stableKey) ?? 0)}</strong>
              </> : null}
              <span className="su-full-landscape-mobile-peer-label">Peers</span>
              <span className="su-full-landscape-mobile-peer-scale" aria-hidden="true">
                <span
                  className={barFillClass("peers")}
                  style={{ width: fillWidth(question.peers) }}
                />
              </span>
              <strong className="su-full-landscape-mobile-peer-value">
                {formatValue(question.peers)}
              </strong>
              <span className="sr-only">
                {previousByKey ? `Focus ${formatValue(question.you)}. Earlier ${formatValue(previousByKey.get(question.stableKey) ?? 0)}. ` : `You ${formatValue(question.you)}. `}Peers {formatValue(question.peers)}.
              </span>
            </li>
          ))}
        </ol>
      </div>
      <p className="su-full-landscape-chart-legend">
        {previousByKey ? <><span aria-hidden="true" className="su-full-landscape-chart-legend-mark is-previous" /><span>Score of Previous</span></> : null}
        <span aria-hidden="true" className="su-full-landscape-chart-legend-mark" />
        <span>Score of Peers</span>
      </p>
    </section>
  );
}

export function SuFullDetailPairedBars({
  chapterKey,
  question,
  previous,
}: {
  chapterKey: SuFullLandscapeChapterKey;
  question: SuFullLandscapeQuestion;
  previous?: number;
}) {
  return (
    <div
      className={`su-full-landscape-detail-bars ${chapterColorClass(chapterKey)}`}
      data-testid={`su-landscape-detail-bars-${question.stableKey}`}
    >
      <BarMeasure chapterKey={chapterKey} label={previous === undefined ? "You" : "Focus"} questionKey={question.stableKey} value={question.you} />
      {previous === undefined ? null : <BarMeasure chapterKey={chapterKey} label="Earlier" questionKey={question.stableKey} value={previous} />}
      <BarMeasure chapterKey={chapterKey} label="Peers" questionKey={question.stableKey} value={question.peers} />
    </div>
  );
}
