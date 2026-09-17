# Member portal — v1 scope and known deltas

**What this is:** the record Jeff asked for on 16 September 2026 — *"let's make sure
we document the gap to fix later"* — written when we agreed the first version of the
member portal would be smaller than what Esperto does.

**Prepared:** 16 September 2026
**Audience:** Jeff, and anyone reviewing the January cutover plan
**Status:** agreed scope. Nothing here is a surprise or a defect; it is the list of
things v1 deliberately leaves for later, and the two places where the September 15
status report promises slightly more than v1 will deliver.

---

## What v1 delivers

A person who has completed an assessment can sign in with an emailed link — no
password — and see:

- every report from assessments **they personally completed**, and
- the **team report** for any campaign where they are marked as the CEO.

That is the whole of it. It matches what Jeff was shown on the 15 September call
and covers the behaviour he described as the biggest missing piece.

Access is limited to people a coach has entered into the system for a campaign.
People who take a public quiz are not included — Jeff's decision on the same call.

---

## Delta 1 — Per-level report access rules

**What Esperto does.** An administrator can define named *member levels* (CEO/founder
and so on) and then configure, for each level and each type of report, what that
level is allowed to see across three separate scopes:

- reports the person completed themselves
- reports belonging to their own group or team
- reports belonging to their **parent** group or team

Each report type also carries a switch determining whether the person the report is
*about* is allowed to see it — Esperto can bar a report's own subject from reading it.

**What v1 does.** One rule, fixed: your own reports, plus the team report if you are
the CEO. No configuration, no per-report-type control, no parent-group scope.

**Why it matters.** This is the machinery behind "the CEO sees everything, department
heads see their people, nobody above them." v1 covers the CEO half of that sentence
and none of the department-head half.

**What closing it needs.** A new configurable concept of member level, an access
matrix per level and report type, and the screens to administer it. This is the
largest item on the list and is worth doing only once we know which combinations
coaches actually use — configuring three scopes across every report type is a lot of
control to hand someone who may only ever need two settings.

---

## Delta 2 — Sharing a report with another person

**What Esperto does.** Any individual report can be shared with named people. The
share carries an expiry — two weeks by default — and one of two levels of access,
view-only or editor. Members see a Share action on each of their reports. An
administrator can see, for any person, two separate lists: reports they can see
because of their level, and reports shared with them directly.

**What v1 does.** Nothing. There is no way to give one person access to another
person's individual report.

**Why it matters, and why it is easy to miss.** This is how a CEO in Esperto actually
reaches an individual team member's report. It reads as though it should be covered
by the level rules above, and it is not — Esperto keeps the two mechanisms visibly
separate. Any expectation of "the CEO can open anyone's report" depends on this
feature, not on Delta 1.

**What closing it needs.** A sharing record with an expiry, the member-facing action,
the administrator's view of existing shares, and a decision on whether we want the
editor access level at all or only view-only.

---

## Delta 3 — More than one CEO or co-founder

This is item 5 on the punch list, and it now has a specific cause.

**What Esperto does.** Being a CEO or founder is a property of the *person*. Nothing
stops several people in the same company from holding it.

**What our platform does today.** Being CEO is recorded against a person's
participation in a single campaign, and the database actively permits **only one per
campaign**. This is not a missing feature — it is an enforced rule.

**Why it matters.** A company with two co-founders runs into this immediately, and
today the team report goes to whichever of them was tagged. Because v1's rule is
literally "the team report if you are the CEO", this constraint is load-bearing for
the portal rather than a side issue.

**What closing it needs.** A database change, then a decision about what a team
report means when several people qualify — do they all receive it, or does the
company nominate one recipient?

---

## Delta 4 — Member-run campaign management

Discovered 16 September, after the scope conversation. Nobody has asked for this, but
it is the largest single thing Esperto's portal does that we had not accounted for.

**What Esperto does.** A member can open a campaign they are attached to and *run* it:
add participants, see how many responses have come in, see the full participant list,
fill in their own questionnaire, and — notably — **change the campaign's expiration
date**. Adding a participant offers three routes: pick from their own department,
search existing members, or invite someone entirely new.

**What v1 does.** Nothing. Campaign setup and participant management stay entirely
with the coach.

**Why it matters.** This is a delegation model: the coach creates the campaign, and
the client-side leader staffs and runs it. It also means the close-date change on the
punch list (item 3) exists on *both* sides in Esperto — coach and member — where we
have been treating it as a coach-only screen.

**Worth a conversation before it becomes a gap.** If coaches have been relying on
clients to chase their own teams, removing it shifts that work back onto the coach.
If they have not, this is a large feature nobody needs.

---

## Delta 5 — Deliberate differences, not shortfalls

These are choices. Recording them so they are not later logged as defects.

**No list of unfinished assessments.** Esperto's portal has a Campaigns tab showing
assessments a person has been invited to but not completed, with NEW / INVITED /
STARTED / COMPLETED states and a countdown to the deadline. We are leaving it out
because our invitation emails already contain a durable link that resumes an
assessment exactly where it was left. Jeff's own reasoning on 16 September: making
someone sign in to the portal instead *"seems like the long way."*

