# Member portal v1 — design

**Status:** DRAFT · NOT GATED · no feature code until grill + explicit approval (AGENTS.md Golden Rules)

**Date:** 2026-09-17

**Scope:** a person a coach has entered into the system signs in with an emailed link — no
password — and sees the reports they are entitled to see, where entitlement follows the member
**hierarchy**: their own reports always, everything in the company if they are CEO/founder,
their own team and below if they lead a team. Plus the evaluations they have been invited to.

**Revision 2 (2026-09-18):** rewritten after watching the 2026-09-15 recording directly. Three
things in revision 1 were wrong, all inherited from a second-hand summary. They are recorded in
§3 so nobody reintroduces them.

**Canonical product record:** [`../../MEMBER_PORTAL_V1_SCOPE_AND_DELTAS.md`](../../MEMBER_PORTAL_V1_SCOPE_AND_DELTAS.md) — ⚠️ its Delta 1 and its "no concept of level" claim are superseded by this document.

**Canonical UI record:** [`../../wireframes-phase2/wave8/27-member-portal-reports.md`](../../wireframes-phase2/wave8/27-member-portal-reports.md) — ⚠️ its Non-goals list is superseded; its security Acceptance notes stand.

**Link-security research:** [`../../research/2026-09-17-email-link-rewriting-and-url-fragments.md`](../../research/2026-09-17-email-link-rewriting-and-url-fragments.md)

**Visual design:** <https://claude.ai/artifact/4wmRTct1wDpvFuN6z9n8rj> — ⚠️ 10 artboards drawn against revision 1's smaller surface; needs redrawing for §5.

---

## 1. Outcome

The platform's first surface built for someone who is neither a coach nor an admin. Jeff called
it "the third screen" and "the biggest one" of the gaps he found.

1. A coach enters a person into the system, as they do today. **That alone makes them a member.**
2. The member reaches `/member/sign-in`, enters their email, and receives a single-use link.
3. They land on a **home screen** — a greeting, and two tiles: **Evaluations** and **Reports**.
4. **Reports** shows every report they are entitled to see, as a card grid with search.
5. **Evaluations** shows the assessments they have been invited to and can still complete.
6. Opening a report renders the existing report, with entitlement re-checked server-side.

No password is ever set. No registration step exists.

### 1.1 The entitlement rule — Jeff's item #4

Exactly three rules, evaluated against data we already store. No configuration screen.

| Member's level (`OrgRespondent.roleType`) | Sees |
|---|---|
| CEO/founder family (`ceofounder`, `ceofounderwithteam`, `ceofounderalone`) | Every report in **their organization** (§6.0) |
| `teamleader` — a **department head** | Their **own team and every team beneath it**, minus any CEO-family member |
| `employee`, `guest`, unset, unrecognised | **Their own reports only** |

Everyone sees their own reports regardless of level. Nobody ever sees **above** themselves —
Jeff was explicit: *"the department heads can see their people, but nobody above them."*

**`teamleader` means department head.** Confirmed by the operator, 2026-09-18: in Scaling Up's
language the leadership team *is* the department heads, one rung below the CEO. The stored
label, "Leadership team member", reads like a peer and had been flagged as ambiguous; it is not.

**The CEO-family guard is load-bearing, not belt-and-braces.** A team leader never sees a
CEO-family member's report, whatever the team tree says. The reason is §6.3's third property:
`teamId` records which team a person is **in**, not which team they **lead**, and those diverge
the moment a coach models the leadership team as its own team — which is a natural thing to do
and is exactly the shape sitting in the current data (`ABC Corp → Engineering → Exec Team`).
Without the guard, a department head recorded in "Exec Team" would see every other department
head *and the CEO*: the precise inverse of the rule. The guard enforces "nobody above them"
directly instead of hoping the hierarchy was drawn the right way round.

Jeff's words, 2026-09-15 at 04:07:

> "it's using the hierarchy that we built into the member setup, right? So the CEO can see
> everything. If you have multiple departments, the department heads can see their people, but
> nobody above them. So it's using that hierarchy that's in there to do it."

**Why this is fixed rules and not Esperto's matrix.** Esperto ships an administrator screen
configuring, per level and per report type, visibility across own / own-group / parent-group.
Jeff never asked for that screen; he described a behaviour and asked us to think it through.
Three fixed rules deliver the behaviour, need no new UI, and can be replaced by a configurable
matrix later without changing what a member sees on day one. Building the matrix first would be
configuring three scopes across every report type for coaches who may only ever need one setting.

### 1.2 The entry gate — being in the system

A member may request a sign-in link if a coach has entered them into the system: a live
`OrgRespondent` row in a live organization. **Completing an assessment is not required.**

Jeff's words, 2026-09-15 at 05:09, answering "Who gets access to this?":

> "Whoever has an email in the system. So if a coach puts an email into the system, they would
> get access to it. I wouldn't assume people from the public would get it. Anybody taking one of
> the public quizzes — but anybody that's taking a campaign led report that the coach has put
> them into the system would be able to log in."

Public quiz takers are excluded. They have no roster row, so the rule excludes them by
construction rather than by a special case.

**A member with nothing to show is a normal state, not an edge case.** Under revision 1's
completion gate the empty state was "rare by construction"; it is now the *first* thing a newly
added member sees. The Reports empty state and the Evaluations list carry that weight — see §17.

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

## 3. Corrections to revision 1, and where we still diverge from Esperto

### 3.1 Three things revision 1 got wrong

All three came from building on a written summary of the 2026-09-15 call instead of the call.
Recorded so they are not reintroduced.

