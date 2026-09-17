# Member portal v1 — design

**Status:** DRAFT · NOT GATED · no feature code until grill + explicit approval (AGENTS.md Golden Rules)

**Date:** 2026-09-17

**Scope:** a person who has completed an invited assessment signs in with an emailed single-use link — no password — and sees the reports from assessments they personally completed, plus the team report for any campaign where they are the CEO. Everything else Esperto's member portal does is out; see §18.

**Canonical product record:** [`../../MEMBER_PORTAL_V1_SCOPE_AND_DELTAS.md`](../../MEMBER_PORTAL_V1_SCOPE_AND_DELTAS.md) (Jeff-facing scope + Appendix A1–A6, the durable Esperto/production record)

**Canonical UI record:** [`../../wireframes-phase2/wave8/27-member-portal-reports.md`](../../wireframes-phase2/wave8/27-member-portal-reports.md) (states, copy, forbidden vocabulary, visual contract)

**Visual design:** <https://claude.ai/artifact/4wmRTct1wDpvFuN6z9n8rj> (10 artboards)

---

## 1. Outcome

The platform's first surface built for someone who is neither a coach nor an admin.

1. A member reaches `/member/sign-in` — from a coach-sent link, from the line on their
   results page or results email, or from the member panel beneath the staff form on `/login`.
2. They enter their email. The response is the Link-sent state, always.
3. If — and only if — that address has at least one completed assessment on a live campaign,
   a single-use link is emailed to it.
4. Clicking it exchanges the link for a short-lived sealed session and lands on `/member/reports`.
5. The list shows every report they completed, newest first, plus a **Team report** entry for
   each live campaign where they are the CEO.
6. Opening one renders the *existing* report, through the *existing* renderer, with ownership
   re-verified server-side on that render.

No password is ever set. No registration step exists. **Completing an assessment is the
acceptance.**

## 2. Evidence precedence

When evidence conflicts, apply in this order:

1. Direct product-owner (Jeff) acceptance — the 2026-09-15 call and the 2026-09-16 Slack scope decision.
2. The scope-and-deltas document, including its appendix (measured Esperto behaviour, measured production numbers).
3. The wireframe's Acceptance notes.
4. Current repository behaviour.
5. Esperto's observed behaviour — **parity is not a goal**; it is the source for the shape of
   the problem, and §3 records four places we deliberately diverge.

Production figures quoted here were measured read-only on 2026-09-16/17 against a small
pre-launch dataset. **Re-measure before any launch claim rests on one.**

## 3. Four deliberate divergences from Esperto

Recorded up front because each looks like a defect to anyone comparing the two systems.

| Esperto | Ours | Why |
|---|---|---|
| `POST /login` routes by email and returns six distinguishable answers, including `Login failed` for an unknown address | The front door never probes the email; the member path is a link the person clicks | That endpoint is a user-enumeration oracle. Our existing "Invalid email or password" already avoids it and must not be undone |
| Expiry printed as `2026-09-29 15:39:13`, no timezone | The expiry line names a zone explicitly | A member in Sydney reading a US-time expiry has no way to know when their link dies — this is punch-list item 1 arriving inside the feature we are copying |
| Members may optionally set a password | Emailed link only | Removes a whole category of support request, and Jeff's framing was *"there's no username, no password, nothing"* |
| Level × report-type × scope access matrix, plus person-to-person shares | One fixed rule | Jeff chose the smaller v1 and asked that the gap be documented — Deltas 1 and 2 |

## 4. Domain additions

These are new words. They belong in `CONTEXT.md` before implementation begins, because three
of them collide with words the codebase already uses for something else.

