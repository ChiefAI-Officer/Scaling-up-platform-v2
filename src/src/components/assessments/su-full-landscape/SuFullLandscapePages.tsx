import type { ReactNode } from "react";

import type { SuFullLandscapeChapterKey } from "@/lib/assessments/su-full-landscape-report";
import { CoachLogo } from "@/components/assessments/CoachLogo";

export type SuFullLandscapeFooterBrand = Readonly<{
  coachLogoUrl?: string | null;
  coachName?: string | null;
}>;

export function SuFullLandscapePage({
  number,
  chapterKey,
  variant,
  footerBrand,
  children,
}: {
  number: number;
  chapterKey?: SuFullLandscapeChapterKey;
  variant?: "chapter" | "detail" | "appendix";
  footerBrand: SuFullLandscapeFooterBrand;
  children: ReactNode;
}) {
  return (
    <section
      className={`su-full-landscape-page${chapterKey ? ` is-${chapterKey}` : ""}${variant ? ` su-full-landscape-page--${variant}` : ""}`}
      data-testid={`su-full-landscape-page-${number}`}
      data-page-number={number}
    >
      <header className="su-full-landscape-page-header" aria-hidden="true">
        <span className="is-people" />
        <span className="is-strategy" />
        <span className="is-execution" />
        <span className="is-cash" />
        <span className="is-you" />
      </header>
      <div className="su-full-landscape-page-body">{children}</div>
      <footer className="su-full-landscape-page-footer">
        <span className="su-full-landscape-page-footer-brand">
          <span>Scaling Up Assessment</span>
          <CoachLogo
            url={footerBrand.coachLogoUrl}
            name={footerBrand.coachName}
            variant="footer"
          />
        </span>
        <span aria-label={`Page ${number}`}>{number}</span>
      </footer>
    </section>
  );
}