| Revision 1 said | The recording says | Where |
|---|---|---|
| Entry gate is **completing an assessment** | *"Whoever has an email in the system"* | 05:09 |
| Department-head visibility is out of scope (Delta 1) | Jeff describes it as the requirement and says *"I'm more concerned with four"* | 04:07, 09:56 |
| We have **no concept of level**, so one must be built | `lib/assessments/respondent-levels.ts` already holds the six Esperto levels with `isCEOFamily()`; `/portal/members` displays a **Level** column; `OrgTeam.parentTeamId` already nests | code |

⚠️ The third has a sharp edge. The level data is **stored and editable** — member modal, import
wizard, organizations API, `/portal/members` — but it drives **no access decision anywhere**
today. `isCEOFamily()` has exactly one caller, suggesting a CEO in the campaign wizard. Treat
this as *wiring existing data into a new rule*, not as a feature that half exists.

### 3.2 Where we still diverge, deliberately

| Esperto | Ours | Why |
|---|---|---|
| `POST /login` routes by email and returns six distinguishable answers, including `Login failed` for an unknown address | The front door never probes the email | That endpoint is a user-enumeration oracle |
| Expiry printed as `2026-09-29 15:39:13`, no timezone | The expiry line names a zone explicitly | Jeff raised timezone handling as its own defect on the same call (06:14) — shipping it inside this feature would be the bug arriving with its own fix |
| Sign-in link valid **14 days** | **1 hour** | Every auth vendor surveyed uses minutes to an hour; 14 days is a standing key in a mailbox |
| Members may optionally set a password | Emailed link only | Jeff: *"there's no username, no password, nothing"* (03:44) |
| An admin matrix configuring level × report-type × own/own-group/parent-group | **Three fixed rules** (§1.1) | Jeff described a behaviour, not a screen. See §1.1 |
| Person-to-person report **sharing** (a `Share` button on every report card) | Not in v1 | Visible in the recording at 05:05 and genuinely separate from the hierarchy — see §18 |

## 4. Domain additions

New words, for `CONTEXT.md`. Three collide with words the codebase already uses.

**Member.** A person on an organization's roster (`OrgRespondent`), considered as *someone who
can sign in*. Not a `User`; no role, no password, no row of their own. *Avoid:* "respondent"
(the roster person in the assessment domain), "participant" (that person's inclusion in one
campaign), "user" (an ADMIN/STAFF/COACH account).

**Member identity.** An email address plus the **set** of live `OrgRespondent` rows sharing it.
The address is the identity; the set is resolved fresh on every request and never collapsed.

**Level.** `OrgRespondent.roleType` — one of six Esperto-aligned values. Already stored and
editable; from this wave on it also **decides what a member may see** (§1.1). *Avoid:* "role"
(that is `User.role`, ADMIN/STAFF/COACH — a different axis entirely), "job title"
(`OrgRespondent.jobTitle`, free text, decides nothing).

**Entitlement.** The set of respondents whose reports a member may open, derived per request from
level and team (§6.3). *Avoid:* "permission" (implies something stored or granted), "ownership"
(too narrow — a CEO is entitled to reports they do not own).

**Member sign-in link.** A single-use, one-hour, DB-backed credential emailed to an address,
exchanged once for a member session. Distinct from the **invitation link**, which is reusable,
campaign-scoped, and says *take this assessment*. *Avoid:* "magic link" — say **sign-in link**.

**Member session.** A short-lived sealed cookie scoped to `/member`, proving only that someone
redeemed a link for that address on this browser. Never proof of entitlement to any report.

## 5. Surfaces and routes

A new route group `(member)`. Every member endpoint lives **under `/member/`**, including the
POST handlers, so the session cookie can be path-scoped to `/member` and never travel to an admin
or coach route. This follows the `(public)/org-survey/[campaignAlias]/me/route.ts` precedent;
there is no `/api/member/*`.

| Route | Kind | Purpose |
|---|---|---|
| `/member/sign-in` | page | Request form · Link-sent · Link-not-valid · the token landing |
| `/member/sign-in/request` | POST | Issue a link. Always the same response |
| `/member/sign-in/exchange` | POST | Redeem a token for a session. Never a GET |
| `/member/home` | page | Greeting + the two tiles |
| `/member/reports` | page | The card grid |
| `/member/reports/[submissionId]` | page | One personal report |
| `/member/reports/team/[campaignId]` | page | One group report |
| `/member/evaluations` | page | Invitations the member can still complete |
| `/member/evaluations/[invitationId]/open` | GET → redirect | Server-side handoff into the survey (§6.5) |
| `/member/sign-out` | POST | Destroy the session |

`/login` gains one member panel beneath a divider. `(member)/layout.tsx` carries the public brand
chrome (`su-public-brand.css`) and none of the admin shell.

### 5.0 The screens, as Jeff demonstrated them

Taken from the 2026-09-15 recording, 03:47–05:15. These are the shapes to match; exact copy and
layout come from the redrawn artboards (§19).

**Home** (03:47). A time-of-day greeting, then a short welcome line, then two side-by-side
panels — **Evaluations** and **Reports** — each with a one-line description and a large round
button.

**The greeting names the level only for the CEO family.** Esperto renders *"Good morning CEO John
Adams !"* for everyone with a level. That flatters a CEO and labels everyone else: *"Good morning
Employee, Jane"* reads badly, and on a shared screen it announces someone's tier. So: CEO/founder
gets the prefix, everyone else gets their name.

