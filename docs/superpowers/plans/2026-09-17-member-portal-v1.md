# Member Portal v1 Implementation Plan

> **Gated wave.** This plan is written so it is ready when approval lands. **No feature code
> until the §20 design gate in the spec is cleared** — grill, the four open decisions, the
> `CONTEXT.md` entries, the ADRs, the visual review, `/co-validate`, and explicit approval.
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** a person who completed an invited assessment signs in with an emailed single-use
link — no password — and sees their own reports, plus the team report for any campaign where
they are the CEO.

**Architecture:** A new `(member)` route group whose every endpoint lives under `/member/`, so
a sealed iron-session cookie can be path-scoped there and never reach an admin or coach route.
The emailed credential travels in the **query string**, and landing on the link does nothing:
redemption happens only on a POST raised by an explicit button click, which is the documented
defence against email scanners that open links. The token is redacted from our own request logs
and the page sends `Referrer-Policy: no-referrer`. Its real safety property is a **one-hour,
single-use** life, not concealment. Report rendering goes through the **existing** ADR-0012 report gate, widened
by three additive changes (a `"member"` surface, an optional `auditPrincipal`, `"tolerate"` on
no actor) and served by two new loaders that own their own authorization — membership of a
freshly resolved identity **set**, re-checked on every render. Renderers, report config, and
print paths are untouched. Flag-off is byte-identical: every `/member/*` route 404s.

**Tech Stack:** Next.js 16 App Router (Turbopack), React 19, TypeScript 5, Prisma 6 /
PostgreSQL (Neon), `iron-session`, Jest/Testing Library, Playwright, Tailwind + shadcn/ui,
`lib/smtp-transport.ts` (Azure Communication Services).

**Spec:** [`../specs/2026-09-17-member-portal-v1-design.md`](../specs/2026-09-17-member-portal-v1-design.md)

**Product record:** [`../../MEMBER_PORTAL_V1_SCOPE_AND_DELTAS.md`](../../MEMBER_PORTAL_V1_SCOPE_AND_DELTAS.md) ·
**UI record:** [`../../wireframes-phase2/wave8/27-member-portal-reports.md`](../../wireframes-phase2/wave8/27-member-portal-reports.md)

---

## Global Constraints

- `WAVE_MP_MEMBER_PORTAL_KILL=1` wins over everything. With `WAVE_MP_MEMBER_PORTAL_ENABLED`
  unset/off and no kill, **no new route body, query, component, button, email, or copy string
  is reached** — `/member/*` returns 404 (never 403: a 403 confirms the route exists).
- **Never collapse a member identity to one row.** Resolution returns a set; every access checks
  membership of it. `findFirst` on `OrgRespondent` by email is a defect in this feature.
- **Ownership is re-verified server-side on every report render**, from the freshly resolved
  set. A session proves someone signed in on this browser, never *whose* report is requested.
- **No member report content in `sessionStorage`, `localStorage`, or any client store.** This
  portal exists partly because ADR-0027 needed one; it must not inherit that store.
- **A GET never redeems a token.** Redemption happens only on a POST raised by the button. A
  scanner that opens the link must leave it usable. This is the single rule the whole
  query-string form rests on.
- **The raw token never appears in a log, an email subject, or any response body.** It arrives in
  the query string by design, so `t` must be in the request-log redaction list, the sign-in page
  must send `Referrer-Policy: no-referrer`, and the URL must be replaced immediately after
  redemption so a spent token does not sit in the address bar or browser history.
- **The coach never receives a member's sign-in link** in any form.
- **The sign-in response is identical** in status, body, and copy for unknown, ineligible, and
  eligible addresses, and when throttled. Only an *issued* link is audited, and a refusal never
  writes the typed address anywhere.
- Do not alter `getRespondentReport`'s or `getCampaignGroupReport`'s signature or behaviour; the
  existing tests must pass unchanged across the extraction in Task 5.
- Every task follows red → green → focused refactor and ends with its own verification and commit.
- Before any push, from `src/`: the Migration Safety Gate, targeted Jest suites, ESLint on
  changed files, and `CI=true npx next build --turbopack`. Turbopack matters — plain
  `next build` can pass while Turbopack fails.
