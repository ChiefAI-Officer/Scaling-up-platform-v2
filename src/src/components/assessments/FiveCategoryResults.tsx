import { domainColor } from "@/lib/assessments/report-presentation";
import type { GroupScoredCategoryResult } from "@/lib/assessments/group-report-model";

const DOMAIN_TEXT_COLOR: Record<string, string> = {
  people: "#946b36",
  strategy: "#008bd2",
  execution: "#946b36",
  cash: "#6f9200",
};

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return "0";
  if (Number.isInteger(value)) return String(value);
  return (Math.round(value * 100) / 100).toString();
}

/**
 * The Five Dysfunctions category treatment shared visually with the individual
 * report: score card on the left, matching tier narrative on the right.
 */
export interface DomainResultCard {
  key: string;
  label: string;
  color: string;
  avg: number | null;
  pct: number;
  points: number | null;
  message: string | null;
}

export function DomainResultsCards({
  categories,
  eyebrow,
  title,
  testId,
  split,
}: {
  categories: DomainResultCard[];
  eyebrow: string;
  title: string;
  testId: string;
  split: boolean;
}) {
  const hasMessages = categories.some((category) => category.message !== null);
  return (
    <section
      className="su-report-decisions"
      data-testid={testId}
    >
      <div className="su-report-eyebrow">{eyebrow}</div>
      <h2 className="su-h2 su-report-sec-title">{title}</h2>
      <div
        className={[
          "su-report-card-grid",
          hasMessages ? "su-report-card-grid-with-messages" : null,
          split ? "su-report-card-grid-split" : null,
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {categories.map((category) => {
          const scoreContent = (
            <>
              <div className="su-report-decision-head">
                <span className="su-report-decision-name">{category.label}</span>
                <span
                  className="su-report-decision-avg"
                  style={{
                    color:
                      DOMAIN_TEXT_COLOR[category.key.toLowerCase()] ?? category.color,
                  }}
                >
                  {category.avg === null ? "—" : formatNumber(category.avg)}
                </span>
              </div>
              <div className="su-report-decision-bar">
                <i style={{ width: `${category.pct}%`, backgroundColor: category.color }} />
              </div>
              <div className="su-report-decision-sub">
                {category.points === null ? "— points" : `${formatNumber(category.points)} points`}
              </div>
            </>
          );
          const messageContent = category.message ? (
            <p
              className="su-report-domain-tier-message"
              data-testid={`domain-tier-message-${category.key}`}
            >
              {category.message}
            </p>
          ) : null;

          if (!split) {
            return (
              <div
                className={
                  hasMessages
                    ? "su-report-decision-card su-report-decision-card-with-message"
                    : "su-report-decision-card"
                }
                key={category.key}
                data-testid={`decision-card-${category.key}`}
                style={{ borderLeftColor: category.color }}
              >
                {hasMessages ? (
                  <>
                    <div className="su-report-decision-score">{scoreContent}</div>
                    {messageContent}
                  </>
                ) : (
                  scoreContent
                )}
              </div>
            );
          }

          return (
            <div
              className="su-report-domain-result-row"
              key={category.key}
              data-testid={`decision-card-${category.key}`}
            >
              <div
                className="su-report-decision-card su-report-domain-score-card"
                style={{ borderLeftColor: category.color }}
              >
                {scoreContent}
              </div>
              {messageContent}
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function FiveCategoryResults({
  categories,
}: {
  categories: GroupScoredCategoryResult[];
}) {
  return (
    <DomainResultsCards
      testId="group-scored-five-categories"
      eyebrow="How the team scored, by area"
      title="The Five Categories"
      split
      categories={categories.map((category) => {
        const color = domainColor(category.key);
        return {
          key: category.key,
          label: category.label,
          color,
          avg: category.averagePoints,
          pct:
            category.averagePoints === null
              ? 0
              : Math.max(0, Math.min(100, category.averagePoints * 10)),
          points: category.points,
          message: category.message,
        };
      })}
    />
  );
}