**Reports** (05:05). Not a list — a **card grid**. Each card carries a report thumbnail, the
report's name, and its own action. Above the grid: a search field and filter controls
(Esperto: *All reports* / *Select all* / *Deselect all*), with the intro line *"This is an
overview of all reports available to you. This includes your personal and summary reports as
well as the ones shared with you."*

⚠️ Two things visible in that frame are **not** in v1 and must not be copied by reflex: the
per-card **Share** button (§18) and the multi-select checkboxes that exist to drive a bulk share.
Our cards carry a single **View report** action. Dropping multi-select removes the only reason
for *Select all* / *Deselect all*, so those go too; search stays.

**The card's instrument treatment is typographic, not an image.** Esperto's cards carry a report
thumbnail; we have no rendering pipeline for that, **and no instrument artwork exists in the repo
either** — nothing under `src/public` for any of the five configured aliases. So the card gets a
coloured header block with the instrument name set large, one colour per instrument. That does
the graphic's entire job on this screen — telling a Rockefeller from an LVA at a glance — costs
nothing to produce, never goes stale when an instrument is renamed, and adds no asset pipeline.

**The company appears on a card only when the member spans more than one.** Same rule, and same
reason, as the person's name: show what disambiguates, hide what is noise. A member in a single
engagement never sees a company line; a CEO of one company who is also an employee at another
sees both labelled. This matters more than it did in revision 1, because the hierarchy means one
member can now see a whole company's reports interleaved with their own from elsewhere.

**No pagination in v1.** Search only, unbounded grid. The largest possible list today is a
handful; the grid is the cheapest thing in this design to change later; and paging now means
designing empty-page and filtered-page states nobody will see this year.

**Evaluations.** Esperto shows status per invitation (`new` / `invited` / `started` /
`completed`) and a days-to-complete countdown. Ours lists the member's own open invitations with
the assessment name, the close date if one is set, and a **Continue** action.

**Report view.** No new screen: the existing report, existing renderer, existing print path.

### 5.1 The link carries its secret in the query string, and a GET never redeems it

The emailed link is `{APP_URL}/member/sign-in?t=<raw token>`. Landing on it **does nothing**.
The page shows a single **View my reports** button; clicking it POSTs the token to
`/member/sign-in/exchange`, which redeems it and mints the session.

**Why the query string and not the URL fragment.** The fragment was the initial choice, on the
reasoning that a fragment is never transmitted to a server and so cannot reach an access log or
a `Referer` header. Research on 2026-09-17 (`docs/research/2026-09-17-email-link-rewriting-and-url-fragments.md`)
established three things that overturn it:

1. **A fragment hides nothing from the scanner.** Safe Links reads the whole email body in order
   to decide what to rewrite, so Microsoft holds the complete link — `#` and all — regardless.
   The fragment only stops an HTTP *fetch* from seeing the secret; it never stopped the *read*.
2. **Fragment handling through a rewriting proxy is undocumented at every vendor** — Microsoft,
   Google and Apple all say nothing, in any product doc or known-issues page. Of the three
   plausible behaviours, one percent-encodes the fragment into the wrapper's `?url=` value,
   which puts our secret into **Microsoft's** server logs — strictly worse than our own — and
   another drops it, which breaks sign-in silently, with no error available to anyone.
3. **No auth vendor does it.** Auth0, Okta, Stytch, Supabase, Clerk, WorkOS and Firebase all put
   the credential in the query string. The consensus safety mechanism is not concealment; it is
   a **short life plus single use plus a device/session binding**.

What the fragment did genuinely buy was keeping the secret out of *our own* logs. That is
achieved directly instead — see the scrubbing rule below — without taking a dependency on
undocumented third-party behaviour that can change without notice and fails invisibly.

**Three rules make the query-string form safe, and all three are load-bearing:**

- **A GET never consumes the token.** Redemption happens only on a POST originating from the
  button. This is the documented defence against scanners that open links in email — a real,
  vendor-acknowledged failure mode that WorkOS deprecated its entire magic-link product over,
  and which Supabase documents as the root cause of its most common auth support issue. It would
  have been required with the fragment too (a scanner that renders JavaScript would have burned
  an auto-redeeming link), so it is not a cost of this choice.
- **The token is scrubbed from our own logs.** `t` is added to the request-log redaction list,
  and the sign-in page sets `Referrer-Policy: no-referrer` so the token cannot ride a `Referer`
  header to any third party.
- **The URL is replaced immediately after redemption**, so the spent token does not sit in the
  browser's address bar or history.

**No JavaScript is required anywhere in the sign-in path.** The button is a plain HTML form that
POSTs the token. (An earlier draft said the exchange needed JS — that was inherited from the
fragment design, where a script had to read the `#`. It does not apply here.)

**Not to be confused with the invitation link.** That one deliberately keeps its `#t=` fragment
(`services/notifications.ts:1129`) and stays **reusable**, so a scanner opening it costs
nothing. Do not "harmonise" the two, and do not make the invitation link single-use.

## 6. Identity, eligibility and entitlement

### 6.0 What "organization" means here

An `Organization` row is **one coach's engagement with a company**, not the company itself
(operator, 2026-09-18). The same real business engaged by two coaches is two rows — production
already carries `ABC Corp` and `1_ABC-Corp` — and a CEO tagged in one sees only that engagement.

This bounds the CEO scope to something defensible: *everything your coach has run with you*. It
also means a member may legitimately hold different levels in different rows, which is why
entitlement is computed per row and unioned (§6.3), and why the reports list labels the company
when a member spans more than one (§5.0).