- SoT hygiene on every production push: the `CLAUDE.md` `LAST_UPDATED_ISO`/`LAST_UPDATED_SLUG`
  anchor plus brief prose, and a full entry prepended to `plans/CHANGELOG.md`.

## File Structure

### Create

- `src/src/lib/members/flags.ts` — `isMemberPortalEnabled()`; enable + kill, `isOn` truthiness, read at call time.
- `src/src/lib/members/identity.ts` — `resolveMemberIdentity(db, email)` → `{ normalizedEmail, respondentIds }`.
- `src/src/lib/members/eligibility.ts` — `hasCompletedOnLiveCampaign(db, respondentIds)`.
- `src/src/lib/members/sign-in-token.ts` — issue / inspect / atomic redeem over `MemberSignInToken`.
- `src/src/lib/members/session.ts` — `buildMemberSessionOptions()`, `getMemberSession()`, `requireMemberSession()`.
- `src/src/lib/members/sign-in-email.ts` — pure subject/HTML/text renderer (no I/O), zoned expiry line.
- `src/src/lib/members/send-sign-in-link.ts` — issue + dispatch; the single entry point for all three triggers.
- `src/src/lib/members/member-reports.ts` — the member's list: own submissions + CEO campaigns, live-campaign filtered.
- `src/src/lib/assessments/respondent-report-projection.ts` — projection extracted from `respondent-report.ts` (no authorization).
- `src/src/lib/assessments/member-report.ts` — `getMemberRespondentReport`, `getMemberGroupReport`.
- `src/src/lib/assessments/member-report-gate.ts` — the two member gate adapters.
- `src/src/app/(member)/layout.tsx` — public brand chrome, no admin shell.
- `src/src/app/(member)/member/sign-in/page.tsx` — request · Link-sent · Link-not-valid · token landing with the click-to-redeem button.
- `src/src/app/(member)/member/sign-in/request/route.ts` — POST, always the same response.
- `src/src/app/(member)/member/sign-in/exchange/route.ts` — POST, atomic redeem → session.
- `src/src/app/(member)/member/sign-out/route.ts` — POST, destroy session.
- `src/src/app/(member)/member/reports/page.tsx` — the list.
- `src/src/app/(member)/member/reports/[submissionId]/page.tsx` — one personal report.
- `src/src/app/(member)/member/reports/team/[campaignId]/page.tsx` — one team report.
- `src/src/components/members/MemberSignInCard.tsx`, `MemberReportList.tsx`, `MemberPortalLink.tsx`.
- `src/src/components/assessments/SendReportLinksDialog.tsx` — counted confirmation (R3).
- `src/src/app/api/assessment-campaigns/[id]/report-links/route.ts` — coach bulk + per-person send (R3).
- `src/prisma/migrations/2026MMDDHHMMSS_add_member_sign_in_token/migration.sql`.
- `src/src/__tests__/lib/members/*.test.ts` · `src/src/__tests__/app/member/*.test.ts` ·
  `src/src/__tests__/components/members/*.test.tsx` · `src/e2e/member-portal.spec.ts`.
- `docs/adr/00NN-member-identity-is-an-address-and-a-set.md`
- `docs/adr/00NN-member-session-authenticates-the-loader-authorizes.md`

### Modify

- `src/prisma/schema.prisma` — `MemberSignInToken`.
- `src/src/middleware.ts` — allowlist `/member/`; extend the no-store regex to member report routes.
- `src/src/lib/assessments/report-metrics.ts` — `ReportSurface` gains `"member"`; namespace `member_report`.
- `src/src/lib/assessments/report-gate-core.ts` — optional `auditPrincipal` on `ViewReportOptions`.
- `src/src/lib/assessments/respondent-report.ts` — delegate to the extracted projection.
- `src/src/lib/audit.ts` — `AuditAction` gains `MEMBER_LINK_ISSUED`, `MEMBER_LINK_REDEEMED`.
- `src/src/app/(public)/login/page.tsx` — the member panel beneath a divider.
- `src/src/components/assessments/org-survey-client.tsx` + the thank-you page — discovery line (R2).
- `src/src/lib/assessments/results-email.ts` — discovery line (R2).
- `src/src/components/assessments/CampaignDetail.tsx` — delete-dialog clause (R1), send-report-link actions (R3).
- `src/.env.example` — `WAVE_MP_MEMBER_PORTAL_ENABLED`, `_KILL`, `MEMBER_SESSION_SECRET`.
- `CONTEXT.md`, `CLAUDE.md`, `plans/CHANGELOG.md`.

