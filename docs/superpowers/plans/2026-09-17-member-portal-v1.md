# Member Portal v1 Implementation Plan

> **Revision 2 — 2026-09-18.** Rewritten against spec revision 2, after watching the 2026-09-15
> recording. Revision 1 of this plan built the wrong access model off the wrong entry gate; do
> not resurrect it from git history without reading §3.1 of the spec first.
>
> **Gated wave. No feature code until the spec's §20 design gate is cleared** — grill, the four
> open decisions, the production data check (Task 0), redrawn artboards, `CONTEXT.md`, the ADRs,
> `/co-validate`, and explicit approval. Steps use checkbox (`- [ ]`) syntax.

**Goal:** a person a coach has entered into the system signs in with an emailed link — no
password — and sees the reports they are entitled to under the member hierarchy, plus the
evaluations they can still complete.

**Architecture:** A new `(member)` route group whose every endpoint lives under `/member/`, so a
sealed iron-session cookie can be path-scoped there and never reach an admin or coach route. The
emailed credential is a one-hour, single-use token in the **query string**; landing on the link
does nothing until an explicit button click POSTs it. Authorization is **entitlement**, derived
per request from the member's level (`OrgRespondent.roleType`) and the `OrgTeam` tree, computed
inside the same transaction as the load — never stored in the session, never cached client-side.
Report rendering goes through the **existing** ADR-0012 report gate, widened by three additive
changes. Renderers, report config and print paths are untouched. Flag-off is byte-identical:
every `/member/*` route 404s.

**Tech Stack:** Next.js 16 App Router (Turbopack), React 19, TypeScript 5, Prisma 6 / PostgreSQL
(Neon), `iron-session`, Jest/Testing Library, Playwright, Tailwind + shadcn/ui,
`lib/smtp-transport.ts`.

**Spec:** [`../specs/2026-09-17-member-portal-v1-design.md`](../specs/2026-09-17-member-portal-v1-design.md) — revision 2 is authoritative.
**Link security:** [`../../research/2026-09-17-email-link-rewriting-and-url-fragments.md`](../../research/2026-09-17-email-link-rewriting-and-url-fragments.md)
**Product record:** [`../../MEMBER_PORTAL_V1_SCOPE_AND_DELTAS.md`](../../MEMBER_PORTAL_V1_SCOPE_AND_DELTAS.md) — Delta 1 and "no concept of level" are superseded.

---

## Global Constraints

- `WAVE_MP_MEMBER_PORTAL_KILL=1` wins over everything. With `WAVE_MP_MEMBER_PORTAL_ENABLED`
  unset/off and no kill, **no new route body, query, component, button, email or copy string is
  reached** — `/member/*` returns 404, never 403 (a 403 confirms the route exists).
- **Entitlement is computed inside the loader's transaction, from the live level and team.** It
  is never passed in by a caller, never stored in the session, never cached in the browser, and
  never trusted from a previous request. A coach can change a member's level at any moment.
- **Entitlement is strictly downward and organization-bounded.** Nothing walks to a parent team.
  A CEO's scope is their organization, never the platform.
- **Fail closed on missing data.** `teamleader` with a null `teamId`, an unrecognised
  `roleType`, a null `roleType` — all resolve to own-reports-only. Never to "everything".
- **Never collapse a member identity to one row.** Resolution returns a set, and entitlement is
  the union of per-row scopes. `findFirst` on `OrgRespondent` by email is a defect here.
- **A GET never redeems a token.** Redemption happens only on a POST raised by the button. This
  is what stops an email scanner burning the link before the member reaches it.
- **The raw token never appears in a log, an email subject or any response body.** It arrives in
  the query string by design, so `t` goes in the request-log redaction list, the sign-in page
  sends `Referrer-Policy: no-referrer`, and the URL is replaced immediately after redemption.
- **No member report content in `sessionStorage`, `localStorage` or any client store.**
- **The sign-in response is identical** for unknown, ineligible and eligible addresses, and when
  throttled. Only an *issued* link is audited; a refusal never writes the typed address anywhere.
- Do not alter `getRespondentReport`'s or `getCampaignGroupReport`'s signature or behaviour; the
  existing tests must pass unchanged across the extraction in Task 6.
- Every task follows red → green → focused refactor and ends with its own verification and commit.
- Before any push, from `src/`: the Migration Safety Gate, targeted Jest suites, ESLint on
  changed files, and `CI=true npx next build --turbopack`. Turbopack matters — plain
  `next build` can pass while Turbopack fails.
- SoT hygiene on every production push: the `CLAUDE.md` `LAST_UPDATED_ISO`/`LAST_UPDATED_SLUG`
  anchor plus prose, and a full entry prepended to `plans/CHANGELOG.md`.
- Claim the wave on pinned issue #261 before writing code, and re-check right before you start —
  several agent threads ship to `main` at once.

## File Structure

### Create