**Member.** A person on an organization's roster (`OrgRespondent`) who has completed at least
one assessment on a live campaign, considered as *someone who can sign in*. Not a `User`; has
no role, no password, and no row of their own. *Avoid:* "respondent" (the roster person,
whether or not they can sign in), "participant" (that person's inclusion in one campaign),
"user" (an ADMIN/STAFF/COACH account).

**Member identity.** An email address, plus the **set** of live `OrgRespondent` rows that
share it. Uniqueness is only `(organizationId, dedupeSource, dedupeValue)`, so one address may
legitimately map to several rows across organizations. The identity is the address; the set is
resolved fresh on every access and is never collapsed to one row.

**Member sign-in link.** A single-use, 14-day, DB-backed credential emailed to an address,
which can be exchanged once for a member session. Distinct from the **invitation link**
(reusable, campaign-scoped, says *take this assessment*). *Avoid:* "magic link" — the
member-facing word is **sign-in link**.

**Member session.** A short-lived sealed cookie scoped to `/member`, proving only that
*someone* redeemed a link for a given address on this browser. It is never proof of ownership
of a particular report.

**Team report.** The member-facing name for what coaches call the group or aggregate report.
Same artifact, same renderer. ⚠️ Unvalidated — see §19.

## 5. Surfaces and routes

A new route group `(member)`. Every member endpoint lives **under `/member/`**, including the
POST handlers, so the session cookie can be path-scoped to `/member` and never travels to an
admin or coach route. This follows the `(public)/org-survey/[campaignAlias]/me/route.ts`
precedent exactly; there is no `/api/member/*`.

| Route | Kind | Purpose |
|---|---|---|
| `/member/sign-in` | page | Request form · Link-sent · Link-not-valid · the token-exchange host |
| `/member/sign-in/request` | POST handler | Issue a link. Always the same response |
| `/member/sign-in/exchange` | POST handler | Redeem a raw token for a session |
| `/member/reports` | page (server) | The list |
| `/member/reports/[submissionId]` | page (server) | One personal report |
| `/member/reports/team/[campaignId]` | page (server) | One team report |
| `/member/sign-out` | POST handler | Destroy the session |

`/login` gains one member panel beneath a divider. `(member)/layout.tsx` carries the public
brand chrome (`su-public-brand.css`) and none of the admin shell.

### 5.1 The link is delivered in the URL fragment

The emailed link is `{APP_URL}/member/sign-in#t=<raw token>`. The page reads the fragment
client-side, POSTs it to `/member/sign-in/exchange`, and on success replaces the URL and
navigates to `/member/reports`.

This is the invited-survey exchange pattern (`invitation-tokens.ts` + `invitation-cookie.ts`),
reused for the reason it was chosen there: **a fragment is never sent to the server**, so the
raw credential cannot land in an access log, a proxy log, or a `Referer` header. A path- or
query-parameter token — which is what Esperto uses — lands in all three.

Two consequences to carry forward, both already true of the invited survey:

- The exchange **requires JavaScript**. A no-JS member sees the Link-not-valid state. Accepted;
  the survey they already completed has the same requirement.
- The exchange **strips the fragment**, so a reload of `/member/sign-in` does not re-enter the
  exchange branch. It therefore lands on the request form, not an error. This is the exact
  mechanism that made the ADR-0027 PII leak the common path rather than an exotic one, so
  nothing about the member portal may cache report content client-side. §9 makes that binding.

## 6. Identity, eligibility and the two grants

### 6.1 Resolution

`resolveMemberIdentity(db, email) → { normalizedEmail, respondentIds: string[] }`

- Normalize: trim, lowercase. Match on `OrgRespondent.normalizedEmail`, falling back to a
  lowercased `email` comparison for rows written before that column was populated.
- Filter to `OrgRespondent.deletedAt IS NULL` **and** `Organization.deletedAt IS NULL`.
- Return the **set**. Never `findFirst`. Collapsing to the first matching row serves one person
  another's report the day a real duplicate appears — today all four multi-org addresses are
  free-mail test personas, which is exactly why this is easy to get wrong and never notice.

### 6.2 Eligibility — the entry ticket

A sign-in link is issued iff there exists at least one `AssessmentSubmission` where:

- `respondentId ∈ respondentIds`, and
- the submission's campaign has `deletedAt IS NULL`.

Being on a roster grants nothing. Jeff's wording is the rule: *"Once a campaign recipient
completes an assessment, they can now login."* Without this, a coach adding a contact silently
creates a portal account for someone who has done nothing.

### 6.3 Grant A — own reports

Every `AssessmentSubmission` where `respondentId ∈ respondentIds` and the campaign is live.
Sorted by `submittedAt` descending. One flat list; no grouping, no company column, no filters
(reasoning in the wireframe — all cross-org members are test personas, and Esperto cannot
represent the case at all).

### 6.4 Grant B — the team report

Every live `AssessmentCampaign` that has an `AssessmentCampaignParticipant` row with
`respondentId ∈ respondentIds` **and** `isCEO = true`.

Listed whenever that row exists, without pre-computing whether the report has content: the
existing group-report loader already returns `empty` and `notApplicable` outcomes and the
existing panels render them. Pre-filtering would duplicate the loader's judgment in the list.

**Production reality check: exactly one person in production would see a team report today**
(2 summary reports exist). That is why §16 sequences personal reports as the tracer and the CEO
rule behind it — not because the rule is hard, but because it is nearly unobservable and would
be the wrong thing to debug first.

**One CEO per campaign is enforced**, by the partial unique index
`assessment_campaign_participants_ceo_unique` on `(campaignId) WHERE isCEO = true`. A company
with two co-founders hits this immediately. It is Delta 3, not a v1 bug, but v1's rule is
literally "the team report if you are the CEO", so the constraint is load-bearing here rather
than incidental.

### 6.5 Deleted campaigns

Invisible to members, retained for coaches. Every query above filters `campaign.deletedAt IS
NULL`, and the per-report loaders re-apply it. This matches the existing respondent-facing rule
and is what §14 makes coaches aware of before they delete.

## 7. The sign-in link

### 7.1 Persistence

New model. This is a **new primitive** — the repository has no single-use token today:
`password-reset` is stateless and self-invalidates via a password-hash fingerprint (which does
not generalise, because a login mutates nothing), `AssessmentInvitationToken` is deliberately
reusable, and the `AssessmentSubmission.resultsToken*` columns are **vestigial v7.5 schema with
zero application code** — do not mistake them for a working mechanism and do not reuse them
(they are submission-scoped; this credential is address-scoped).

```
model MemberSignInToken {
  id              String    @id @default(cuid())
  tokenHash       String    @unique   // sha256 hex of the raw token; the raw value is never persisted
  normalizedEmail String              // the address the link authenticates — NOT a respondent id
  issuedAt        DateTime  @default(now())
  expiresAt       DateTime
  redeemedAt      DateTime?
  issuedVia       String              // "SELF" | "COACH"
  issuedByUserId  String?             // set only for "COACH"
  campaignId      String?             // provenance only, for a coach-initiated send
  @@index([normalizedEmail, issuedAt])
  @@index([expiresAt])
}
```

**Keyed on the address, not on a respondent row.** The link authenticates an identity;
membership is resolved fresh at every access (§6.1). Keying it to a row would freeze a set that
is allowed to change between issue and redemption.

### 7.2 Lifecycle

- **Raw token:** 32 random bytes, base64url — `generateRawToken()` from `invitation-tokens.ts`, reused unchanged.
- **Stored:** `hashToken(raw)` only. A database leak alone cannot mint a session.
- **Expiry:** 14 days.
- **Single use, atomically:** redemption is
  `updateMany({ where: { tokenHash, redeemedAt: null, expiresAt: { gt: now } }, data: { redeemedAt: now } })`
  and succeeds only on `count === 1`. Two concurrent redemptions of the same link: exactly one wins.
- **Comparison:** by hash lookup, so no timing-sensitive compare is needed on this path;
  `timingSafeMatch` is not required and should not be cargo-culted in.
- **Eligibility is re-checked at redemption, not only at issue.** A member whose only campaign
  was deleted in the interim is refused.

### 7.3 Retention

Redeemed and expired rows are pruned after 30 days. `normalizedEmail` is personal data with no
further purpose once the link is dead. No cron exists for this today — §15 records it as an
operational follow-on rather than pretending it is covered.

## 8. The member session

Sealed iron-session, following `buildInvitationSessionOptions` in
`lib/assessments/invitation-cookie.ts`.

| Property | Value | Why |
|---|---|---|
| name | `member-session` | |
| payload | `{ normalizedEmail, issuedAt }` — **no respondent ids, no report ids** | The set is resolved per request; a frozen set is a stale grant |
| path | `/member` | A coach signed into the dashboard on the same browser can never have this cookie reach an admin route. Possible only because every member endpoint lives under `/member` (§5) |
| httpOnly / secure / sameSite | `true` / `true` / `strict` | Same as the invitation cookie |
| ttl | 24 hours (seal), cookie `maxAge` 23h 55m | Matches Esperto's session lifetime. Long-lived link, short-lived session |
| secret | `MEMBER_SESSION_SECRET` — **its own**, not `ASSESSMENT_SESSION_SECRET` | Two independent audiences; one secret rotation must not sign the other out |

**The session is not proof of ownership.** It proves only that someone redeemed a link for that
address on this browser. Every report render re-resolves the set and re-checks membership (§9).

**Two paths, never one identity.** Holding a staff account confers nothing here, and a member
session confers nothing in the admin or coach surfaces. The member path never touches a
NextAuth session, nor the reverse. Three production accounts are legitimately both (two
coaches, one admin, all with completed assessments); both paths work for them and they pick
whichever they want.

## 9. Rendering a report — extending the gate, not bypassing it

The existing gate (ADR-0012) is the right envelope and must be reused. It needs three additive
changes, and no behaviour change for any existing surface.

1. **`ReportSurface`** gains `"member"` (`report-metrics.ts`), with namespace `member_report`.
2. **`ViewReportOptions`** gains an optional `auditPrincipal?: string`. The core's audit write
   becomes `performedBy: opts.auditPrincipal ?? opts.actor?.email ?? "anon"`. Without this a
   member's view of named PII is attributed to `"anon"`. **Do not fabricate an `ApiActor`** —
   a fake actor would flow into `canManageCampaign` the first time anyone reused it.
3. **`noActorPolicy`** for the member adapters is `"tolerate"`; the member loaders own their own
   authorization, exactly as `getCampaignGroupReport` does today.

Audit **action** is unchanged — `VIEW_REPORT` / `GROUP_REPORT_VIEW` — discriminated by
`changes.kind: "member-report" | "member-team-report"`, following the existing
`kind: "public-lead-report"` precedent.

### 9.1 The authorization split

`getRespondentReport` today does authorization (`canManageCampaign`) and projection in one
function. The member loader needs the same projection under a different authorization, so:

- Extract the projection — raw submission row → `RespondentReport` — into a pure module with
  **no** authorization in it.
- `getRespondentReport` keeps its signature and behaviour, now delegating the shaping.
- Add `getMemberRespondentReport(db, { normalizedEmail, submissionId })`: inside **one**
  transaction, resolve the identity set, load the submission by id, and return `forbidden`
  unless `submission.respondentId ∈ set` and `submission.campaign.deletedAt IS NULL`. Then
  project.

The extraction is guarded by the existing `respondent-report` tests, which must pass unchanged
before the member loader is written. This is a refactor of a load-bearing file and gets its own
red/green task.

`getMemberGroupReport(db, { normalizedEmail, campaignId })` does the same over
`getCampaignGroupReport`: membership of the identity set **with `isCEO = true`** on a live
campaign, then delegate.

### 9.2 Ownership is re-verified on every render — and why that sentence is not boilerplate

The existing per-report cookie is path-scoped to one campaign, so possession of it *is* the
grant. A portal cookie spans many reports and cannot be scoped that way, so possession proves
nothing about *which* report is being requested.

This is ADR-0027's failure by a new route. That incident is worth restating exactly, because
the first fix for it was also wrong: gating a rehydrate on a `/me` 410 time-bounds a leak
without closing it, because **`sessionStorage` is per-tab while cookies are per-origin** — a
410 proves some live credential exists in this browser, never *whose* report sits in a tab's
slot. It was closed only by putting **ownership on top of authorization**.

Binding consequences for this design:

- No member report content is ever written to `sessionStorage`, `localStorage`, or any
  client-side store. The portal replaces the need for that store; it must not inherit it.
- The report pages are server components. Ownership is decided server-side, per request, from
  the freshly resolved set.
- `Cache-Control: no-store, private` on every `/member/*` response. `REPORT_NO_STORE_REGEX` in
  `src/middleware.ts` must be extended; a new regex that misses `/member/reports/...` is the
  same class of bug.

### 9.3 The report itself is unchanged

`BrandedReport` and `GroupReport` render exactly as they do for a coach viewing the same
respondent — same authored Welcome/Closing HTML, same print path, same
`reportConfigFor(templateAlias)` dispatch. The **route** is new; the **screen** is not. (The
wireframe's "opens the existing individual report at its current route" is imprecise: that
route's gate is `redirect-login` over `canManageCampaign`, so a member reaching it is bounced
to `/login`. The renderer is shared; the route cannot be.)

## 10. Enumeration, rate limiting, and one residual we are not going to claim we closed

`POST /member/sign-in/request` returns the **same status, the same body, and the same rendered
copy** for all four cases: unknown address, address with no roster row, roster row with no
completed assessment, and eligible member. Only the last sends an email.

Rate limiting: `RateLimits.auth` (10/min) on both a per-address key (hashed, never the raw
address) and a per-IP key. **A throttled request returns the identical Link-sent response** —
if throttling produced a visibly different outcome it would become the enumeration side channel
the rest of this section exists to prevent.

**The audit log must not become the oracle either.** A link *issued* is audited
(`MEMBER_LINK_ISSUED`, new `AuditAction`). A request for an unknown or ineligible address
writes **no row containing that address** — only an unattributed counter metric. Auditing the
typed address on the refusal path would reconstruct exactly the answer the response refuses to
give, for anyone who can read audit rows.

**The residual, stated honestly.** The wireframe says the response "and its timing are
identical". That cannot be literally true: the eligible path performs one additional INSERT and
enqueues an email. The design reduces it — the email send is dispatched **without being
awaited**, so SMTP latency (the large, variable term) never reaches the response — but a
single-INSERT delta remains. Two options, and this is a decision for the grill, not a silent
choice:

- **(a) Accept and bound it.** Measure the delta; if it is inside normal request jitter, record
  it as a known residual. Cheapest and honest.
- **(b) Fixed-floor response.** Delay every response to a constant floor above the worst
  eligible path. Closes the channel; costs a slower screen for everyone and a new failure mode
  if the floor is ever exceeded.

Recommended: **(a)**, with the measurement recorded in the launch entry. An attacker who can
measure a sub-millisecond INSERT across the public internet against a Neon database that
cold-starts has a far better oracle available in the noise.

The cost of the no-enumeration rule is real and is paid on the page, not afterwards: a coach who
lands here types their email, sees Link-sent, and no email ever arrives. That is why the
**escape hatch — "Coach or staff? Sign in with your password"** — appears on *both* the sign-in
and the Link-sent states. It is not politeness; it is the only recovery available, and it has
to be present in advance because the anti-enumeration rule removes our ability to correct them
afterwards.

## 11. The sign-in email

One template, three triggers (self-service, results-page link, coach-initiated). Carries the
Scaling Up mark and **no coach logo** — the member requested this from the platform, not from
their coach. Copy is fixed by the wireframe; the two load-bearing parts:

- **Fine print:** `This link works once and expires on {date} at {time} {timezone}.` The
  timezone is **named**, never a bare timestamp (§3).
- **Closing:** `Didn't ask for this? You can ignore this email — the link expires on its own and nothing changes.`

It must be unmistakably distinct from the coach's invitation email. Two emails, two jobs: the
invitation says *take this*, sent by the coach; the sign-in link says *see what you did*,
requested by the member. Confusing them in copy, subject lines, or support conversations is the
main foreseeable support cost of this feature.

**Delivery lane.** `AssessmentEmailOutbox` is `submissionId`-scoped with
`@@unique([submissionId, recipientRole])`; a sign-in link is address-scoped and belongs to no
submission, so it **cannot** use that outbox without a schema change that would weaken the
outbox's own idempotency key. v1 sends directly through `lib/smtp-transport.ts`, the same lane
as the invitation and reminder emails, dispatched without awaiting (§10), with structured error
logging and a `member_signin.send_failed` metric.

The accepted consequence: a send failure is invisible to the member, whose recovery is the
**Send another link** action already on the Link-sent screen. Bringing sign-in links under an
at-least-once outbox (ADR-0030) is a follow-on, recorded in §15 — not silently assumed.

## 12. Discovery — all three routes are v1

Nothing tells a respondent this portal exists. Esperto has the same hole; it was invisible in
the 2026-09-15 recording only because Jeff controlled the demo mailbox and operated the
respondent's sign-in himself.

**Of 25 live invited campaigns, 11 show the respondent nothing at all after they submit** — no
results email, no on-screen report. For those, the portal is not a convenience for revisiting a
report; it is the first time that person ever sees their own result. That number is why route 3
is not a fallback.

1. **Results surfaces** — a line on both terminal branches of the invited survey: the in-place
   `results` phase and the `/org-survey/{alias}/thank-you?results=1` page
   (`org-survey-client.tsx`). 13 of 25 campaigns reach one of these.
2. **Results email** — the same line in `results-email.ts`. 4 of 25 campaigns send one.
3. **Coach-initiated send** — §13.

Placement of the line within (1) and (2) is an open design decision — §19.

## 13. Coach surface — sending a report link

Two additions inside the existing campaign detail screen (`CampaignDetail.tsx`). No new page.

- **Bulk:** `Send report links`, beside the existing `Send Invitations` / `Send Reminders` —
  emails everyone who has completed.
- **Per person:** `Send report link`, in the respondent row's action cluster beside `Resend`.

Both appear **only for respondents who have completed**; `Resend` already covers the
not-yet-submitted case, and there is nothing to sign in to before completion.

**The coach never sees the link.** It is generated server-side and delivered only to the
respondent's address — never rendered, returned in a response body, logged, or copyable. A
coach who could read it could open someone else's reports, which is the entire point of a
single-use credential. Coach-sent links obey every rule a self-requested one does: single use,
same 14-day expiry, same completion requirement. A coach cannot mint a link for someone who has
not completed, and cannot extend one.

**The confirmation dialog is a deliberate upgrade.** The two buttons beside it use native
`window.confirm()` (`CampaignDetail.tsx` `handleSendInvitations` / `handleSendReminders`); the
design shows a proper dialog with counts, matching the newer campaign-delete pattern. This
diverges from its immediate neighbours and needs a conscious yes — §19.

## 14. Adjacent change — the campaign delete warning

Today: *"{N} invited and {M} completed participants will lose access. Responses are retained.
This is not reversible."*

Once the portal exists, "lose access" silently acquires a second meaning: the member's finished
reports vanish from their list. Jeff asked on 2026-09-16 that the warning say so.

> **Delete this campaign?**
> {N} invited and {M} completed participants will lose access — including the reports they can
> see today. Their responses stay in your records. This is not reversible.

Both halves must stay: gone for the member, kept for the coach. The new clause is **gated on
the same flag as the portal** and therefore ships in the same deploy — satisfying the
wireframe's "with or before, never after" without promising members a portal that is dark. The
public-campaign delete dialog is a separate component and is unchanged; public quiz takers are
not members.

## 15. Flags, rollout and operations

Convention follows Wave OSR (`wave-osr-flags.ts`): two levers, `isOn` truthiness
(`"1" | "true" | "TRUE" | "yes"`), read at call time, never cached.

- `WAVE_MP_MEMBER_PORTAL_KILL` — hard override, wins over everything.
- `WAVE_MP_MEMBER_PORTAL_ENABLED` — global enable. **No canary**: the surface is end-user
  facing, so a per-campaign canary would expose real members on a guess (the same reasoning
  Wave OSR used).

**Flag-off is byte-identical:** every `/member/*` route returns 404 (not 403 — a 403 confirms
the route exists), the `/login` member panel is absent, the coach buttons are absent, the
discovery lines are absent, and the delete dialog keeps its current copy.

**Kill semantics:** `KILL=1` makes member routes 404 immediately, so live sessions stop working
at the next request. Tokens are not invalidated — they simply cannot be redeemed. No stored
value is coerced (the Wave Q/W rule: flags gate capability, never persisted data).

⚠️ **Read the flag-state bullet in `CLAUDE.md` before drawing any conclusion about the prod
value of these vars.** Eight of 29 prod `WAVE_*` vars are `type:"sensitive"` and read back
empty whatever their real value; *"I saw it render" beats "the flag reads empty."* Write via the
REST API as `type:"encrypted"`, and redeploy — env injects at build time.

**Operational follow-ons, not covered by v1** (recorded so they are not later logged as defects):

- Expired/redeemed token pruning (§7.3) has no cron.
- Sign-in email delivery is not under the at-least-once outbox (§11).
- No alerting on `member_signin.send_failed` beyond human-read `vercel logs`.

## 16. Sequencing

Three releases, each shippable and separately observable. The order is set by observability, not
by size.

1. **Tracer — sign in and see your own reports.** Token, session, list, personal report render,
   the email, the `/login` panel, the delete-dialog clause. This is the whole mechanism; 21 of
   22 live roster members exercise it.
2. **Discovery + the CEO team report.** The three discovery surfaces and Grant B. The team
   report is sequenced second deliberately: **exactly one person in production would see one**,
   so shipping it inside the tracer would mean debugging the hardest authorization path against
   a single observation.
3. **Coach-initiated send.** The bulk and per-person actions plus the confirmation dialog.

## 17. Failure behaviour

| Condition | Member sees | Server does |
|---|---|---|
| Unknown / ineligible address | Link-sent | Nothing. Counter metric only, no audited address |
| Throttled | Link-sent | No issuance. `member_signin.throttled` |
| Token expired / redeemed / unrecognised | Link-not-valid, one state for all three | No audit (distinguishing them tells the token's holder more than they need and buys nothing — the recovery is identical) |
| Session expired | Sign-in request form | — |
| Report not owned | 404 | `authz_deny` metric, no audit row |
| Report on a deleted campaign | 404 | Same as not-owned; indistinguishable by design |
| Member with zero live reports | Empty state — *"When you complete an assessment, your report will appear here."* | Rare by construction: only reachable when every one of their reports has since landed on a deleted campaign. Copy must not imply they did something wrong, nor hint that reports existed and were removed |
| SMTP failure | Link-sent (already shown) | `member_signin.send_failed`; member's recovery is Send another link |

## 18. Non-goals

Each has a Delta in the scope document; keep the two in step.

- **Per-level access matrix** (Delta 1) — Esperto's level × report-type × own/own-group/parent-group configuration. The largest item, and worth doing only once we know which combinations coaches actually use.
- **Person-to-person report sharing** (Delta 2) — and note this is *not* covered by the matrix. It is how a CEO in Esperto actually reaches an individual team member's report; any expectation of "the CEO can open anyone's report" depends on this, not on Delta 1.
- **Multiple CEOs per campaign** (Delta 3) — DB-enforced today.
- **Member-run campaign management** (Delta 4) — add participants, change the expiry. The largest thing Esperto's portal does that ours will not. Needs a product decision (do coaches rely on clients chasing their own teams?), not a schedule.
- **An Evaluations tab** — invitation links already resume in place; Jeff called the portal route *"the long way"*.
- **A profile screen, in-portal help, a home screen, passwords, self sign-up** (Delta 5).
- **Public quiz takers** — excluded by Jeff on 2026-09-15.

## 19. Open decisions

**Needs Jeff or the operator, before the spec is final**

1. **"Team report" wording.** Coaches say *group report*. The member-facing screen currently
   reads *Team report*, unvalidated. A change here is copy-only but touches the marker, the
   list, and the route name.
2. **The bulk-send confirmation dialog** (§13) — a deliberate divergence from the two native
   `confirm()` buttons beside it. Worth a conscious yes.
3. **Delta 4** — decide, don't schedule.

**Needs a design decision before implementation**

4. Where exactly the portal line sits on the results page, the thank-you page, and in the
   results email.
5. §10's timing residual: accept-and-bound (recommended) or fixed-floor.

**Unverified, and honestly so**

6. Whether a brand-new Esperto member can request a portal link with no prior activation. The
   only definitive test creates a member — **a write to the client's production system** — so
   it needs explicit authorisation. Evidence so far says no activation step exists for members.
7. How Esperto resolves a conflict between a level grant and a report-type withhold. Only
   matters if Delta 1 is ever built, and it should then be decided on its merits rather than
   assumed to match.

## 20. Design gate

Before any feature code:

- [ ] Grill this specification (`mattpocock-skills:grilling`). The recurring failure mode in the
      investigation session was confident claims from thin evidence.
- [ ] Resolve §19 items 1, 2, 4, 5.
- [ ] Add the §4 terms to `CONTEXT.md`.
- [ ] Write ADRs: **member identity is an address plus a set, never a row**; **the member
      session authenticates, the loader authorizes** (extending ADR-0012 and ADR-0027).
- [ ] Visual review of the 10 artboards against the wireframe's visual contract (the standing
      editor-simplicity rule: every UI/UX decision gets a visual review first).
- [ ] `/co-validate` the implementation plan.
- [ ] Explicit approval to build.