---

# Release 1 — Tracer: sign in and see your own reports

Ships the entire mechanism. 21 of 22 live roster members exercise it.

### Task 1: Dark-launch state and the flag

**Files:** `lib/members/flags.ts`, `.env.example`, `__tests__/lib/members/flags.test.ts`

- [ ] RED: assert `isMemberPortalEnabled()` is false when all unset, `""`, `"0"`, `"false"`;
      true only for `"1" | "true" | "TRUE" | "yes"`; and false whenever `_KILL` is on regardless of `_ENABLED`.
- [ ] GREEN: implement following `wave-osr-flags.ts` — env read at call time, never cached, never throwing.
- [ ] Add both vars to `.env.example`, commented default-off.
- [ ] Verify: `npm run test -- flags` · commit.

### Task 2: Member identity resolves to a set

**Files:** `lib/members/identity.ts`, `__tests__/lib/members/identity.test.ts`

- [ ] RED: an address on three live roster rows returns all three ids; casing and surrounding
      whitespace are normalized away; rows with `deletedAt` set are excluded; rows whose
      `Organization.deletedAt` is set are excluded; a row written before `normalizedEmail` was
      populated still matches via the lowercased `email` fallback; an unknown address returns `[]`.
- [ ] RED (the load-bearing one): a fixture with **two rows on the same address in different
      organizations** must return two ids. Name the test so a future `findFirst` refactor fails
      loudly — this is the case that serves one person another's report.
- [ ] GREEN: implement over a narrow injected db interface (the `ReportDb` pattern), no Prisma import in the pure path.
- [ ] Verify · commit.

### Task 3: Eligibility — completion is the entry ticket

**Files:** `lib/members/eligibility.ts`, `__tests__/lib/members/eligibility.test.ts`

- [ ] RED: a roster row with no submission is ineligible; a submission on a soft-deleted
      campaign does not count; a submission on a live campaign makes the whole identity
      eligible; an empty id set is ineligible without touching the database.
- [ ] GREEN: a single existence query over the id set.
- [ ] Verify · commit.

### Task 4: The single-use token primitive

**Files:** `prisma/schema.prisma`, the migration, `lib/members/sign-in-token.ts`,
`__tests__/lib/members/sign-in-token.test.ts`

- [ ] Add `MemberSignInToken` exactly as specified (§7.1) — keyed on `normalizedEmail`, **not**
      on a respondent id, with a **1-hour** expiry. Additive; no existing table is touched.
- [ ] Generate the migration; run the Migration Safety Gate.
- [ ] RED: the issued expiry is **1 hour**, asserted as a constant the test names — not 14 days.
      A test that reads the constant back from the implementation proves nothing; pin the number.
- [ ] RED: `issue()` returns a raw token and persists only its sha256; the raw value appears
      nowhere in the row. `redeem()` succeeds once and the second call fails. **Two concurrent
      redeems of the same token: exactly one wins** (assert on the `updateMany` count, not on
      read-then-write). An expired token fails. A token for an address that has since become
      ineligible fails at redemption, not only at issue.
- [ ] GREEN: reuse `generateRawToken` / `hashToken` from `lib/assessments/invitation-tokens.ts`
      unchanged. Redeem is one `updateMany` guarded on `redeemedAt: null` and `expiresAt: { gt: now }`,
      winning only on `count === 1`.
- [ ] Note in the module header: do **not** reuse `AssessmentSubmission.resultsToken*` — those
      columns are vestigial v7.5 schema with zero application code and are submission-scoped.
- [ ] Verify · commit.

### Task 5: Split authorization from projection in the respondent report

**Files:** `lib/assessments/respondent-report-projection.ts`, `lib/assessments/respondent-report.ts`

This is a refactor of a load-bearing file. It ships alone, guarded by the existing tests.

- [ ] Run `__tests__/lib/assessments/respondent-report*.test.ts` and record the green baseline.
- [ ] Extract the raw-row → `RespondentReport` shaping into the new module, with **no
      authorization and no transaction** in it. Keep `templateAlias` required — the comment in
      `respondent-report.ts` explains why, and it is what let the compiler find the
      `public-quiz-client` omission.