### 6.1 Resolution — an address maps to a set of roster rows

`resolveMemberIdentity(db, email) → { normalizedEmail, members: MemberRow[] }`

where each `MemberRow` carries `{ respondentId, organizationId, teamId, roleType }`.

- Normalize: trim, lowercase. Match `OrgRespondent.normalizedEmail`, falling back to a lowercased
  `email` comparison for rows written before that column was populated.
- Filter to `OrgRespondent.deletedAt IS NULL` **and** `Organization.deletedAt IS NULL`.
- Return the **set**. Never `findFirst`.

Why the set matters more now than it did in revision 1: entitlement is computed **per row**, not
per person. One address may be a CEO at one company and an employee at another, and the correct
result is CEO-scope in the first and own-reports-only in the second. Collapsing to one row would
either leak a whole company's reports or hide them.

Production note: all four multi-organization addresses today are free-mail test personas, and
none of the ten corporate addresses spans organizations. That is exactly why this is easy to get
wrong and never notice.

### 6.2 Eligibility — a live roster row, nothing more

A sign-in link is issued iff `members` is non-empty. See §1.2 for Jeff's wording and why
completion is **not** required.

### 6.3 Entitlement — what the member may open

Computed fresh on every request, never stored in the session, never cached client-side.

For each `MemberRow`, the set of respondents whose reports it can reach:

```
scopeFor(row):
  own = { row.respondentId }                              # always

  if isCEOFamily(normalizeLevel(row.roleType)):
      return every live respondent in row.organizationId

  if normalizeLevel(row.roleType) == "teamleader" and row.teamId != null:
      team = every live respondent whose teamId is row.teamId
             or any descendant of row.teamId in the OrgTeam tree
      return own ∪ { r ∈ team : not isCEOFamily(normalizeLevel(r.roleType)) }

  return own
```

`normalizeLevel` exists only to enforce the canonical six; it aliases nothing and returns unknown
values unchanged, so they fall through to own-only. See §6.3.1.

The member's total entitlement is the union across rows. A report is openable iff its
submission's `respondentId` is in that union **and** its campaign is live.

Three properties worth stating because they are the ones a reviewer should attack:

- **Strictly downward, twice over.** Nothing in `scopeFor` walks to a parent team, *and* the
  CEO-family subtraction means a leader cannot reach upward even when the tree is drawn so that
  they would. Esperto has a parent-group scope; we do not implement it.
- **The guard does not fix peer visibility, and that is accepted.** A department head recorded in
  a shared "leadership team" node still sees the other department heads in it. Closing that would
  need a "team I lead" field distinct from "team I am in", which nobody has asked for. The
  mitigation is guidance — record a department head in the department they run — plus the coach-UI
  nudge in §13.1.
- **Organization-bounded.** A CEO's scope is their organization, never the platform. There is no
  cross-organization visibility at any level.
- **`teamleader` with no team sees only themselves.** A level without a team is not an error
  state — it is common in the current data — and it must fail closed, not open.

### 6.3.1 Legacy level values

Production contains `roleType` values the code does not know: **`CEO`** (1 row) and
**`TEAM_MEMBER`** (2 rows), neither in `RESPONDENT_LEVELS`. `isCEOFamily("CEO")` returns **false**
today, so a person labelled CEO would silently get own-reports-only.

- **Nothing is aliased. The map is empty, deliberately.** Neither `CEO` nor `TEAM_MEMBER` is
  mapped, so both resolve to own-reports-only.
- The earlier draft mapped `CEO` into the CEO family on the grounds that its meaning was obvious.
  Reversed 2026-09-18: it is one row, its provenance is unexplained, and the mapping would grant
  the **widest scope in the system** from a guess about a string. Failing closed means a person
  sees too little and says so; failing open means they see too much and nobody finds out.
- `TEAM_MEMBER` is likewise unmapped — it could mean rank-and-file or leadership-team, a whole
  tier apart.
- **The fix for both is data, not code:** a coach sets a real level (§13.2 surfaces it).
- A test enumerates every distinct `roleType` present in production and fails when one is neither
  canonical nor explicitly aliased. That is what turns the next unknown value into a red test
  instead of a silent denial — or, worse, a silent grant.
- The alias map is code, not a data migration: reversible by revert, and it never rewrites a row
  a coach can see and edit.

### 6.4 The group report

A member sees a campaign's team/group report when they are entitled to **every** completed
respondent in that campaign under §6.3. In practice that is the CEO for a whole-company campaign
and a team leader for a campaign confined to their team.

This replaces revision 1's rule, which keyed on `AssessmentCampaignParticipant.isCEO`. Deriving
it from §6.3 instead means there is **one** entitlement rule in the system rather than two that
can disagree.

⚠️ **Two CEO concepts now coexist and they are not the same thing.** `OrgRespondent.roleType` is
a property of the *person*; `AssessmentCampaignParticipant.isCEO` is a property of their
*participation in one campaign*, is DB-enforced unique per campaign, and drives group-report
composition today. This spec uses `roleType` for portal entitlement and leaves `isCEO` alone.
Do not unify them in this wave — that is Jeff's item #5, which he explicitly deferred
(*"I'm more concerned with four and we'll deal with five as we can"*, 09:56), and it is the
reason multiple co-founders cannot both be tagged today.

### 6.5 Evaluations — what the member may still complete

The Evaluations surface lists live `AssessmentInvitation` rows for the member's own respondent
ids — **own only, never the hierarchy**. Seeing a colleague's *report* is a reporting decision;
opening their *questionnaire* is not something any level grants.