**No profile screen.** Esperto members can edit their own name and title. Ours are
maintained by the coach.

**No in-portal help.** Esperto carries FAQ, Videos, Links and a feedback form inside
the portal, pointing technical issues at *"your supervisor"* rather than support.

**No passwords.** Esperto members may optionally set one. Ours is emailed-link only,
which is simpler and removes a category of support request.

**No self sign-up.** Esperto allows people to enrol themselves into a campaign or
group through a link. Only a coach can add someone to a campaign in our platform.

**No home screen.** Esperto opens on a greeting and a count of reports and campaigns.
Ours opens directly on the reports themselves.

---

## Where this differs from the 15 September status report

Two rows in the feature comparison promise slightly more than v1 delivers. Neither is
a change of plan — both are cases where the status report was written before the
scope conversation. Worth correcting before the November announcement, since the
wider coaching organization will be reading it.

| Status report | What v1 delivers |
|---|---|
| *Restrict reports to the member hierarchy* — listed as Phase 1 | Only the CEO → team-report rule. The department-head level of the hierarchy is Delta 1. |
| *Login for **all respondents** to see their reports* | Invited respondents only. Public quiz takers were excluded on the 15 September call. |

---

## Rough effort, for sequencing

Relative sizes, not dates.

| Item | Size | Notes |
|---|---|---|
| Delta 3 — multiple CEOs | Small–medium | Mostly a database change; the product question is who receives the team report |
| Delta 2 — sharing | Medium | Self-contained; does not depend on the others |
| Delta 1 — level access rules | Large | The administration screens are most of the work, not the rules themselves |
| Delta 4 — member-run campaigns | Large | A whole second management surface; needs a product decision before any sizing is meaningful |
| Delta 5 items | Small each | Only worth doing if a coach asks |

Delta 2 and Delta 1 are independent of one another. Delta 3 partly gates Delta 1,
because the levels concept and the CEO concept end up being the same idea.

Delta 4 is the one to decide on rather than schedule. It is large, nobody has asked
for it, and the right question is whether coaches currently rely on clients to chase
their own teams — not how long it would take.

---

## One caveat on the Esperto findings

The descriptions of Esperto above come from its live system and its own administration
software, examined on 15–16 September 2026 with the account provided. They are not
from vendor documentation.

The three access scopes and the sharing mechanism are stated in Esperto's own on-screen
labels, so those are solid. What we could not observe from the outside is how its server
resolves a conflict — for example when a person's level grants access but a report type
withholds it. If we ever build Delta 1, that ordering needs deciding on its own merits
rather than assumed to match Esperto.

---
---

# Appendix — internal reference

Everything above is written for Jeff. Everything below is for us. It is the durable
record of what was actually observed, so no future session has to re-derive it.

## A1. Esperto sign-in, as measured

A single endpoint routes by email; the server decides what happens next.

```
POST /api/v1/login            {email}
  → {action:"password"}        coach/admin — show password field
  → {action:"memberpassword"}  member who has set a password
  → {action:"membersuccess"}   member without one — magic link ALREADY sent
  → {action:"choice"}          email is both a user and a member
  → {action:"registration"}    → /register
  → {action:"admin"|"portal"}  a live session already exists → /admin2 or /member
  → {status:"ERROR","Login failed"}   unknown address
```

Verified live: the demo member from the recording returns `membersuccess`; the admin
account returns `password`. That is why the recording shows no second step — one field,
submit, go to your inbox.

Token service:

```
POST /api/v1/members/portallogin      {email}   issue + email a portal token
GET  /api/v1/token/{token}                      inspect  → {type, target}
POST /api/v1/token/{token}/redeem               consume  → {type, target}
```

The inspect/redeem split is how single-use is implemented. Sibling issuers exist for
narrower purposes: `members/personaldata`, `members/personalreports`.