- `src/src/lib/members/flags.ts` — `isMemberPortalEnabled()`; enable + kill, `isOn` truthiness, read at call time.
- `src/src/lib/members/identity.ts` — `resolveMemberIdentity(db, email)` → `{ normalizedEmail, members: MemberRow[] }`.
- `src/src/lib/members/entitlement.ts` — `scopeFor(row)` and `entitlementFor(members)`; the three rules.
- `src/src/lib/members/sign-in-token.ts` — issue / atomic redeem over `MemberSignInToken`.
- `src/src/lib/members/session.ts` — `buildMemberSessionOptions()`, `getMemberSession()`, `requireMemberSession()`.
- `src/src/lib/members/sign-in-email.ts` — pure subject/HTML/text renderer, zoned expiry line.
- `src/src/lib/members/send-sign-in-link.ts` — issue + dispatch; the single entry point for all triggers.
- `src/src/lib/members/member-reports.ts` — the entitled report list.
- `src/src/lib/members/member-evaluations.ts` — the member's own open invitations.
- `src/src/lib/members/greeting.ts` — time-of-day greeting + level label for the home screen.
- `src/src/lib/assessments/respondent-report-projection.ts` — projection extracted from `respondent-report.ts` (no authorization).
- `src/src/lib/assessments/member-report.ts` — `getMemberRespondentReport`, `getMemberGroupReport`.
- `src/src/lib/assessments/member-report-gate.ts` — the two member gate adapters.
- `src/src/app/(member)/layout.tsx` — public brand chrome, no admin shell.
- `src/src/app/(member)/member/sign-in/page.tsx` — request · Link-sent · Link-not-valid · token landing.
- `src/src/app/(member)/member/sign-in/request/route.ts` · `.../exchange/route.ts` · `member/sign-out/route.ts`.
- `src/src/app/(member)/member/home/page.tsx` — greeting + the two tiles.
- `src/src/app/(member)/member/reports/page.tsx` — the card grid.
- `src/src/app/(member)/member/reports/[submissionId]/page.tsx` — one personal report.
- `src/src/app/(member)/member/reports/team/[campaignId]/page.tsx` — one group report.
- `src/src/app/(member)/member/evaluations/page.tsx` — open invitations.
- `src/src/app/(member)/member/evaluations/[invitationId]/open/route.ts` — the survey handoff.
- `src/src/components/members/` — `MemberSignInCard.tsx`, `MemberHomeTiles.tsx`, `MemberReportGrid.tsx`, `MemberReportCard.tsx`, `MemberEvaluationList.tsx`, `MemberPortalLink.tsx`.
- `src/src/components/assessments/SendReportLinksDialog.tsx` — counted confirmation.
- `src/src/app/api/assessment-campaigns/[id]/report-links/route.ts` — coach bulk + per-person send.
- `src/prisma/migrations/2026MMDDHHMMSS_add_member_sign_in_token/migration.sql`.
- `src/src/__tests__/lib/members/*.test.ts` · `src/src/__tests__/app/member/*.test.ts` · `src/src/__tests__/components/members/*.test.tsx` · `src/e2e/member-portal.spec.ts`.
- `docs/adr/00NN-member-identity-is-an-address-and-a-set.md`
- `docs/adr/00NN-member-entitlement-is-derived-per-request-from-level-and-team.md`

### Modify

- `src/prisma/schema.prisma` — `MemberSignInToken`.
- `src/src/middleware.ts` — allowlist `/member/`; extend the no-store regex to member report routes.
- `src/src/lib/assessments/report-metrics.ts` — `ReportSurface` gains `"member"`.
- `src/src/lib/assessments/report-gate-core.ts` — optional `auditPrincipal` on `ViewReportOptions`.
- `src/src/lib/assessments/respondent-report.ts` — delegate to the extracted projection.
- `src/src/lib/audit.ts` — `AuditAction` gains `MEMBER_LINK_ISSUED`, `MEMBER_LINK_REDEEMED`.
- `src/src/app/(public)/login/page.tsx` — the member panel beneath a divider.
- `src/src/components/assessments/CampaignDetail.tsx` — delete-dialog clause; send-report-link actions.
- `src/src/components/assessments/org-survey-client.tsx` + the thank-you page — discovery line.
- `src/src/lib/assessments/results-email.ts` — discovery line.
- `src/.env.example` — `WAVE_MP_MEMBER_PORTAL_ENABLED`, `_KILL`, `MEMBER_SESSION_SECRET`.
- `CONTEXT.md`, `CLAUDE.md`, `plans/CHANGELOG.md`.

---

### Task 0: Measure the production level and team data — ✅ DONE 2026-09-18

Ran read-only against production, aggregates only, no writes. **All production data is test
data** (operator, 2026-09-18), so read these as a description of the fixtures, not of customers.