**Continue grants the invitation session directly. It does NOT mint a token.**

An earlier draft proposed minting a fresh invitation token and redirecting. Research on
2026-09-18 established that this breaks the Jeff #65 stable-links machinery in four independent
ways, any one of which is disqualifying:

- `AssessmentInvitationToken.source` is a **closed enum** (`LEGACY_CURRENT | ORIGINAL | REMINDER`)
  with identity assertions in five places. A portal token has no legal value; labelling it
  `REMINDER` bumps `resentCount` and records a delivery for an email nobody sent.
- A staged token is **resolvable immediately**, before any send — directly contradicting the
  contract's *"a failed reminder send creates no newly usable link."*
- With `WAVE_J65_STABLE_LINKS_KILL` flipped for containment, minting degrades to the legacy
  overwrite and **destroys the respondent's real emailed link**.
- Minting overwrites the parent `expiresAt`, silently moving the invitation's expiry.

None of that is necessary, because **the member is already authenticated when they press
Continue.** A token is a credential you post to someone you cannot yet identify; a session is what
you hand a person you have identified. So:

```
GET /member/evaluations/{invitationId}/open
  1. require a member session
  2. load the invitation; 404 unless its respondentId ∈ this member's OWN ids
  3. run classifyInvitationExchangeAvailability — the same eight lifecycle gates the
     emailed-link exchange applies (campaign live, ACTIVE, open, not closed, invitation
     not revoked/expired/SUBMITTED). Refuse BEFORE granting anything.
  4. seal the invitation session for that campaign alias
  5. redirect to /org-survey/{alias}
```

Nothing is minted, nothing rotates, no history row is written, no counter moves.

**Two implementation notes.** `getInvitationSession` is currently private to the exchange route;
it must be exported as an explicit grant seam rather than reached into. And step 3 must run
before step 4 — the emailed paths refuse a closed campaign *before* touching state, and this one
must too, or a member gets a dead end after a write.

**Accepted side effect:** entering a survey flips the respondent's status from Pending/Sent to
**Viewed**, which coaches see on the campaign dashboard. That is already true of the emailed link,
so the portal is consistent rather than novel — but a coach watching a campaign will see statuses
move without having sent anything.

### 6.6 Deleted campaigns