- [ ] `getRespondentReport` keeps its exported signature, its `canManageCampaign` check, and its
      single-transaction shape, now delegating the shaping.
- [ ] Verify: the same suites pass **unchanged** — no test edits are permitted in this task.
- [ ] Commit alone, so a later bisect can separate the refactor from the feature.

### Task 6: Member report loaders own their own authorization

**Files:** `lib/assessments/member-report.ts`, `__tests__/lib/assessments/member-report.test.ts`

- [ ] RED for `getMemberRespondentReport(db, { normalizedEmail, submissionId })`:
      returns `ok` for a submission whose `respondentId` is in the resolved set; `forbidden` for
      one that is not; `forbidden` when the campaign is soft-deleted; `not-found` for an unknown
      id; and **`ok` when the owning row is the second element of a multi-row identity** (the
      duplicate-address case again, at the render boundary).
- [ ] RED for `getMemberGroupReport(db, { normalizedEmail, campaignId })`: `ok` only when a
      participant row in the set has `isCEO = true` on a live campaign; `forbidden` for a
      non-CEO participant; `forbidden` when soft-deleted; and the loader's own `empty` /
      `notApplicable` outcomes pass through untouched.
- [ ] GREEN: identity resolution and the ownership check run inside **one** transaction with the
      load, following the `getRespondentReport` H14 pattern. Delegate shaping to Task 5's module
      and to `getCampaignGroupReport`.
- [ ] Verify · commit.

### Task 7: Widen the report gate — additively

**Files:** `lib/assessments/report-metrics.ts`, `lib/assessments/report-gate-core.ts`,
`lib/assessments/member-report-gate.ts`, `lib/audit.ts`, plus the existing gate tests