**Token and session are separate lifetimes.** The emailed link is *single use, 14 days*
(its own footer states: "this 'magic link' is valid for a single use and expires on
2026-09-29"). Redeeming it mints `Esperto_Session`, an **HS512 JWT valid 24 hours**,
`HttpOnly; Secure; SameSite=strict; Path=/`. Long-lived link, short-lived session.

Two things not to copy: the endpoint is a **user-enumeration oracle** (three
distinguishable answers), and the expiry printed in the email carries **no timezone**.

## A2. Member portal surface map

From `GET /api/v1/i18n/messages/member/en` — the portal's own string table, 107 keys.

| Screen | Key evidence |
|---|---|
| Home | `helper.greeting.*`, counts for Campaigns and Reports |
| Campaigns | `campaigns.paragraph.intro` "campaigns where you are invited/participating"; `status.{new,invited,started,completed}`; `campaigns.completed` "Past Campaigns"; `daystocomplete` |
| Manage Campaign | `managecampaign.addparticipants.*`, `form.button.changeexpirationdate`, `managecampaign.participants.title`, `campaigns.campaignsreceived`, `managecampaign.fillin.*`, `membercard.you` |
| Reports | `reports.paragraph.intro` — "personal and summary reports, as well as the ones shared with you"; `label.allreports`; `button.shareselected` |
| Share | `sharereport.memberwithaccess`, `sharereport.p.sharedvaliduntil`, `sharereport.expires`, `form.button.revoke` |
| Profile | `profile.title`, `profile.membersince` |
| Help | `form.button.{faq,videos,links,leavefeedback}` |

Add-participant offers three tabs: `admin.tab.yourdepartment`, `admin.tab.searchresults`,
`admin.tab.invitenew`.

## A3. Coach-side invite flow

From `GET /api/v1/i18n/messages/admin/en`.

- Campaign creation includes participant selection and an **auto-invite** switch:
  *"Auto-invitation is active. All participants will immediately receive an invitation
  mail on campaign creation."*
- Manual: **Invite Participants** / **Invite Batch Participants** list those *"not yet
  invited"*; *"invited IMMEDIATELY after submitting this form."*
- Reminders exist, automatic and manual, keyed on *"having been invited / having started
  / having been reminded."*
- The body is a per-campaign **Participant Mail** template.
- The invitation link goes to the **assessment**. There is no accept/registration step
  before portal access — activation (`adduser.sendactivation`) belongs to the coach/admin
  lane, not the member lane.

**Respondent import** is a 3-step wizard worth copying for punch-list item 2: upload
`.xlsx/.xls/.csv/.ods` by drop-file → map file columns to sample columns → preview.
*"The first data row will be read as column headers. Only the first worksheet of a file
will be parsed."*

## A4. Access model internals

Two independent mechanisms, kept visibly separate in the product.

**Level-based** — `GET /api/v1/members/{id}/reports/shares` returns
`{owned:{personal,summary}, shared}`. The UI names `owned` **`levelReportAccess`**.
A member row carries a `level` (live value observed: `ceofounder`) and a single `group`;
groups nest via `parentgroup`. "Edit Member Level" configures, per report type:
own reports · own group/team reports · parent group/team reports. A report's detail
shows *"required group & level for same group access"* / *"…for parent group access"*,
plus *"Report-owner can(not) see this report"*.

Measured: a `ceofounder` member had `owned.summary: 1`; two members with no level had
`0`. Same org, same data. **n=1 — indicative, not proof.**

Second elevation route: an "extra param" marking *"special members of a campaign in the
memberportal"* — hence *"based on level **or special participant status**"*.

**Share-based** —
```
POST   /api/v1/reports/{reportid}/access   {members:[...], expirationdate}   default +2 weeks
DELETE /api/v1/reports/{reportid}/access/memberid/{memberid}
```
Access types `viewonly` | `editor`.

## A5. Our corresponding constraints

- **No end-user principal.** `User.role` is ADMIN/STAFF/COACH; `OrgRespondent` has no
  user link. All respondent-facing authorization today is per-campaign token.
- **Email ≠ identity.** Uniqueness is only `(organizationId, dedupeSource, dedupeValue)`,
  so one address may map to several rows. Production 2026-09-16: 4 of 16 emails span
  multiple orgs (max 3) — **all four free-mail personas; none of the 10 corporate
  addresses does.** Test data, but the resolver must still return a set.
- **No single-use token exists.** `password-reset` is stateless and self-invalidates via
  a password-hash fingerprint (does not generalise — a login mutates nothing);
  `ceo-report-access` is stateless, 30-day, reusable; `AssessmentInvitationToken` is
  deliberately reusable. Redeem-and-burn is a new primitive.
- **One CEO per campaign**, enforced by partial unique index
  `assessment_campaign_participants_ceo_unique` on `(campaignId) WHERE isCEO = true`.
- **Reusable seam:** `ceo-report-access-token.ts` + `-cookie.ts` + live revalidation in a
  transaction is a working non-operator viewer. Its cookie is **exact-path scoped**,
  which a portal cannot be — hence ownership must be re-verified per report render.
- **Hierarchy already modelled:** `OrgTeam.parentTeamId` nests; `OrgRespondent.teamId`;
  `AssessmentCampaignParticipant.teamPathAtAdd[]` with a GIN index. No concept of *level*.
- **Production scale, 2026-09-16:** 22 live roster members across 10 orgs; 21 hold ≥1
  submission; 30 live campaigns (25 invited / 5 public); **2 summary reports, 1 person**
  would see one under the v1 rule; 36 of 101 respondent submissions sit on live campaigns.

## A6. Method

Findings come from: the Sep 15 recording; Esperto's live API with the supplied admin
account; its Angular bundles (`/login/`, `/admin2/`); and its i18n endpoints. Read-only
throughout — no Esperto record was created, modified, or deleted.

**Not verified:** how the server resolves level-vs-report-type conflicts; whether a
brand-new member can request a portal link with no prior activation (would need creating
a member — a write to their production system); whether more than one member may hold
`ceofounder` simultaneously.
