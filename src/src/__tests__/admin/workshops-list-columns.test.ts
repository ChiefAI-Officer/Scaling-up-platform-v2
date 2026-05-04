/**
 * BUG-02-admin-followup (May 4 2026): Jeff explicitly asked for two columns on
 * the ADMIN dashboard at the Apr 30 call (transcript 1:13–2:11):
 *   "the admin dashboard, it actually shows $200, but it's using the label
 *    for the workshop in this column. … I'm thinking we should probably put
 *    two columns, … a cost columns that actually shows what we charged it
 *    for, and the other one that shows that it was a half-day, full-day,
 *    whatever the label of that workshop is."
 *
 * The original BUG-02 commit (603b6f9) split the column on the COACH portal
 * but missed the admin dashboard. Live re-verification on May 4 confirmed the
 * gap. This test guards against regression: the admin /workshops page must
 * render BOTH a Cost column header AND a Workshop Type column header.
 */

import fs from "node:fs";
import path from "node:path";

const ADMIN_WORKSHOPS_PAGE = path.resolve(
    __dirname,
    "../../app/(dashboard)/workshops/page.tsx"
);

describe("BUG-02-admin-followup: admin /workshops table headers", () => {
    let source: string;
    beforeAll(() => {
        source = fs.readFileSync(ADMIN_WORKSHOPS_PAGE, "utf8");
    });

    it("renders a 'Cost' column header in the table", () => {
        const hasCostHeader = /<th[^>]*>\s*[\s\S]{0,200}?Cost\s*<\/th>/.test(source);
        expect(hasCostHeader).toBe(true);
    });

    it("renders a 'Workshop Type' column header in the table (BUG-02-admin-followup)", () => {
        const hasWorkshopTypeHeader = /<th[^>]*>\s*[\s\S]{0,200}?Workshop\s*Type\s*<\/th>/.test(
            source
        );
        expect(hasWorkshopTypeHeader).toBe(true);
    });

    it("includes pricingTier in the Prisma include so the column has data to render", () => {
        // The findMany must include pricingTier so workshop.pricingTier.name is available
        const hasPricingTierInclude = /pricingTier:\s*true/.test(source);
        expect(hasPricingTierInclude).toBe(true);
    });
});