- [ ] RED: the core writes `performedBy` from `auditPrincipal` when supplied, and is **unchanged**
      when it is not (assert the existing surfaces' audit rows byte-for-byte).
- [ ] RED: `"member"` is a valid `ReportSurface` and emits under `assessment.member_report.*`;
      the metric field allowlist still strips identifying keys.
- [ ] GREEN: add the optional field, the surface, the namespace entry, and the two new
      `AuditAction` values. **Do not fabricate an `ApiActor`** — a fake actor would flow into
      `canManageCampaign` the first time anyone reused it.
- [ ] GREEN: the two adapters, `noActorPolicy: "tolerate"`, rate-limit keys
      `member-report:{hashedEmail}:{submissionId}:{ip}` and `member-team-report:{hashedEmail}:{campaignId}:{ip}`
      (**hashed address — never the raw address in a rate-limit key**), `RateLimits.standard`,
      audit `VIEW_REPORT` / `GROUP_REPORT_VIEW` discriminated by `changes.kind`.
- [ ] Verify: the full existing gate suite passes unchanged, plus the new adapter tests · commit.

### Task 8: Session and middleware

**Files:** `lib/members/session.ts`, `src/middleware.ts`, `.env.example`,
`__tests__/lib/members/session.test.ts`, `__tests__/middleware-member.test.ts`

- [ ] RED: the cookie is `member-session`, `path: "/member"`, httpOnly, secure, `sameSite: strict`,
      24h seal with a slightly shorter `maxAge`; the payload carries `normalizedEmail` only and
      **no respondent ids and no report ids**; a missing `MEMBER_SESSION_SECRET` throws at
      option-build time rather than sealing with a default.
- [ ] RED: `/member/*` is reachable without a NextAuth token; `/member/reports/...` and
      `/member/reports/team/...` carry `Cache-Control: no-store, private`; the admin and portal
      routes are unaffected.
- [ ] GREEN: implement following `invitation-cookie.ts`. Add `/member/` to the middleware
      `authorized` allowlist, and extend `REPORT_NO_STORE_REGEX` (or add a sibling) to cover the
      member report routes. Without the allowlist entry every member route redirects to `/login`.
- [ ] Verify · commit.

### Task 9: The sign-in email

**Files:** `lib/members/sign-in-email.ts`, `__tests__/lib/members/sign-in-email.test.ts`

- [ ] RED: subject is `Your Scaling Up reports`; the body carries the Scaling Up mark and **no
      coach logo**; the fine print reads `expires in 1 hour — at {time} {timezone}` and **names
      the zone**, never a bare timestamp; the closing "Didn't ask for this?" line is present; the
      raw token appears in the href **and nowhere else** — not in the subject, not in the text
      alternative, not in an `alt`.
- [ ] RED: the link is an HTML `<a href>`, and the raw URL does **not** appear as bare text in
      either part. Outlook's documented autolink truncates a bare-text URL at the first space,
      and RFC 5322's 78-char line guidance means a sender that hard-wraps splits a long URL
      permanently. Our invitation email does both of these things today
      (`invitation-email.ts:226` and `:342`) — do not copy the pattern here.
- [ ] RED: the rendered body shares no distinguishing sentence with the invitation email (assert
      against `invitation-email.ts`'s output for the same recipient) — two emails, two jobs.
- [ ] GREEN: pure module, no I/O, following `report-email.ts` inline-style conventions and the
      single-escaping-authority rule.
- [ ] Verify · commit.

### Task 10: Issue and dispatch — one entry point, three triggers

**Files:** `lib/members/send-sign-in-link.ts`, `__tests__/lib/members/send-sign-in-link.test.ts`

- [ ] RED: an eligible address issues a token and dispatches one email; an ineligible address
      issues nothing and dispatches nothing; an unknown address does the same; **only the issued
      case writes an audit row, and the refusal paths write no row containing the address**;
      an SMTP throw does not propagate and is logged with a `member_signin.send_failed` metric.
- [ ] GREEN: `sendMemberSignInLink(db, { email, via, byUserId?, campaignId? })`. Dispatch is
      **not awaited** by the caller's response path, so SMTP latency never reaches the response.
      Send through `lib/smtp-transport.ts` — the shared transport is the single source of truth;
      do not construct a nodemailer transport here. `AssessmentEmailOutbox` is not usable
      (`submissionId`-scoped with a unique `(submissionId, recipientRole)`); record that in the
      module header alongside the follow-on.
- [ ] Verify · commit.

### Task 11: The sign-in route handlers

**Files:** `(member)/member/sign-in/request/route.ts`, `.../exchange/route.ts`,
`(member)/member/sign-out/route.ts`, `__tests__/app/member/sign-in-routes.test.ts`

- [ ] RED: `request` returns **the identical status and body** for unknown, no-roster-row,
      completed-nothing, and eligible; a throttled request returns the same again; the response
      never reveals whether an email was sent.
- [ ] RED: rate limiting keys on a **hashed** address and on IP, `RateLimits.auth`.
- [ ] RED (the load-bearing one): **a GET to `/member/sign-in?t=<valid>` does not redeem it.**
      After the GET, the token is still unused and a subsequent POST succeeds. Name the test so
      nobody "optimises" the click away — this is what stops an email scanner burning the link
      before the member reaches it.
- [ ] RED: `exchange` (POST) with a valid token sets the session and returns success; expired,
      already redeemed, unknown, and malformed all return one indistinguishable failure; a token
      whose address is no longer eligible fails; the raw token is never echoed in the response.
- [ ] RED: the sign-in page response carries `Referrer-Policy: no-referrer`, and `t` is redacted
      wherever the request path is logged.
- [ ] RED: `sign-out` destroys the cookie and is a no-op without one.
- [ ] RED: all three 404 when the flag is off.
- [ ] GREEN: implement. Zod-validate the bodies. The exchange audits `MEMBER_LINK_REDEEMED`.
- [ ] Verify · commit.

### Task 12: The member screens

**Files:** `(member)/layout.tsx`, `(member)/member/sign-in/page.tsx`,
`(member)/member/reports/page.tsx`, `(member)/member/reports/[submissionId]/page.tsx`,
`components/members/*`, `lib/members/member-reports.ts`, component tests

- [ ] RED (copy, from the wireframe — these are assertions, not decoration): the sign-in card
      carries the audience line *"For people who've completed a Scaling Up assessment."* and the
      persistent escape hatch *"Coach or staff? Sign in with your password"*; the Link-sent state
      repeats the escape hatch; Link-not-valid is **one** state for used, expired, and
      unrecognised; the empty state neither implies fault nor hints that reports were removed.
- [ ] RED (forbidden vocabulary): a test asserts that no member-facing string contains
      `campaign`, `respondent`, `submission`, `participant`, `accessMode`, `INVITED`, `PUBLIC`,
      `isCEO`, `organizationId`, `templateAlias`, `versionId`, `deletedAt`, `token`, `magic link`,
      a raw id, or a standalone assessment alias. Drive it from a shared constant so R2 and R3
      inherit it.
- [ ] RED: the list sorts newest-completed first, shows the signed-in member's name (shared
      devices), offers Sign out, and reflows to a single column with the action on its own line
      at 375 px with nothing clipped or overlapping.
- [ ] RED: `/member/reports/[submissionId]` renders `BrandedReport` for an owned report and
      404s for one that is not owned, for one on a deleted campaign, and with no session.
- [ ] RED: arriving with `?t=<token>` shows a single **View my reports** button and no report
      data; the redemption POST fires only from that click; after success the URL is replaced so
      the spent token leaves the address bar.
- [ ] GREEN: server components throughout; ownership decided per request from the freshly
      resolved set; the redemption POST is the only client-side behaviour on the sign-in page.
      **No report content is written to any client-side store.**
- [ ] Verify · commit.

### Task 13: The `/login` member panel

**Files:** `(public)/login/page.tsx`, `__tests__/app/login-member-panel.test.tsx`

- [ ] RED: the staff form is byte-identical — email, password, Forgot password, "New coach?
      Create an account", and the existing "Invalid email or password" behaviour unchanged.
- [ ] RED: beneath a divider — *Taken an assessment?* / *We'll email you a link to your reports.
      No password needed.* / **Get a link to my reports →** linking to `/member/sign-in`.
- [ ] RED: **the page never probes the email.** No request is issued on blur, on change, or on
      any path other than the deliberate password submit. Assert on the absence of a fetch —
      this is the single behaviour that keeps the front door from becoming Esperto's oracle.
- [ ] RED: with the flag off, the panel is absent.
- [ ] GREEN · verify · commit.

### Task 14: The campaign delete warning

**Files:** `components/assessments/CampaignDetail.tsx`, `__tests__/components/assessments/campaign-delete-dialog.test.tsx`

- [ ] RED: flag on — *"…will lose access — including the reports they can see today. Their
      responses stay in your records. This is not reversible."* Both halves present: gone for
      the member, kept for the coach.
- [ ] RED: flag off — the current copy, unchanged.
- [ ] RED: the **public**-campaign delete dialog is untouched (separate component; public quiz
      takers are not members).
- [ ] GREEN · verify · commit.

### Task 15: Release-1 proof and source-of-truth hygiene

- [ ] `e2e/member-portal.spec.ts`: flag off → `/member/sign-in` 404s. Flag on → request a link →
      assert the Link-sent copy → redeem the token → land on the list → open a report → **reuse
      the same link and reach Link-not-valid** → sign out → the report route 404s.
- [ ] E2E negative: a second seeded member's report id, requested with the first member's
      session, 404s.
- [ ] Manual: confirm no member report content appears in `sessionStorage` or `localStorage`
      after a full sign-in → view → reload cycle.
- [ ] Measure and record the §10 timing residual between the eligible and ineligible request
      paths; put the number in the CHANGELOG entry rather than repeating the wireframe's
      "identical timing" claim.
- [ ] Migration Safety Gate · targeted Jest suites · ESLint on changed files ·
      `CI=true npx next build --turbopack` from `src/`.
- [ ] Write both ADRs. Add the §4 terms to `CONTEXT.md`.
- [ ] `CLAUDE.md` anchor + prose; prepend the `plans/CHANGELOG.md` entry.
- [ ] Set the prod flags **via the Vercel REST API as `type:"encrypted"`** against the
      `scaling-up` team project `prj_xcAWuAmGZAU3DCHgAauRv2WPKneo` — never piped `vercel env add`,
      and never `--scope chief-aio-fficer` (0 env vars; it will read as "no flags set"). Redeploy:
      env injects at build time. Verify **in-app**, not by reading the flag back — a `sensitive`
      var reads empty whatever its value.

---

# Release 2 — Discovery and the team report

Sequenced second deliberately. Exactly one person in production would see a team report today,
so shipping Grant B inside the tracer would mean debugging the hardest authorization path
against a single observation.

### Task 16: The team report route

- [ ] RED: `/member/reports/team/[campaignId]` renders `GroupReport` for a CEO of a live
      campaign; 404s for a non-CEO participant, for a deleted campaign, and with no session; the
      loader's `empty` and `notApplicable` panels render as they do for a coach.
- [ ] RED: the list shows a **Team report** marker on those entries and none on personal ones.
- [ ] GREEN: reuse Task 6's `getMemberGroupReport` and Task 7's adapter; `generatedAt = new Date()`
      at the page boundary, keeping the gate and loader clock-free (the coach route's pattern).
- [ ] Verify · commit.

### Task 17: Discovery lines

- [ ] RED: the line appears on the in-place `results` phase, on `/org-survey/{alias}/thank-you?results=1`,
      and in `results-email.ts`; each is absent when the flag is off; none of them contains a token.
- [ ] RED: the copy passes the Task 12 forbidden-vocabulary assertion.
- [ ] GREEN: a shared `MemberPortalLink` component plus the email's text equivalent. Placement
      inside each surface follows the §19 item 4 decision.
- [ ] Verify · commit · SoT hygiene · launch as in Task 15.

---

# Release 3 — Coach-initiated send

### Task 18: The send endpoint

- [ ] RED: bulk sends to every **completed** respondent on the campaign and to nobody else;
      per-person sends to one; a not-yet-completed respondent is refused; **the response body
      contains no token and no link, in any shape**; the caller must pass the campaign's existing
      authorization; the flag off → 404.
- [ ] RED: a coach-issued token obeys every rule a self-issued one does — single use, the same
      one-hour expiry, same completion requirement, no extension.
- [ ] ⚠️ Surface to the operator before building: a bulk send now hands out **one-hour** links.
      A coach who sends at the end of the day reaches members whose links expire before they
      read the mail. The recovery is self-service (**Send another link**), but the bulk button's
      confirmation copy should say the links are short-lived rather than let a coach assume
      otherwise.
- [ ] GREEN: reuse `sendMemberSignInLink` with `via: "COACH"`. One template, three triggers.
- [ ] Verify · commit.

### Task 19: The coach surface

- [ ] RED: `Send report links` appears beside `Send Invitations` / `Send Reminders`;
      `Send report link` appears in a completed respondent's row beside `Resend` and **not** in a
      non-completed one's; the confirmation dialog states how many people will be emailed and
      names the action rather than the mechanism; flag off → neither control exists.
- [ ] GREEN: a counted dialog following the campaign-delete pattern, **not** `window.confirm()` —
      a deliberate divergence from the two buttons beside it, approved per §19 item 2.
- [ ] Verify · commit · SoT hygiene · launch as in Task 15.

---

## Deferred, and recorded so they are not later logged as defects

- Pruning redeemed/expired `MemberSignInToken` rows after 30 days — no cron exists.
- Bringing sign-in emails under the at-least-once outbox (ADR-0030).
- Alerting on `member_signin.send_failed` beyond human-read `vercel logs`.
- Deltas 1–5 in [`../../MEMBER_PORTAL_V1_SCOPE_AND_DELTAS.md`](../../MEMBER_PORTAL_V1_SCOPE_AND_DELTAS.md).
- Retiring the ADR-0027 `sessionStorage` rehydrate now that a durable, authorized results URL
  exists. Real simplification; out of scope here.

## Plan Self-Review Checklist

- [ ] Every task has a RED step that fails for the stated reason before any implementation.
- [ ] No task both refactors a shared module and adds a feature (Task 5 ships alone).
- [ ] Flag-off byte-identity is asserted in Tasks 11, 12, 13, 14, 17, 19 — not assumed once.
- [ ] The duplicate-address case is asserted twice: at resolution (Task 2) and at the render
      boundary (Task 6).
- [ ] No test asserts that the sign-in response *differs* for a known address.
- [ ] No new code path writes a member's address to an audit row on a refusal.
- [ ] A GET never redeems — asserted explicitly, not implied by the UI shape.
- [ ] The one-hour expiry is pinned as a literal in at least one test.
- [ ] The raw token is asserted absent from every response body, log, and email field but the href.
- [ ] Every claim of "verified" in the CHANGELOG entry corresponds to a command that was run.
