/**
 * BUG-MAY6-5 (Jeff May 7 standing meeting):
 *
 * Coach view at (portal)/portal/workshops/[id]/page.tsx aggregates ALL
 * ApprovalQueue rows (WORKSHOP_REQUEST + CUSTOM_PRICING) for the workshop
 * AND includes the ApprovalMessage thread on each, then renders via
 * <ApprovalThread />. Admin view was rendering only `record.notes` +
 * `record.coachResponse` denormalized fields — so when a workshop had a
 * counter-offer thread on a CUSTOM_PRICING approval, those messages were
 * invisible to admin.
 *
 * Per Jeff: "I want to see exactly like this in the admin view."
 *
 * This test guards against regression: the admin workshop detail page
 * MUST include `messages` in its approvals Prisma query AND render via
 * the same <ApprovalThread> component the coach uses.
 */

import fs from "node:fs";
import path from "node:path";

const ADMIN_WORKSHOP_DETAIL = path.resolve(
  __dirname,
  "../../app/(dashboard)/workshops/[id]/page.tsx"
);

describe("BUG-MAY6-5: admin workshop detail conversation thread parity", () => {
  let source: string;
  beforeAll(() => {
    source = fs.readFileSync(ADMIN_WORKSHOP_DETAIL, "utf8");
  });

  it("includes ApprovalMessage rows in the approvals Prisma query", () => {
    // Look for the `approvals: {` block in the workshop.findUnique include
    // and assert it nests `messages` (the ApprovalMessage relation).
    const approvalsBlockMatch = source.match(/approvals:\s*\{[\s\S]*?\n\s{4,}\},/);
    expect(approvalsBlockMatch).not.toBeNull();
    const block = approvalsBlockMatch![0];
    expect(block).toMatch(/messages:\s*\{/);
    expect(block).toMatch(/orderBy:\s*\{\s*createdAt:\s*"asc"\s*\}/);
  });

  it("renders the conversation thread via <ApprovalThread />", () => {
    // The component import must be present
    expect(source).toMatch(/from\s+["']@\/components\/approvals\/approval-thread["']/);
    // And used in the JSX
    expect(source).toMatch(/<ApprovalThread\s+messages=/);
  });

  it("uses admin perspective on the thread component", () => {
    expect(source).toMatch(/perspective=["']admin["']/);
  });
});

describe("pre-approval guard on the admin landing-page link", () => {
  let source: string;
  beforeAll(() => {
    source = fs.readFileSync(ADMIN_WORKSHOP_DETAIL, "utf8");
  });

  it("gates the public landing-page copy/open block behind the approved status set", () => {
    // The IIFE that renders the "Landing Page" copy/open link must compute an
    // approved-status flag from PRE_EVENT / POST_EVENT / COMPLETED and require
    // it before rendering the link.
    expect(source).toMatch(
      /\["PRE_EVENT",\s*"POST_EVENT",\s*"COMPLETED"\]\.includes\(\s*workshop\.status\s*\)/
    );
    // The Open ↗ link must be guarded by the approved flag (isApproved && copySlug).
    expect(source).toMatch(/isApproved\s*&&\s*copySlug/);
  });
});
