import type {
  LinkTarget,
  MarketingCtaConfigV1,
} from "@/lib/assessments/marketing-cta";
import type { PublicMarketingScoreBand } from "@/lib/assessments/public-marketing-result";
import "@/styles/public-marketing-result.css";

function destination(
  target: LinkTarget,
  referringCoachEmail: string | null,
): string {
  if (target.kind === "url") return target.href;
  if (target.kind === "mailto") return `mailto:${target.address}`;
  if (target.kind === "tel") return `tel:${target.number.replace(/[^+0-9]/g, "")}`;
  return referringCoachEmail
    ? `mailto:${referringCoachEmail}`
    : "https://scalingup.com/coaches";
}

export function PublicMarketingResult({
  score,
  scoreBands,
  marketingCta,
  referringCoachEmail,
}: {
  score: number;
  scoreBands: PublicMarketingScoreBand[];
  marketingCta: MarketingCtaConfigV1;
  referringCoachEmail: string | null;
}) {
  const roundedScore = Math.max(0, Math.min(100, Math.round(score)));
  return (
    <aside className="public-marketing-result-addon" aria-label="Marketing next steps">
      {scoreBands.length > 0 && (
        <section className="public-marketing-bands" aria-label="Score guide">
          <div className="public-marketing-score" aria-label={`Overall score ${roundedScore} percent`}>
            <span>{roundedScore}</span>
            <small>Your overall score</small>
          </div>
          <ol>
            {scoreBands.map((band) => {
              const active = roundedScore >= band.min && roundedScore <= band.max;
              return (
                <li key={`${band.min}-${band.max}`} aria-current={active ? "true" : undefined}>
                  <strong>{band.label}</strong>
                  <span>{band.headline}</span>
                  <small>{band.body}</small>
                </li>
              );
            })}
          </ol>
        </section>
      )}
      <section className="public-marketing-cta-blocks">
        {marketingCta.blocks.map((block) => {
          if (block.type === "text") {
            return (
              <div key={block.id} className={`public-marketing-copy public-marketing-copy--${block.align}`}>
                {block.lead && <strong>{block.lead}</strong>}
                <p>{block.body}</p>
              </div>
            );
          }
          if (block.type === "divider") return <hr key={block.id} />;
          if (block.type === "image") {
            const image = (
              // Authored HTTPS/managed path is validated and compiled server-side.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={block.src} alt={block.alt} className={`public-marketing-image public-marketing-image--${block.width}`} />
            );
            return block.link ? (
              <a key={block.id} href={destination(block.link, referringCoachEmail)}>{image}</a>
            ) : (
              <div key={block.id}>{image}</div>
            );
          }
          return (
            <a
              key={block.id}
              href={destination(block.target, referringCoachEmail)}
              className={`public-marketing-action public-marketing-action--${block.style}`}
              target={block.newTab ? "_blank" : undefined}
              rel={block.newTab ? "noopener noreferrer" : undefined}
            >
              {block.label}
            </a>
          );
        })}
      </section>
    </aside>
  );
}