Invisible to members, retained for coaches. Every query filters `campaign.deletedAt IS NULL`, and
the per-report loaders re-apply it.

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
- **Expiry:** **1 hour** for a self-service request; **24 hours** when a coach sends it (§13).
  The two differ because the risk does: a self-requested link answers an anonymous form, while a
  coach-sent one is a deliberate act by an authenticated user against a roster they own. A
  one-hour coach link is also unusable in practice — a campaign wrapped up at 5pm would post
  thirty links that die before anyone reads their evening mail. The stored `expiresAt` is the
  single source of truth and the email interpolates it; there is one template, not two. Deliberately not Esperto's 14 days — see §3. This is the primary
  safety property of the whole design: a credential that dies in an hour is low-value wherever
  it happens to be written down, which is what lets the token live in the query string at all.
  Stytch and Supabase default to 1 hour; Clerk and WorkOS use 10 minutes; Auth0 uses 3. One hour
  is the long end of the industry range, chosen because the audience is executives who may not
  open email until the evening, and the recovery is a self-service **Send another link**.
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
  transaction, resolve the identity set, compute entitlement (§6.3), load the submission by id,
  and return `forbidden` unless `submission.respondentId ∈ entitlement` and
  `submission.campaign.deletedAt IS NULL`. Then project.

  **Entitlement is computed inside that transaction, not passed in.** A caller that hands the
  loader a precomputed scope has moved the authorization decision out of the loader, which is
  exactly what ADR-0012 forbids — and a scope computed a request earlier can be stale by the time
  it is used (a coach can change a member's level or team at any moment).

The extraction is guarded by the existing `respondent-report` tests, which must pass unchanged
before the member loader is written. This is a refactor of a load-bearing file and gets its own
red/green task.

`getMemberGroupReport(db, { normalizedEmail, campaignId })` applies the §6.4 superset test —
entitlement must cover **every completed respondent in the campaign** on a live campaign. Not a
flag check: a member entitled to all but one gets `forbidden`, never a partial report.

⚠️ **It performs its own authorization; it does not delegate through `canViewGroupReport`.** That
function is the coach/admin bulk-PII gate and expects a signed-in `ApiActor`, which a member does
not have. A build that "delegates to the existing loader" would either pass a null actor and get
a permanent `forbidden`, or — far worse — loosen the coach gate to accommodate the portal. The
member loader reaches the report data past that gate, carrying its own stricter test.

**Why the superset test is the whole defence.** The rendered group report is **not anonymous**:
on LVA, QSP and Five Dysfunctions it names every respondent, shows their individual answers and
prints their verbatim free text; scored reports carry the CEO's own column; every archetype
prints `CEO: <name>` in the header; and there is **no small-n suppression**, so in a two-person
campaign "Team avg (excl. CEO)" is one named person's score wearing a label. The superset test is
what makes that safe: a member can only open a group report when they were already entitled to
every individual report inside it. Because the CEO-family guard (§1.1) removes CEOs from a
department head's scope, a head can never be entitled to a campaign a CEO completed, and so can
never reach a report containing the CEO's column.

**One accepted residual.** The header renders `CEO: <name>` even when the CEO has not completed —
and the degrade note names them too. So a department head entitled to a campaign no CEO submitted
to still sees the CEO named. It is a name, not a score, and one the member already knows.
Suppressing it would mean a member-specific variant of a shared renderer, which is how renderers
start forking. Accepted, deliberately, and recorded here so it is not rediscovered as a defect.

### 9.2 Entitlement is recomputed on every render — and why that is not boilerplate

The existing per-report cookie is path-scoped to one campaign, so possession of it *is* the
grant. A portal cookie spans many reports and cannot be scoped that way, so possession proves
nothing about *which* report is being requested.

This is ADR-0027's failure by a new route. That incident is worth restating exactly, because
the first fix for it was also wrong: gating a rehydrate on a `/me` 410 time-bounds a leak
without closing it, because **`sessionStorage` is per-tab while cookies are per-origin** — a
410 proves some live credential exists in this browser, never *whose* report sits in a tab's
slot. It was closed only by putting **ownership on top of authorization**.

The hierarchy makes this sharper, not softer. Under revision 1 a stale check could only ever
serve a member their own report. Now a mistake in `scopeFor` serves one company's reports to
another company's employee. **Entitlement must be recomputed per render from the live level and
team**, never carried in the session, never cached in the client, and never trusted from a
previous request.

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
identical". That cannot be literally true: after the common identity lookup, the eligible path
adds a token INSERT, a greeting SELECT, an audit INSERT, and deterministic email preparation.
The design removes the largest variable term — the email send is scheduled with Next.js
`after()`, whose callback awaits SMTP only after the response has finished — but a multi-query
delta remains. Two options, and this is a decision for the grill, not a silent choice:

- **(a) Accept and bound it.** Measure the delta; if it is inside normal request jitter, record
  it as a known residual. Cheapest and honest.
- **(b) Fixed-floor response.** Delay every response to a constant floor above the worst
  eligible path. Closes the channel; costs a slower screen for everyone and a new failure mode
  if the floor is ever exceeded.

Recommended: **(a)** only if the production measurement records the actual eligible-versus-
ineligible envelope as acceptably inside normal request jitter. The decision must be based on
that measured multi-query delta, not on an assumed single-INSERT cost.

The cost of the no-enumeration rule is real and is paid on the page, not afterwards: a coach who
lands here types their email, sees Link-sent, and no email ever arrives. That is why the
**escape hatch — "Coach or staff? Sign in with your password"** — appears on *both* the sign-in
and the Link-sent states. It is not politeness; it is the only recovery available, and it has
to be present in advance because the anti-enumeration rule removes our ability to correct them
afterwards.

## 11. The sign-in email

One template, three triggers (self-service, results-page link, coach-initiated). Carries the
Scaling Up mark and **no coach logo** — the member requested this from the platform, not from
their coach. Copy is fixed by the wireframe; the three load-bearing parts:

- **Subject: `Your Scaling Up sign-in link`.** Repointed 2026-09-18. It used to read *"Your
  Scaling Up reports"*, written when only someone who had completed an assessment could receive
  one. Under the current gate a member added this morning can request a link and land on an empty
  Reports list, so the subject and body now name the **portal**, not its contents. Body: *"Here's
  your link to your Scaling Up assessments and reports."*
- **Fine print:** `This link works once and expires in {duration} — at {time} {timezone}.` Both
  values are interpolated from the stored `expiresAt`, which is **1 hour** for a self-service
  request and **24 hours** when a coach sent it (§7.2) — one template, not two. The relative
  phrasing leads because it is what a member can act on without arithmetic; the absolute time
  follows for anyone reading later. The timezone is **named**, never a bare timestamp (§3).
  ⚠️ A one-hour window makes this line materially more important than a 14-day one did — if the
  wording is wrong or the zone is missing, the member finds out by failing, not by reading.
- **Closing:** `Didn't ask for this? You can ignore this email — the link expires on its own and nothing changes.`

It must be unmistakably distinct from the coach's invitation email. Two emails, two jobs: the
invitation says *take this*, sent by the coach; the sign-in link says *see what you did*,
requested by the member. Confusing them in copy, subject lines, or support conversations is the
main foreseeable support cost of this feature.

**Delivery lane.** `AssessmentEmailOutbox` is `submissionId`-scoped with
`@@unique([submissionId, recipientRole])`; a sign-in link is address-scoped and belongs to no
submission, so it **cannot** use that outbox without a schema change that would weaken the
outbox's own idempotency key. v1 sends directly through `lib/smtp-transport.ts`. The eligible
request prepares the message, then schedules a Next.js `after()` callback which awaits
`prepared.send()` after the response has finished (§10). Invitation and reminder sends use the
same SMTP transport but are awaited by their request handler or durable worker; they were never
precedent for a floating promise. Member-link delivery records error-redacted `EMAIL_DELIVERY`
telemetry and emits `member_signin.send_failed` on failure. The eligible recipient remains in
delivery telemetry. On self-service sends that address is already present in
`MEMBER_LINK_ISSUED.performedBy`; on coach-issued sends the delivery row adds the eligible roster
address to the audit data available to operators, an accepted observability disclosure.
Ineligible addresses never reach either record. This lane is not durable: it has no retry and
remains bounded by the route's maximum invocation duration.

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

Both appear for **any respondent on the campaign**, completed or not — the entry gate is a
roster row, so a link is useful to someone who has not finished yet (it shows them their
Evaluations). This is a change from revision 1, which restricted both actions to completers on
the assumption that completion was the gate.

**The coach never sees the link.** It is generated server-side and delivered only to the
respondent's address — never rendered, returned in a response body, logged, or copyable. A
coach who could read it could open someone else's reports, which is the entire point of a
single-use credential. Coach-sent links obey every rule a self-requested one does: single use,
same one-hour expiry, same completion requirement. A coach cannot mint a link for someone who has
not completed, and cannot extend one.

**Coach-sent links live 24 hours**, not one (§7.2), and the coach is told so.

**The confirmation is a proper dialog, not `window.confirm()`.** The two buttons beside it use
the native one (`CampaignDetail.tsx` `handleSendInvitations` / `handleSendReminders`); this one
matches the newer campaign-delete pattern instead. That began as a style preference and became a
functional requirement: the dialog has to state the count **and** that the links expire in 24
hours, and a browser alert is a bad place to put a caveat people need to read.

**Rate limiting is its own.** The self-service request is limited to 10/minute per IP; a coach
bulk-sending thirty links from one office IP would trip that at ten. The coach path is
authenticated and authorized against a campaign they own, so it carries a separate, higher limit.

### 13.1 One nudge in the member editor

Setting a member's level to **Leadership team member** without also putting them in a team grants
nothing — the rule falls through to own-only (§6.3). Four of the seven people currently holding
that level have no team, so this is the common case, not an edge one.

The member editor shows an inline note when that combination is saved: the level decides what
they can see, and it needs a team to act on. Not a validation error — a coach may legitimately set
the level before the team structure exists.

### 13.2 Surfacing a level that grants nothing

With §6.3.1 aliasing nothing, a member stored as `CEO` or `TEAM_MEMBER` silently gets
own-reports-only. Nobody finds out until that person says "I can't see my team."

The member editor shows an inline warning when the stored level is not one of the canonical six:
*this level isn't recognised and grants no additional access — pick one below.* The editor
already tolerates unknown slugs by passing them through the dropdown, so the coach can see the
value; what is missing is being told it is inert.

The three existing rows are also corrected by hand before launch. Both halves matter: fixing the
rows clears today's data, and the warning stops the next import quietly recreating the problem.

These two are the only places the portal touches a coach screen other than §13 and §14.

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

Jeff wants a coach pilot **mid-October** and to be live October/November (2026-09-15 at 07:31).
That is roughly four weeks from this revision, so the sequence is set by what makes a pilot
possible, not by what is easiest to observe.

1. **Sign in and see your own reports.** Token, session, home screen, reports grid, personal
   report render, the email, the `/login` panel, the delete-dialog clause. Entitlement code is
   present but every member resolves to own-only — the three rules ship in step 2.
2. **The hierarchy (Jeff's #4), both rules.** `scopeFor`, the CEO scope, the department-head
   scope, the CEO-family guard, the legacy-value alias map, and the group report derived from
   them. Shipping this second is deliberate: it is the piece most likely to leak if it is wrong,
   and it is far easier to review against a portal that already works.

   ⚠️ **Correctness here is proven by seeded fixtures, not by production.** There is no real team
   structure in the database to smoke-test against — 5 teams across 10 organizations, 1 nested,
   named `Test` and `TEST DELETE ME 2026-05-28 sub-team`. The first real org charts will arrive
   with the pilot coaches. That makes the unit tests in the plan's Task 3 the whole of the
   assurance, and it makes the CEO-family guard more valuable, not less: it holds whatever shape
   the pilot's trees turn out to have.
3. **Evaluations**, including the survey handoff (§6.5).
4. **Coach-initiated send** and the discovery surfaces.

⚠️ **Steps 1 and 2 are both needed before the pilot means anything.** A CEO in the pilot who
signs in and sees only their own report will report the feature as broken, because Jeff
demonstrated the opposite. If the timeline forces a cut, cut step 3 or 4, never step 2.

### 16.1 Raised on the same call, not in this spec

Jeff listed four other items in the same conversation. None belongs to this wave, and all four
should be tracked somewhere before they are forgotten:

| Item | His words | Note |
|---|---|---|
| Timezone handling on close dates | An Australian campaign *"closed 12 hours early because it closed on Eastern time"* (06:22) | Touches this wave only via the expiry line in §11 |
| Bulk import of members from Excel | *"if they are onboarding a new customer, they could take an Excel list and bring everybody in"* (06:54) | **Deferred by the operator, 2026-09-18.** Partly built already — `/portal/members/import` plus an **Import from Esperto** action on the Members & Teams header — but the plumbing is in development and not trusted. It is the natural way real org structures and levels arrive, so it gates how useful the hierarchy is in practice; it does not gate building it |
| Extending a campaign's close date | *"I'm okay with… changing the close date for everybody and not try to get as granular as a single person"* (08:44) | He explicitly rejected Esperto's per-person version |
| Multiple CEOs / co-founders | *"I'm more concerned with four and we'll deal with five as we can"* (09:56) | Blocked today by the partial unique index on `isCEO`; see §6.4 |

## 17. Failure behaviour

| Condition | Member sees | Server does |
|---|---|---|
| Unknown / ineligible address | Link-sent | Nothing. Counter metric only, no audited address |
| Throttled | Link-sent | No issuance. `member_signin.throttled` |
| Token expired / redeemed / unrecognised | Link-not-valid, one state for all three | No audit (distinguishing them tells the token's holder more than they need and buys nothing — the recovery is identical) |
| Session expired | Sign-in request form | — |
| Report not owned | 404 | `authz_deny` metric, no audit row |
| Report on a deleted campaign | 404 | Same as not-owned; indistinguishable by design |
| Member with zero live reports | Empty state — *"When you complete an assessment, your report will appear here."* — with a link across to Evaluations when they have open invitations | **Common, not rare.** Any newly added member sees this before they complete anything. Copy must not imply they did something wrong, nor hint that reports existed and were removed |
| Member entitled to nobody but themselves, with a CEO-family level | Their own reports only | A level with no matching organization data fails closed. Silent by design — a member is never told what they cannot see |
| `teamleader` with `teamId` null | Their own reports only | Fails closed (§6.3); common in current data, not an error |
| SMTP failure | Link-sent (already shown) | `member_signin.send_failed`; member's recovery is Send another link |

## 18. Non-goals

Revision 1's non-goals were written against a smaller scope; most of them are now in. What
remains out:

- **Person-to-person report sharing.** Esperto puts a `Share` button on every report card
  (visible at 05:05) with an expiry and viewonly/editor access levels. Nobody has asked for it,
  and it is genuinely separate from the hierarchy: sharing is how a CEO in Esperto reaches a
  report their *level* does not grant. Ours grants by level, so the common case is covered.
- **The configurable access matrix.** We ship the behaviour as fixed rules (§1.1). The matrix is
  worth building only once we know which combinations coaches actually use.
- **Parent-group visibility.** Esperto has the scope; Jeff said nobody sees above them.
- **Multiple CEOs per campaign.** Jeff's #5, explicitly deferred by him.
- **Member-run campaign management.** Esperto members can add participants and change a
  campaign's expiry. Jeff asked for the close-date change as a **coach** capability (08:44) and
  said nothing about members doing it. Large, unrequested.
- **A profile screen, in-portal help, passwords, self sign-up.**
- **Public quiz takers.** Excluded by Jeff at 05:28.
- **Multi-language.** Jeff: *"the bottom of the pile, just where it is"* (10:53).

## 19. Open decisions

**All design decisions are settled.** A sixteen-question grill on 2026-09-18 closed the frontier;
the answers are folded into the sections above and summarised here so a build environment can see
what was decided rather than inferring it.

| # | Decision |
|---|---|
| 1 | An Organization is one **coach's engagement** with a company (§6.0) |
| 2 | The company appears on a report card **only when the member spans more than one** (§5.0) |
| 3 | Legacy `CEO` and `TEAM_MEMBER` are **not aliased**; both grant own-only (§6.3.1) |
| 4 | Self-service links **1 hour**, coach-sent links **24 hours** (§7.2) |
| 5 | The email is repointed: subject **"Your Scaling Up sign-in link"** (§11) |
| 6 | The greeting names the level **only for the CEO family** (§5.0) |
| 7 | The group report's `CEO: <name>` header is **accepted** (§9.1) |
| 8 | Evaluations → Continue **grants the invitation session**; mints nothing (§6.5) |
| 9 | The member editor **warns on an unrecognised level**, and the existing rows are fixed (§13.2) |
| 10 | Finishing an assessment started from the portal behaves **exactly as from an email** — no back-link, no redirect. One path, not two |
| 11 | Card treatment is **per instrument**, not per report (§5.0) |
| 12 | Reports grid is **search only, no pagination** (§5.0) |
| 13 | The instrument treatment is **typographic**, not image files — none exist (§5.0) |
| 14 | **"Group report"** on both surfaces. Esperto says *summary report*, which collides with our own Summary Reporting feature (§4) |
| 15 | **Send report links** uses a proper dialog, not `window.confirm()` (§13) |
| 16 | The gate stays **"whoever has an email in the system"**; an empty portal is an acceptable first impression (§1.2) |

**Measured, 2026-09-18** — read-only production counts, all of which are test data (the operator
confirms production carries no real customer records): 22 live members across 10 organizations;
levels `teamleader` 7 · unset 5 · `ceofounderwithteam` 3 · `TEAM_MEMBER` 2 · `ceofounder` 2 ·
`ceofounderalone` 1 · `employee` 1 · `CEO` 1; only 8 of 22 attached to a team; 5 teams across 3
organizations, 1 nested, max depth 2; 6 organizations have a CEO-family member and **none has
more than one**; largest CEO scope 6 people; 101 submissions with a roster row, 36 on live
campaigns. **Re-measure before any launch claim** — and treat these as a description of the test
fixtures, not of customer behaviour.

**Still outstanding, and not design decisions**

- The **artboards need redrawing** for §5.0's screens. The existing ten were drawn for a flat
  list with no home screen and no Evaluations.
- **Needs Jeff:** the remaining items in §16.1 — timezone handling on close dates, campaign
  close-date extension, multiple CEOs, multi-language.

**Known limitation, accepted**

A department head recorded in a shared leadership-team node sees their peers (§6.3). The
CEO-family guard stops it reaching upward; nothing stops it reaching sideways. Closing it would
need a "team I lead" field distinct from "team I am in".

## 20. Design gate

Before any feature code:

- [ ] Grill this specification. Revision 1 passed an internal read and still had three factual
      errors in it, every one of them inherited rather than invented.
- [ ] Resolve §19 items 1–3.
- [ ] Redraw the artboards for the screens in §5.0, and get a visual sign-off.
- [x] Check the production distribution of `OrgRespondent.roleType` and `teamId` — done
      2026-09-18, numbers in §19.
- [ ] Add the §4 terms to `CONTEXT.md`.
- [ ] Write ADRs: **member identity is an address and a set**; **entitlement is derived per
      request from level and team, never stored**; **the member session authenticates, the loader
      authorizes** (extending ADR-0012 and ADR-0027).
- [ ] `/co-validate` the implementation plan.
- [ ] Explicit approval to build.
