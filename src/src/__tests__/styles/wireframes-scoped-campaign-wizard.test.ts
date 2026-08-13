import { readFileSync } from "node:fs";
import { join } from "node:path";

const css = readFileSync(
  join(process.cwd(), "src", "styles", "wireframes-scoped.css"),
  "utf8",
);

describe("wireframes-scoped campaign wizard responsive stepper", () => {
  it("suppresses only the responsive full stepper below the sm breakpoint", () => {
    expect(css).toContain("@media (max-width: 639px)");
    expect(css).toMatch(
      /\.wf-scope \[data-responsive-campaign-wizard\] \.wf-stepper\[data-responsive-full-stepper\]\s*\{\s*display:\s*none;/,
    );
  });
});