| | |
|---|---|
| Live members | **22**, across 10 live organizations |
| Levels | `teamleader` 7 · *(not set)* 5 · `ceofounderwithteam` 3 · `TEAM_MEMBER` 2 · `ceofounder` 2 · `ceofounderalone` 1 · `employee` 1 · `CEO` 1 |
| Attached to a team | 8 of 22 — including only **3 of the 7** `teamleader` rows |
| Teams | 5 across 3 organizations; **1 nested**; max depth 2; named `Engineering`, `Exec Team`, `Test`, `TEST DELETE ME 2026-05-28 sub-team` |
| CEO reach | 6 organizations have a CEO-family member; **0 have more than one**; largest scope 6 people; 17 of 22 sit inside some CEO scope |
| Submissions with a roster row | 101, of which **36** on live campaigns |

**Three things this changed, all now in the spec:**

1. **`CEO` and `TEAM_MEMBER` exist as levels and the code does not know them.**
   `isCEOFamily("CEO")` returns false, so a person labelled CEO would silently get own-only.
   → `normalizeLevel` with an explicit alias map, spec §6.3.1. Task 3 covers it.
2. **`teamleader` means department head** — confirmed by the operator, resolving the label
   ambiguity this task was written to surface.
3. **There is no real team structure to smoke-test against.** The single nested relationship in
   the whole database is `Exec Team` under `Engineering`. Correctness of the descendant walk is
   therefore proven by seeded fixtures only, and the CEO-family guard exists because the shape of
   real trees is unknown. Re-measure once pilot coaches have built real org charts.

**Re-run this before any launch claim.** The script was temporary and deliberately not committed;
the queries are reproducible from the table above.

---

# Release 1 — Sign in and see your own reports

Everything except the hierarchy. Entitlement code is present and wired, but every member resolves
to own-reports-only until Release 2 enables the other two rules.

### Task 1: Dark-launch state and the flag

**Files:** `lib/members/flags.ts`, `.env.example`, tests

- [ ] RED: false when all unset, `""`, `"0"`, `"false"`; true only for `"1" | "true" | "TRUE" | "yes"`; false whenever `_KILL` is on regardless of `_ENABLED`.
- [ ] GREEN: follow `wave-osr-flags.ts` — env read at call time, never cached, never throwing.
- [ ] Verify · commit.

### Task 2: Member identity resolves to a set of rows

**Files:** `lib/members/identity.ts`, tests

- [ ] RED: an address on three live roster rows returns all three, each carrying
      `{ respondentId, organizationId, teamId, roleType }`; casing and whitespace normalized away;
      rows with `deletedAt` excluded; rows whose `Organization.deletedAt` is set excluded; the
      pre-`normalizedEmail` fallback matches; unknown address returns `[]`.
- [ ] RED (load-bearing): **two rows on the same address in different organizations return two
      rows, with their own levels.** Name the test so a future `findFirst` fails loudly. This is
      the case where one person is a CEO at one company and an employee at another.
- [ ] GREEN: implement over a narrow injected db interface.
- [ ] Verify · commit.

### Task 3: The entitlement rules

**Files:** `lib/members/entitlement.ts`, tests

Written now, in full, even though Release 1 only exercises the own-only branch — the rules are
the thing most likely to be got wrong, and they are far easier to test in isolation than through
a page.

- [ ] RED: `employee`, `guest`, `null`, and an unrecognised slug → own respondent id only.
- [ ] RED (`normalizeLevel`): **nothing is aliased.** `CEO`, `TEAM_MEMBER` and any other
      unrecognised value all resolve to **own-only**. Assert `CEO` explicitly and by name — an
      earlier draft mapped it into the CEO family and that was reversed, so a future reader with
      good intentions is the realistic threat here.
