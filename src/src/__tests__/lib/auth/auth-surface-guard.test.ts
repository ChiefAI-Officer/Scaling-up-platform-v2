/**
 * Wave Q (#7, ADR-0018) — auth-surface guard (spec 19q, Codex R1).
 *
 * Soft-removed users (`User.deletedAt`) are revoked at exactly three
 * checkpoints: `authorize()` (login), `getUserForApiRoute()`/`getApiActor()`
 * (per-request API liveness), and the `(dashboard)/layout.tsx` server
 * component (page liveness). Those checkpoints only revoke what flows
 * THROUGH them — so every raw session entry point (`getServerSession(` /
 * `getToken(`) in product source must be a known, audited call site.
 *
 * ADDING A NEW `getServerSession(`/`getToken(` CALL SITE REQUIRES:
 *   1. wiring the new surface through a liveness-checking helper
 *      (getApiActor / getUserForApiRoute, the dashboard layout, or an
 *      equivalent explicit `deletedAt` check), AND
 *   2. adding the file to the allowlist below with a comment stating HOW
 *      its liveness is covered.
 * This test failing on an unknown file is the CI tripwire — do not blindly
 * append to the list.
 */

import * as fs from "fs";
import * as path from "path";

const SRC_ROOT = path.join(process.cwd(), "src");

/**
 * Allowlist of files (relative to src/) that may call getServerSession(/getToken(.
 *
 * Liveness legend:
 *   [CHECKPOINT] — the file IS one of the three liveness checkpoints.
 *   [LAYOUT]     — dashboard page/layout wrapped by (dashboard)/layout.tsx,
 *                  whose liveness check covers every page beneath it.
 *   [ACTOR]      — every handler that mutates/reads privileged data also calls
 *                  getApiActor()/require*ApiActor (liveness-covered); the raw
 *                  session read is auxiliary.
 *   [JWT-ONLY]   — pre-existing surface authenticated by JWT alone (NO
 *                  per-request liveness). Known residual gap, reported in the
 *                  Wave Q build notes: a removed admin holding a live JWT can
 *                  reach these until token expiry. Follow-on hardening item —
 *                  do NOT add new files in this category.
 */
const ALLOWLIST: string[] = [
  // [CHECKPOINT] getUserForApiRoute/getApiActor liveness lives here; the other
  // getServerSession calls in this file (requireAuth/getCoachForSession/
  // canAccessWorkshop/isAdmin) are session plumbing used by pages/layouts.
  "lib/auth/authorization.ts",
  // [CHECKPOINT] dashboard-wide page liveness (redirects deletedAt users).
  "app/(dashboard)/layout.tsx",

  // [LAYOUT] pages/layouts nested under (dashboard)/layout.tsx.
  "app/(dashboard)/admin/assessments/access-groups/[id]/page.tsx",
  "app/(dashboard)/admin/assessments/access-groups/page.tsx",
  "app/(dashboard)/admin/assessments/aggregate/page.tsx",
  "app/(dashboard)/admin/assessments/layout.tsx",
  "app/(dashboard)/admin/assessments/observability/page.tsx",
  "app/(dashboard)/admin/assessments/public-campaigns/page.tsx",
  "app/(dashboard)/admin/assessments/templates/[id]/page.tsx",
  "app/(dashboard)/admin/assessments/templates/[id]/versions/[versionId]/edit/page.tsx",
  "app/(dashboard)/admin/assessments/templates/new/page.tsx",
  "app/(dashboard)/admin/assessments/templates/page.tsx",
  "app/(dashboard)/admin/refunds-needed/page.tsx",
  "app/(dashboard)/admin/registrations/page.tsx",
  "app/(dashboard)/admin/settings/page.tsx",
  "app/(dashboard)/admin/transactional-emails/[type]/page.tsx",
  "app/(dashboard)/admin/transactional-emails/page.tsx",
  "app/(dashboard)/admin/workflows/[id]/page.tsx",

  // [ACTOR] download GET resolves getApiActor() after the session read.
  "app/api/files/[id]/download/route.ts",

  // [JWT-ONLY] coach portal profile/follow-up (coach offboarding is out of
  // Wave Q scope per ADR-0018; coach deletion today hard-deletes the row).
  "app/api/portal/follow-up/route.ts",
  "app/api/portal/profile/image/route.ts",
  "app/api/portal/profile/route.ts",

  // Wave Q gap closure: files/[id] (all methods), survey-templates (all 3
  // routes) and workflows GET/[id]/assign now resolve auth exclusively via
  // getApiActor() — they no longer call getServerSession and so belong to
  // the liveness-checked set, not this allowlist.
];

const SKIP_DIRS = new Set(["__tests__", "node_modules", ".next", "generated"]);
const SOURCE_EXT = new Set([".ts", ".tsx"]);
const SESSION_CALL = /\bgetServerSession\(|\bgetToken\(/;

function collectSessionCallFiles(dir: string, found: string[]): void {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) {
        collectSessionCallFiles(path.join(dir, entry.name), found);
      }
      continue;
    }
    if (!SOURCE_EXT.has(path.extname(entry.name))) continue;
    if (entry.name.endsWith(".d.ts")) continue;

    const filePath = path.join(dir, entry.name);
    const content = fs.readFileSync(filePath, "utf8");
    if (SESSION_CALL.test(content)) {
      found.push(path.relative(SRC_ROOT, filePath).split(path.sep).join("/"));
    }
  }
}

describe("auth-surface guard — every raw session entry point is a known, audited call site", () => {
  it("the set of files calling getServerSession(/getToken( equals the audited allowlist", () => {
    const found: string[] = [];
    collectSessionCallFiles(SRC_ROOT, found);

    const foundSet = [...new Set(found)].sort();
    const allowSet = [...new Set(ALLOWLIST)].sort();

    const unknown = foundSet.filter((f) => !allowSet.includes(f));
    const stale = allowSet.filter((f) => !foundSet.includes(f));

    expect({ unknownCallSites: unknown, staleAllowlistEntries: stale }).toEqual({
      unknownCallSites: [],
      staleAllowlistEntries: [],
    });
  });

  it("sanity: the walker actually finds the three liveness checkpoints' files", () => {
    const found: string[] = [];
    collectSessionCallFiles(SRC_ROOT, found);

    expect(found).toEqual(
      expect.arrayContaining([
        "lib/auth/authorization.ts",
        "app/(dashboard)/layout.tsx",
      ])
    );
  });
});
