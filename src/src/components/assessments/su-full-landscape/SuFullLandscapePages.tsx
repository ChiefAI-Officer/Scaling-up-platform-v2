import type { ReactNode } from "react";

import type { SuFullLandscapeChapterKey } from "@/lib/assessments/su-full-landscape-report";

export function SuFullLandscapePage({
  number,
  chapterKey,
  variant,
  children,
}: {
  number: number;
  chapterKey?: SuFullLandscapeChapterKey;
  variant?: "chapter" | "detail" | "appendix";
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
      <main className="su-full-landscape-page-body">{children}</main>
      <footer className="su-full-landscape-page-footer">
        <span>Scaling Up Assessment</span>
        <span aria-label={`Page ${number}`}>{number}</span>
      </footer>
    </section>
  );
}