- [ ] RED (the enumeration guard): a test lists every distinct `roleType` observed in production
      (Task 0's table) and **fails** when one is neither canonical nor explicitly aliased. This is
      what turns the next unknown value into a red test instead of a silent denial or grant.
- [ ] RED: each of the three CEO-family slugs → every live respondent in **that row's**
      organization, and **no** respondent from any other organization.
- [ ] RED: `teamleader` with a team → own ∪ that team ∪ **all descendant teams**, to a depth of
      at least three. Siblings excluded. The parent team excluded — assert this explicitly, it is
      the "nobody above them" rule.
- [ ] RED (the CEO-family guard, load-bearing): a `teamleader` whose own team **contains a
      CEO-family member** — the "leadership team modelled as a team" shape, which is exactly what
      `ABC Corp → Engineering → Exec Team` looks like today — does **not** see that member's
      report, while still seeing the non-CEO members of the same team. Assert it for a CEO in the
      leader's own team *and* for one in a descendant team.
- [ ] RED: the guard subtracts only CEO-family members. A department head still sees their peers
      in a shared leadership-team node — that is the accepted limitation in spec §6.3, and the
      test records it deliberately so nobody "fixes" it by accident.
- [ ] RED: `teamleader` with `teamId` null → own only. Fails closed.
- [ ] RED: a member with rows in two organizations gets the **union**, and the CEO scope of one
      does not widen the employee scope of the other.
- [ ] RED: soft-deleted respondents and soft-deleted organizations never appear in any scope.
- [ ] GREEN: `scopeFor(row)` and `entitlementFor(members)`. Pure over an injected team-tree
      reader; no Prisma import in the rule itself.
- [ ] Verify · commit.

### Task 4: The single-use token primitive

**Files:** `prisma/schema.prisma`, migration, `lib/members/sign-in-token.ts`, tests

- [ ] Add `MemberSignInToken` as specified (spec §7.1) — keyed on `normalizedEmail`, **not** a
      respondent id. Additive; no existing table touched.
- [ ] Generate the migration; run the Migration Safety Gate.
- [ ] RED: **two expiries.** A self-service issue expires in **1 hour**; a coach-initiated issue
      expires in **24 hours**. Both pinned as literals. `issuedVia` decides, and the stored
      `expiresAt` is the only source of truth downstream — nothing recomputes a duration.
- [ ] RED: `issue()` persists only the sha256; the raw value appears nowhere in the row.
- [ ] RED: `redeem()` succeeds once, fails the second time; **two concurrent redeems — exactly
      one wins** (assert on the `updateMany` count, not read-then-write); an expired token fails;
      a token whose address no longer has a live roster row fails at redemption, not only at issue.
- [ ] GREEN: reuse `generateRawToken` / `hashToken` from `lib/assessments/invitation-tokens.ts`
      unchanged. Redeem is one `updateMany` guarded on `redeemedAt: null` and
      `expiresAt: { gt: now }`, winning only on `count === 1`.
- [ ] Module header: do **not** reuse `AssessmentSubmission.resultsToken*` — vestigial v7.5
      schema with zero application code, and submission-scoped.
- [ ] Verify · commit.

### Task 5: Session and middleware

**Files:** `lib/members/session.ts`, `src/middleware.ts`, `.env.example`, tests

- [ ] RED: cookie `member-session`, `path: "/member"`, httpOnly, secure, `sameSite: strict`, 24h
      seal with a slightly shorter `maxAge`; payload carries `normalizedEmail` only — **no
      respondent ids, no entitlement, no report ids**; a missing `MEMBER_SESSION_SECRET` throws at
      option-build time rather than sealing with a default.
- [ ] RED: `/member/*` reachable without a NextAuth token; `/member/reports/...` and
      `/member/reports/team/...` carry `Cache-Control: no-store, private`; admin and portal routes
      unaffected.
- [ ] GREEN: follow `invitation-cookie.ts`. Add `/member/` to the middleware `authorized`
      allowlist and extend `REPORT_NO_STORE_REGEX`. **Without the allowlist entry every member
      route redirects to `/login`.**
- [ ] Verify · commit.

### Task 6: Split authorization from projection in the respondent report

**Files:** `lib/assessments/respondent-report-projection.ts`, `lib/assessments/respondent-report.ts`

Ships alone, guarded by existing tests.

- [ ] Run `__tests__/lib/assessments/respondent-report*.test.ts`; record the green baseline.
- [ ] Extract raw-row → `RespondentReport` shaping into the new module, with **no authorization
      and no transaction**. Keep `templateAlias` required — its comment explains why.
- [ ] `getRespondentReport` keeps its exported signature, its `canManageCampaign` check and its
      single-transaction shape, now delegating the shaping.
- [ ] Verify: the same suites pass **unchanged** — no test edits permitted in this task.
- [ ] Commit alone, so a bisect can separate the refactor from the feature.

### Task 7: Member report loaders

**Files:** `lib/assessments/member-report.ts`, tests

- [ ] RED for `getMemberRespondentReport(db, { normalizedEmail, submissionId })`: `ok` when the
      submission's respondent is in the entitlement; `forbidden` when not; `forbidden` when the
      campaign is soft-deleted; `not-found` for an unknown id; `ok` when the entitling row is the
      second element of a multi-row identity.
- [ ] RED: **entitlement is computed inside the loader**, not accepted as an argument — assert
      the signature has no scope parameter.
- [ ] RED for `getMemberGroupReport(db, { normalizedEmail, campaignId })`: `ok` only when
      entitlement covers **every** completed respondent in the campaign; `forbidden` when it
      covers all but one (a superset test, not a flag check); the loader's own `empty` and
      `notApplicable` outcomes pass through untouched.
- [ ] GREEN: identity resolution, entitlement and the load run inside **one** transaction,
      following the `getRespondentReport` H14 pattern. Delegate shaping to Task 6 and to
      `getCampaignGroupReport`.
- [ ] Verify · commit.

### Task 8: Widen the report gate — additively

**Files:** `report-metrics.ts`, `report-gate-core.ts`, `member-report-gate.ts`, `audit.ts`, plus existing gate tests

- [ ] RED: the core writes `performedBy` from `auditPrincipal` when supplied and is **unchanged**
      when it is not — assert the existing surfaces' audit rows byte-for-byte.
- [ ] RED: `"member"` is a valid `ReportSurface`, emitting under `assessment.member_report.*`;
      the metric field allowlist still strips identifying keys.
- [ ] GREEN: add the optional field, the surface, the namespace entry and the two new
      `AuditAction` values. **Do not fabricate an `ApiActor`** — a fake actor would flow into
      `canManageCampaign` the first time anyone reused it.
- [ ] GREEN: the two adapters, `noActorPolicy: "tolerate"`, rate-limit keys on a **hashed**
      address (never the raw address), `RateLimits.standard`, audit `VIEW_REPORT` /
      `GROUP_REPORT_VIEW` discriminated by `changes.kind`.
- [ ] Verify: the full existing gate suite passes unchanged, plus the new adapter tests · commit.

### Task 9: The sign-in email

**Files:** `lib/members/sign-in-email.ts`, tests

- [ ] RED: subject **`Your Scaling Up sign-in link`** — not "Your Scaling Up reports"; the body
      names the portal, not its contents, because a member may have no reports at all.
- [ ] RED: Scaling Up mark and **no coach logo**; the "Didn't ask for this?" closing line present;
      the raw token in the href **and nowhere else**.
- [ ] RED: the fine print interpolates from the stored `expiresAt` — renders "1 hour" for a
      self-service token and "24 hours" for a coach-issued one from **one template** — and
      **names the timezone**, never a bare timestamp.
- [ ] RED: the link is an HTML `<a href>` and the raw URL does **not** appear as bare text in
      either part. Outlook truncates a bare-text URL at the first space, and a hard-wrapping
      sender splits a long URL permanently. `invitation-email.ts:226` and `:342` do both of these
      today — do not copy the pattern.
- [ ] RED: the body shares no distinguishing sentence with the invitation email — two emails, two
      jobs.
- [ ] GREEN: pure module, no I/O, following `report-email.ts` conventions.
- [ ] Verify · commit.

### Task 10: Issue and dispatch

**Files:** `lib/members/send-sign-in-link.ts`, tests

- [ ] RED: an address with a live roster row issues a token and dispatches one email; an unknown
      address issues nothing and dispatches nothing; **only the issued case writes an audit row,
      and the refusal path writes no row containing the address**; an SMTP throw does not
      propagate and is logged with a `member_signin.send_failed` metric.
- [ ] GREEN: `sendMemberSignInLink(db, { email, via, byUserId?, campaignId? })`. Dispatch is
      **not awaited** by the caller's response path. Send through `lib/smtp-transport.ts` — the
      shared transport is the single source of truth. `AssessmentEmailOutbox` is not usable
      (`submissionId`-scoped, unique on `(submissionId, recipientRole)`); record that in the
      module header with the follow-on.
- [ ] Verify · commit.

### Task 11: The sign-in route handlers

**Files:** `sign-in/request/route.ts`, `sign-in/exchange/route.ts`, `sign-out/route.ts`, tests

- [ ] RED: `request` returns **the identical status and body** for unknown, no-roster-row and
      eligible; a throttled request returns the same again; the response never reveals whether an
      email was sent.
- [ ] RED: rate limiting keys on a **hashed** address and on IP, `RateLimits.auth`.
- [ ] RED (load-bearing): **a GET to `/member/sign-in?t=<valid>` does not redeem it.** After the
      GET the token is still unused and a subsequent POST succeeds. Name the test so nobody
      optimises the click away.
- [ ] RED: the landing works with **JavaScript disabled** — the button is a plain HTML form that
      POSTs. No script runs anywhere in the sign-in path.
- [ ] RED: `exchange` (POST) with a valid token sets the session; expired, redeemed, unknown and
      malformed all return one indistinguishable failure; the raw token is never echoed.
- [ ] RED: the sign-in page response carries `Referrer-Policy: no-referrer`, and `t` is redacted
      wherever the request path is logged.
- [ ] RED: `sign-out` destroys the cookie and is a no-op without one. All handlers 404 flag-off.
- [ ] GREEN: implement; Zod-validate bodies; the exchange audits `MEMBER_LINK_REDEEMED`.
- [ ] Verify · commit.

### Task 12: The member screens

**Files:** `(member)/layout.tsx`, `sign-in/page.tsx`, `home/page.tsx`, `reports/page.tsx`,
`reports/[submissionId]/page.tsx`, `components/members/*`, `lib/members/member-reports.ts`,
`lib/members/greeting.ts`, tests

- [ ] RED (copy, from the wireframe — assertions, not decoration): the sign-in card carries the
      audience line *"For people who've completed a Scaling Up assessment."* ⚠️ **this line is now
      wrong** — the gate is a roster row, not completion. Rewrite it with the redrawn artboards
      and assert the new wording. The persistent escape hatch *"Coach or staff? Sign in with your
      password"* stays on both the sign-in and Link-sent states; Link-not-valid is **one** state
      for used, expired and unrecognised.
- [ ] RED (forbidden vocabulary): no member-facing string contains `campaign`, `respondent`,
      `submission`, `participant`, `accessMode`, `INVITED`, `PUBLIC`, `isCEO`, `organizationId`,
      `templateAlias`, `versionId`, `deletedAt`, `token`, `roleType`, `magic link`, a raw id, or a
      standalone assessment alias. Drive it from a shared constant so later releases inherit it.
- [ ] RED: `/member/home` greets the member by name and shows the **Evaluations** and **Reports**
      tiles; the Evaluations tile is present but inert until Release 3 (it must not 404).
- [ ] RED: the greeting prefixes the level **only for the CEO family** — a `ceofounder` sees
      "Good morning CEO {name}", an `employee` sees "Good morning {name}" with no label.
- [ ] RED: `/member/reports` renders a **card grid** with a search field that filters by report
      name; **no pagination**; no multi-select, no Share, no *Select all* / *Deselect all*; each
      card carries one **View report** action.
- [ ] RED: a card names the **person** only when the report is not the signed-in member's, and
      names the **company** only when the member's identity spans more than one organization.
      Assert both negatives — a single-company member seeing only their own reports gets neither
      line.
- [ ] RED: the instrument treatment is **typographic** — a coloured header block per instrument,
      no image asset. Assert no `<img>` on the card.
- [ ] RED: the empty state is reachable and correct for a member with no reports — **the common
      case now**, not a rarity — and links across to Evaluations when they have open invitations.
- [ ] RED: the signed-in member's name is visible (shared devices); Sign out ends the session.
- [ ] RED: reflows to a single column at 375 px with nothing clipped or overlapping.
- [ ] RED: `/member/reports/[submissionId]` renders `BrandedReport` for an entitled report and
      404s for one that is not entitled, one on a deleted campaign, and with no session.
- [ ] RED: arriving at `/member/sign-in?t=<token>` shows a single **View my reports** button and
      no member data; the URL is replaced after redemption.
- [ ] GREEN: server components throughout; entitlement decided per request; the redemption POST
      is the only client-side behaviour on the sign-in page. **No report content written to any
      client-side store.**
- [ ] ⚠️ Before this task: confirm the card-graphic decision (spec §19.1). Recommended is one
      static image per template alias, not a per-report thumbnail pipeline.
- [ ] Verify · commit.

### Task 13: The `/login` member panel

**Files:** `(public)/login/page.tsx`, tests

- [ ] RED: the staff form is byte-identical — email, password, Forgot password, "New coach?
      Create an account", and the existing "Invalid email or password" behaviour unchanged.
- [ ] RED: beneath a divider — *Taken an assessment?* / *We'll email you a link to your reports.
      No password needed.* / **Get a link to my reports →** linking to `/member/sign-in`.
- [ ] RED: **the page never probes the email.** No request on blur, on change, or on any path
      other than the deliberate password submit. Assert the absence of a fetch — this is the one
      behaviour that keeps the front door from becoming Esperto's enumeration oracle.
- [ ] RED: flag off → the panel is absent.
- [ ] GREEN · verify · commit.

### Task 14: The campaign delete warning

**Files:** `CampaignDetail.tsx`, tests

- [ ] RED: flag on — *"…will lose access — including the reports they can see today. Their
      responses stay in your records. This is not reversible."* Both halves: gone for the member,
      kept for the coach.
- [ ] RED: flag off → current copy unchanged. The **public**-campaign dialog is untouched.
- [ ] GREEN · verify · commit.

### Task 15: Release 1 proof and source-of-truth hygiene

- [ ] `e2e/member-portal.spec.ts`: flag off → `/member/sign-in` 404s. Flag on → request a link →
      Link-sent copy → GET the link (assert nothing is consumed) → click through → home → reports
      → open a report → **reuse the link and reach Link-not-valid** → sign out → report route 404s.
- [ ] E2E negative: a second seeded member's report id, requested with the first member's
      session, 404s.
- [ ] E2E: a member with a roster row and **no submissions at all** signs in successfully and
      sees the empty state. This is the case revision 1 could not produce.
- [ ] Manual: no member report content in `sessionStorage` or `localStorage` after sign-in →
      view → reload.
- [ ] Measure and record the timing delta between the eligible and ineligible request paths;
      put the number in the CHANGELOG rather than claiming the timings are identical.
- [ ] Migration Safety Gate · targeted suites · ESLint on changed files ·
      `CI=true npx next build --turbopack` from `src/`.
- [ ] Write both ADRs; add the spec §4 terms to `CONTEXT.md`.
- [ ] `CLAUDE.md` anchor + prose; prepend the `plans/CHANGELOG.md` entry.
- [ ] Set the prod flags **via the Vercel REST API as `type:"encrypted"`** against the
      `scaling-up` team project `prj_xcAWuAmGZAU3DCHgAauRv2WPKneo` — never piped `vercel env add`,
      never `--scope chief-aio-fficer` (0 env vars; reads as "no flags set"). Generate
      `MEMBER_SESSION_SECRET` and push it the same way. Redeploy — env injects at build time.
      **Verify in-app, not by reading the flag back**: a `sensitive` var reads empty whatever its
      value. Then confirm the deployment is `READY` on the expected commit — a green CI Build does
      not mean the deploy ran.

---

# Release 2 — The hierarchy (Jeff's #4)

The piece most likely to leak, shipped against a portal that already works. **Do not start
without Task 0's numbers.**

### Task 16: Enable the CEO and department-head scopes

- [ ] RED: an entitled-but-not-owned report opens for a CEO and for the right team leader, and
      404s for an employee, for a sibling team's leader, and for a member of another organization.
- [ ] RED: changing a member's `roleType` or `teamId` changes what they can open **on the next
      request**, with no sign-out — proves entitlement is not cached in the session.
- [ ] RED: a department head does not see the CEO's report even when the CEO sits in their own
      team — the end-to-end form of Task 3's guard, asserted through the loader rather than the
      pure rule.
- [ ] GREEN: switch the loaders from own-only to `entitlementFor(members)` from Task 3. **Both
      rules go live together.** No new rules are written here; Task 3 already has them under test.
- [ ] Verify · commit.

### Task 17: The group report

- [ ] RED: `/member/reports/team/[campaignId]` renders `GroupReport` when entitlement covers every
      completed respondent; 404s when it covers all but one; 404s for a deleted campaign and with
      no session; the loader's `empty` and `notApplicable` panels render as they do for a coach.
- [ ] RED: the grid marks group reports distinctly from personal ones.
- [ ] GREEN: reuse Task 7's `getMemberGroupReport` and Task 8's adapter; `generatedAt = new Date()`
      at the page boundary, keeping gate and loader clock-free.
- [ ] Verify · commit · SoT hygiene · launch as in Task 15.

### Task 17b: Two member-editor warnings

**Files:** `components/organizations/edit-member-modal.tsx`, `add-member-modal.tsx`, tests

- [ ] RED: saving a member as **Leadership team member** with no team shows an inline note that
      the level needs a team to grant anything; saving with a team shows nothing; **it is not a
      validation error** — a coach may legitimately set the level before the structure exists.
- [ ] RED: the note is absent when the portal flag is off.
- [ ] GREEN · verify · commit.

- [ ] RED: an **unrecognised level** (`CEO`, `TEAM_MEMBER`, anything outside the canonical six)
      shows an inline warning — *this level isn't recognised and grants no additional access* —
      while still displaying the stored value in the dropdown, as the editor does today.
- [ ] RED: neither warning is a validation error; both saves succeed.
- [ ] Separately, as an ops step: correct the three existing rows by hand. The warning stops the
      next import recreating them; fixing the rows clears today's data. Both halves are needed.

Four of the seven people currently holding the `teamleader` level have no team, so the first
warning is the common case, not an edge one.

---

# Release 3 — Evaluations

### Task 18: The evaluations list

- [ ] RED: lists the member's **own** open invitations only — never a colleague's, at any level.
      Assert a CEO sees no one else's questionnaire.
- [ ] RED: revoked, submitted and expired invitations are excluded; deleted campaigns excluded.
- [ ] GREEN · verify · commit.

### Task 19: The survey handoff — grant the session, mint nothing

**The one new authorization boundary in this release.** Read spec §6.5 in full before starting.
An earlier draft minted an invitation token here; that breaks the Jeff #65 stable-links machinery
four separate ways and must not be reintroduced.

- [ ] RED: `/member/evaluations/[invitationId]/open` grants and redirects **only** for an
      invitation whose `respondentId` is one of the signed-in member's **own** ids — not the
      hierarchy. 404s for anyone else's invitation id, and with no session.
- [ ] RED (load-bearing): **no token is minted and nothing rotates.** After a successful Continue,
      assert `AssessmentInvitation.tokenHash` and `expiresAt` are byte-identical to before, no
      `AssessmentInvitationToken` row was created, and `resentCount` / `lastResentAt` are
      unchanged. This is the test that stops someone "simplifying" it back into a mint.
- [ ] RED: the eight lifecycle gates run **before** anything is granted — reuse
      `classifyInvitationExchangeAvailability`. A closed campaign, a revoked invitation, a
      SUBMITTED one, one outside `openAt`/`closeAt`: each refuses with no state change at all.
      The emailed paths refuse before touching state and this one must too, or a member gets a
      dead end after a write.
- [ ] RED: the response body carries no token and no session material.
- [ ] GREEN: export `getInvitationSession` as an explicit grant seam rather than reaching into
      the exchange route's internals; seal the session for that campaign alias; redirect to
      `/org-survey/{alias}`.
- [ ] Accepted and asserted: entering flips the respondent's status Pending/Sent → **Viewed**,
      which coaches see. Already true of the emailed link, so the portal is consistent, not novel.
- [ ] Accepted: finishing an assessment started from the portal behaves **exactly as it does from
      an email** — thank-you page or on-screen report, no back-link, no redirect into the portal.
      One path, not two.
- [ ] Verify · commit · SoT hygiene · launch as in Task 15.

---

# Release 4 — Coach-initiated send and discovery

### Task 20: The send endpoint and coach surface

- [ ] RED: bulk sends to **every respondent on the campaign**, completed or not (the gate is a
      roster row); per-person sends to one; **the response body contains no token and no link in
      any shape**; the caller must pass the campaign's existing authorization; flag off → 404.
- [ ] RED: a coach-issued token obeys every rule a self-issued one does — single use, the same
      one-hour expiry, no extension.
- [ ] RED: a coach-issued token expires in **24 hours**, not 1 hour, and the dialog says so
      alongside the count.
- [ ] RED: the coach path has **its own rate limit**, not the anonymous 10/minute per-IP one — a
      bulk send of thirty from one office IP must not trip at ten. Assert thirty succeed.
- [ ] GREEN: reuse `sendMemberSignInLink` with `via: "COACH"`; a counted dialog following the
      campaign-delete pattern, **not** `window.confirm()` — it has to carry the expiry caveat, and
      a browser alert is a bad place for something people need to read.
- [ ] Verify · commit.

### Task 21: Discovery lines

- [ ] RED: the line appears on the in-place `results` phase, on
      `/org-survey/{alias}/thank-you?results=1`, and in `results-email.ts`; each absent flag-off;
      none contains a token; all pass the Task 12 forbidden-vocabulary assertion.
- [ ] GREEN: a shared `MemberPortalLink` plus the email's text equivalent.
- [ ] Verify · commit · SoT hygiene · launch as in Task 15.

---

## Deferred, and recorded so they are not later logged as defects

- Pruning redeemed/expired `MemberSignInToken` rows after 30 days — no cron exists.
- Sign-in email delivery is not under the at-least-once outbox (ADR-0030).
- Alerting on `member_signin.send_failed` beyond human-read `vercel logs`.
- Person-to-person report sharing; the configurable access matrix; parent-group scope; multiple
  CEOs per campaign (Jeff's #5); member-run campaign management.
- **Bulk member import** — deferred by the operator, 2026-09-18. Partly built already
  (`/portal/members/import` plus an **Import from Esperto** action on the Members & Teams header),
  but the plumbing is in development and not trusted. It is how real org structures and levels will
  actually arrive, so it governs how useful the hierarchy is in practice — it does not block
  building it, and it should be picked up before the mid-October pilot if anything is to be loaded.
- Jeff's other items from the same call — timezone handling on close dates, campaign close-date
  extension, multiple CEOs, multi-language. See spec §16.1; none belongs to this wave.
- Retiring the ADR-0027 `sessionStorage` rehydrate now that a durable authorized results URL
  exists.

## Plan Self-Review Checklist

- [x] Task 0 ran; its numbers are recorded above and must be re-measured before launch.
- [ ] `TEAM_MEMBER` is asserted to grant nothing; no legacy value is mapped by inference.
- [ ] The CEO-family guard is asserted both as a pure rule (Task 3) and through the loader (Task 16).
- [ ] `normalizeLevel` aliases nothing, and `CEO` is asserted by name to grant own-only.
- [ ] Task 19 asserts that Continue mints nothing and rotates nothing.
- [ ] The coach bulk send is proven not to trip the anonymous rate limiter.
- [ ] The sign-in path is proven to work with JavaScript disabled.
- [ ] Every task has a RED step that fails for the stated reason before implementation.
- [ ] No task both refactors a shared module and adds a feature (Task 6 ships alone).
- [ ] Flag-off byte-identity is asserted in Tasks 11–14, 17, 20, 21 — not assumed once.
- [ ] The duplicate-address case is asserted at resolution (Task 2), in the rules (Task 3) and at
      the render boundary (Task 7).
- [ ] "Nobody above them" is asserted explicitly, not implied by the absence of a test.
- [ ] Every fail-closed path (null team, unknown level, null level) has its own assertion.
- [ ] Entitlement is proven uncached — Task 16's level-change test is the proof.
- [ ] No test asserts that the sign-in response *differs* for a known address.
- [ ] A GET never redeems — asserted explicitly.
- [ ] The one-hour expiry is pinned as a literal.
- [ ] No code path writes a member's address to an audit row on a refusal.
- [ ] Every "verified" claim in the CHANGELOG corresponds to a command that was run.
