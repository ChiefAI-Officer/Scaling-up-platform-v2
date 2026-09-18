# 27 — Member portal: sign in, your reports, your evaluations

**Revision 2 — 2026-09-18.** Rewritten after the 2026-09-15 recording was watched directly.
Revision 1 described a flat list of reports behind a completion gate; both were wrong. See
§ Provenance.

The platform's first surface built for people who are neither coaches nor admins — Jeff's
"third screen". A **member** is a person a coach has entered into the system. They sign in with
an emailed link, no password, and see the reports they are entitled to see plus the assessments
they can still complete.

**Design spec:** [`../../superpowers/specs/2026-09-17-member-portal-v1-design.md`](../../superpowers/specs/2026-09-17-member-portal-v1-design.md) — authoritative for rules; this document is authoritative for screens and copy.

---

## How a member reaches this portal

Nothing here is new until step 4. Steps 1–3 exist today and are unchanged.

1. **A coach adds the person to a company.** Members & Teams → Add member, the import wizard, or
   while building a campaign. **This alone makes them a member.**
2. **The coach's invitation email goes out** — *take this assessment* — carrying a durable link
   that resumes in place. Unchanged.
3. **They complete it and their report is generated**, as today. *(Optional. A member who has
   completed nothing can still sign in — they will see their Evaluations and an empty Reports
   list.)*
4. **They sign in to see it.** From a coach-sent link, from the line on their results page, or
   from `/login`, where the member path sits beneath the staff form.

**Two emails, two jobs.** Step 2 says *take this*, sent by the coach. Step 4 says *see what you
did*, requested by the member. They must not look like each other, or be confused in copy,
subject lines, or support conversations.

There is no acceptance step, no registration page, and no password at any point.

---

## Front door — `/login`, unchanged for staff

One sign-in address for the whole platform. `/login` keeps exactly what it has — email,
password, Forgot password, "New coach? Create an account" — and gains one member path beneath a
divider:

- Heading: **Taken an assessment?**
- Body: We'll email you a link to your reports. No password needed.
- Action: **Get a link to my reports →**

**Nothing on this page probes the email.** The member path is a link the person clicks, never a
branch the server picks after inspecting the address. That is what stops the page revealing
which addresses exist — the failure Esperto ships, where an unknown address gets a red *"Login
failed"* and a real one gets a password prompt. The existing "Invalid email or password"
behaviour stays exactly as it is.

The accepted cost: a client landing here sees a password field that is not for them, against
Jeff's *"there's no username, no password, nothing"*. The divider and the panel are what make
the member path findable in spite of it.

---

## Sign-in — `/member/sign-in`

- Heading: **Sign in to your reports**
- **Audience line, directly beneath:** For people who've been set up by a Scaling Up coach.
- Guidance: Enter your email and we'll send you a secure link. There's no password to remember.
- Field: Email address
- Primary action: **Email me a link**
- Footer note: Links work once and expire after 1 hour.
- **Escape hatch, persistent:** Coach or staff? Sign in with your password →

> ⚠️ Revision 1's audience line read *"For people who've completed a Scaling Up assessment."*
> That is now false — being added by a coach is enough. Do not restore it.

### Why the audience line and the escape hatch are load-bearing

Most people arrive by clicking through from the front door and have self-selected. But a
bookmark or a forwarded URL lands someone here directly, and coaches have reports too — "Sign in
to your reports" disambiguates nothing on its own.

The escape hatch is the only recovery available. Because the response is deliberately identical
whether or not the address is known, a coach who lands here types their email, sees Check your
email, and **nothing ever arrives** — with nothing to tell them why. The anti-enumeration rule
removes our ability to correct them afterwards, so the correction has to be on the page in
advance.

**Three production accounts are both** coach/admin *and* member. Both paths genuinely work for
them. What must never happen is a screen implying they have to choose correctly.

---

## Link sent

- Heading: **Check your email**
- Body: If {email} is on file, we've just sent a sign-in link. It works once and expires in 1 hour.
- Secondary action: **Send another link**
- **Escape hatch, repeated:** Coaches and staff sign in with a password instead →

The body copy is identical whether or not the address exists, and stays that way — see
Acceptance notes. The escape hatch repeats deliberately: this is the screen someone stares at
when no email arrives, and the last place to redirect them.

---

## Opening the link — `/member/sign-in?t=…`

A screen, not a redirect. The member lands and **nothing has happened yet**.

- Heading: **You're one click from your reports**
- Body: For your security, this link only works when you open it yourself.
- Primary action: **View my reports**

The button is a plain form. **Nothing on this path needs JavaScript.**

**This click is not decoration.** Email security scanners open links automatically to check them
for malware; a link that signed the member in on arrival would be consumed by the scanner before
the member ever saw it, and they would arrive to a dead link with no explanation. WorkOS retired
their whole magic-link product over this. The click is what makes the difference between a
machine touching the link and a person using it.

After the click, the address bar is cleaned so the spent link is not left sitting in browser
history.

---

## Link not valid

- Route: `/member/sign-in` with a used, expired, or unrecognised token
- Heading: **This link is no longer valid**
- Body: Sign-in links work once and expire after 1 hour. Request a new one and we'll email it to
  you.
- Primary action: **Email me a new link**

One state covers all three cases. Distinguishing them tells whoever holds the token slightly
more than they need, and buys nothing — the recovery is identical.

---

## Home — `/member/home`

The first screen after signing in. Jeff demonstrated this; it is not a landing page we invented.

- Greeting: **Good morning, {first name}** — time-of-day aware. **The level is prefixed only for
  the CEO family** — *"Good morning CEO John Adams"*. Esperto prefixes it for everyone, which
  flatters a CEO and labels everyone else (*"Good morning Employee, Jane"*) and announces
  someone's tier on a shared screen. Everyone below CEO gets their name alone.
- Sub-line: Everything from your assessments, in one place.
- Two panels, side by side, each with a title, one line of description, and a large round button:

| Panel | Description | Button |
|---|---|---|
| **Evaluations** | The assessments you've been invited to complete. Your answers save as you go. | Go to evaluations |
| **Reports** | The results of the assessments you've completed. | Go to reports |

- Persistent: the signed-in member's name, and **Sign out**.

At 375 px the panels stack, Evaluations first — someone who has not finished yet is the more
likely visitor on a phone.

---

## Reports — `/member/reports`

- Heading: **Your reports**
- Intro: An overview of the reports available to you.
- **Search field** — filters by report name as you type.
- **A card grid**, not a list. Each card carries:
  - the **instrument treatment** — a coloured header block with the instrument name set large,
    one colour per instrument. Not an image: none exists in the product, and the block does the
    graphic's whole job here, which is telling a Rockefeller from an LVA at a glance.
  - the report name
  - the person it is about, **only when that is not the signed-in member**
  - the company, **only when the member's reports span more than one company**
  - the date it was completed
  - a **Group report** marker when it is one
  - one action: **View report**
- Sort: most recently completed first. **No pagination** — search only.

### What is deliberately not copied from Esperto

Esperto's equivalent screen carries a **Share** button on every card and multi-select checkboxes
with *Select all* / *Deselect all*. The checkboxes exist only to drive a bulk share. Sharing is
out of scope, so the checkboxes have no purpose — all three go. Search stays.

### Why the name and the company appear conditionally

Under the hierarchy a member may be entitled to reports that are not their own — a CEO sees their
whole company, a department head sees their team. A card that never said whose report it is would
be unreadable for them; a card that always said would be noise for everyone else. Same for the
company: a member attached to two companies sees a whole company's reports interleaved with their
own from elsewhere, and needs to tell them apart. A member in one company never does.

One rule, applied twice: **show what disambiguates, hide what is noise.**

---

## Evaluations — `/member/evaluations`

- Heading: **Your evaluations**
- Intro: Assessments you've been invited to complete.
- Per row: the assessment name, the closing date when one is set, and **Continue**.
- Sort: soonest closing date first; those without a closing date last.

**Own invitations only, never the hierarchy.** A CEO sees every report in their company and
**nobody else's questionnaire**. Seeing someone's result is a reporting decision; opening their
questionnaire is not something any level grants.

**Continue** hands the member into the assessment they already have access to. They do not sign
in again and they do not need to find the original email.

Behind it: the member is already signed in, so the platform **grants them the survey session
directly** rather than manufacturing a new emailed-style link. Nothing about their original
invitation changes — the link in their inbox still works, and its expiry does not move.

**Finishing behaves exactly as it does from the emailed link** — the thank-you page, or the
on-screen report where the campaign shows one. No back-link into the portal, no redirect. One
path through the assessment, not two.

---

## Empty states

Both are ordinary, not exceptional. A member added this morning sees both.

| Screen | Heading | Body |
|---|---|---|
| Reports, nothing yet | **No reports yet** | When you complete an assessment, your report will appear here. *(plus a link to Evaluations when any are open)* |
| Evaluations, nothing open | **Nothing to complete right now** | When your coach invites you to an assessment, it'll appear here. |

> ⚠️ Revision 1 called the empty Reports state "rare by construction". Under the completion gate
> it was. It is now the **first thing a new member sees**, and the copy carries that weight.

Neither may imply the member did something wrong, and neither may hint that something existed
and was removed.

---

## Report view

No new screen. **View report** opens the existing report — same renderer, same authored
Welcome/Closing HTML, same print path — rendered exactly as a coach viewing the same person sees
it.

---

## The sign-in email

The only artifact that leaves the platform, and the one a member looks at hardest. It must be
unmistakably distinct from the coach's invitation email.

- Subject: **Your Scaling Up sign-in link**
- Opening: Hi {first name},
- Body: Here's your link to your Scaling Up assessments and reports. There's no password to enter.
- Primary action: **View my reports**
- Fine print, directly beneath: This link works once and expires in {1 hour / 24 hours} — at
  {time} {timezone}.

> ⚠️ The subject used to read *"Your Scaling Up reports"*. Under the current gate a member can
> receive this before they have any, so the email names the portal rather than its contents.
- Closing: Didn't ask for this? You can ignore this email — the link expires on its own and
  nothing changes.

Carries the Scaling Up mark and nothing else. **No coach logo** — the member requested this from
the platform, not from their coach.

**Name the timezone.** Never a bare timestamp. Esperto prints `2026-09-29 15:39:13` with no zone
at all, and Jeff raised timezone handling as its own defect on the same call — shipping that bug
inside the feature that copies it would be absurd.

**Two lifetimes, one template.** A link the member requested themselves lasts **1 hour**; a link
a coach sent lasts **24 hours**. The duration is interpolated from the real expiry, never
hardcoded in the copy.

**One hour makes this line matter more than it did.** Under a 14-day link a vague expiry was
harmless. At one hour, a member who misreads it finds out by failing.

**Deliver the link as a button.** The raw URL must not also appear as bare text: Outlook
truncates bare-text URLs at the first space, and a hard-wrapping sender can split a long one
permanently.

---

## Coach surfaces

### Sending a report link

In the existing campaign detail screen. Two additions, no new page:

- **Bulk**, beside `Send Invitations` / `Send Reminders`: **Send report links**
- **Per person**, beside `Resend`: **Send report link**

Both target **everyone on the campaign**, finished or not — the gate is being in the system, and
a link is useful to someone who has not started, because it shows them their Evaluations.

> ⚠️ Revision 1 restricted both to people who had completed. That followed from the completion
> gate and is no longer correct.

Both send **the same email** as self-service — one template, three triggers. **The coach never
sees the link:** not displayed, not copyable, not returned to the browser. A coach who could read
it could open someone else's reports.

Coach-sent links last **24 hours**, not one — a one-hour link sent at 5pm is dead before anyone
reads their evening mail.

Confirmation is a **proper dialog, not a browser alert**: it states how many people will be
emailed *and* that the links expire in 24 hours. The two buttons beside it use the native
`confirm()`; this one diverges because it has a caveat people actually need to read.

### Campaign delete warning

> **Delete this campaign?**
> {N} invited and {M} completed participants will lose access — including the reports they can
> see today. Their responses stay in your records. This is not reversible.

Both halves stay: gone for the member, kept for the coach. Ships with or before the portal, never
after. The public-campaign dialog is a separate component and is unchanged.

### Member editor — two warnings

Both are inline notes, **not** validation errors. Both saves succeed.

**Level set without a team.** Setting a member to **Leadership team member** without putting them
in a team grants nothing — the rule falls through to own-reports-only. Four of the seven people
currently holding that level have no team, so this is the common case. A coach may legitimately
set the level before the team structure exists.

**A level the platform doesn't recognise.** Production contains levels outside the standard set —
`CEO` and `TEAM_MEMBER`. They grant nothing, deliberately: guessing what an unexplained label
means, in the direction of granting access, is the one mistake this design cannot take back. The
editor already shows the stored value; what was missing is telling the coach it is inert —
*this level isn't recognised and grants no additional access.*

---

## Forbidden visible copy

`campaign`, `respondent`, `submission`, `participant`, `accessMode`, `INVITED`, `PUBLIC`,
`isCEO`, `roleType`, `organizationId`, `templateAlias`, `versionId`, `deletedAt`, `token`, raw
IDs, and standalone assessment aliases.

A member has never heard of a campaign and did not "submit" anything — they took an assessment
and got a report. `magic link` is out: say **sign-in link**. `level` is fine in the coach UI and
out in the member UI.

---

## Visual contract

The quietest surface in the platform. It carries the Scaling Up mark, the shared palette and
type (`su-public-brand.css`), and none of the admin shell: no sidebar, no group navigation, no
counts, no status pills.

**Sign-in** is a single centred card on a plain ground — one field, one button, no sign-up, no
password affordance to explain away.

**Home** is two panels on the same ground, weighted equally. Nothing else competes.

**Reports** is a card grid: text-first cards, generous spacing, one action each.

**The card graphic is per instrument, not per report.** One static image for every Rockefeller
report, one for every LVA, and so on. Per-report thumbnails would need a rendering pipeline we do
not have, and the graphic's job here is scanning — telling a Rockefeller from an LVA at a glance
— which a per-instrument image does completely.

At 375 px everything reflows to one column with actions on their own line. Nothing clips or
overlaps.

---

## Acceptance notes

These are written as testable assertions deliberately.

- **Being in the system is the entry ticket.** A sign-in link is issued to any address with a
  live roster row. Completing an assessment is **not** required. Jeff, 2026-09-15: *"Whoever has
  an email in the system. So if a coach puts an email into the system, they would get access."*
- **No enumeration.** The sign-in response — wording, status code, and timing envelope — is
  identical for a known address, an unknown one, and a throttled request. Only the first causes
  an email. Esperto's equivalent returns three distinguishable answers; we do not copy that.
- **A GET never signs anyone in.** Opening the link does nothing until the button is clicked.
  Assert that a GET leaves the token unused.
- **Single use.** Redeeming consumes it. A second visit reaches Link-not-valid, including from
  the same browser.
- **Rate limiting.** Repeated requests for one address are throttled, and the member still sees
  Check your email. Throttling must not become an enumeration side channel.
- **The front door never probes the email.** No request on blur, on change, or on any path but
  the deliberate password submit.
- **Entitlement is recomputed on every report render**, server-side, from the member's live level
  and team. Never stored in the session, never cached in the browser. A live session proves only
  that *someone* signed in on this browser — never *what* they may open.
- **Nobody sees above themselves.** A department head never sees a CEO's report, even when the
  CEO is in their own team.
- **Unknown levels grant nothing.** An unrecognised level — including `CEO` and `TEAM_MEMBER` — a
  missing level, or Leadership team member with no team all fall through to own-reports-only.
  Nothing is aliased.
- **Continue mints nothing.** Entering an assessment from Evaluations leaves the invitation's
  token and expiry untouched, creates no token history, and moves no counter. The member's
  emailed link still works afterwards.
- **No JavaScript is required to sign in.**
- **Evaluations are own-only** at every level.
- **Email resolves to a set, never a row.** One address may map to several roster rows, with
  different levels in different companies. Entitlement is the union of each row's scope.
- **Deleted campaigns are invisible here** and cannot be opened. Coaches keep their access.
- **A coach-sent link is never disclosed to the coach.**
- **One door, two paths, never one identity.** A member session grants member access only; a
  staff account confers nothing here, and the reverse.
- **Shared devices.** Sign out ends the session immediately, and the signed-in member's name is
  visible so a second person can see whose session is open.
- **Narrow screens.** Nothing clips or overlaps at 375 px.

---

## Non-goals

- **Person-to-person report sharing** — Esperto's per-card Share, with expiry and
  viewonly/editor. Not requested.
- **A configurable access matrix** — Esperto lets an admin configure level × report type ×
  own/own-group/parent-group. Jeff described a behaviour, never a screen; we ship three fixed
  rules.
- **Parent-group visibility** — Esperto has the scope; Jeff said nobody sees above them.
- **Multiple CEOs per campaign** — Jeff's item #5, deferred by him.
- **Member-run campaign management** — Esperto members can add participants and change a
  campaign's expiry. Jeff asked for the close-date change as a *coach* capability.
- **A profile screen, in-portal help, passwords, self sign-up.**
- **Public quiz takers** — excluded by Jeff, 2026-09-15.

---

## Provenance

- Jeff's Slack request, 2026-09-15: token-based member login to a dashboard of reports.
- **The 2026-09-15 recording, watched directly 2026-09-18** — the source for the entry gate
  (05:09), the hierarchy (04:07), the home screen and reports grid (03:47, 05:05), and the pilot
  timeline (07:31). Revision 1 of this document was written from a summary of that call and got
  the gate and the access model wrong.
- The operator, 2026-09-18: Leadership team member **means department head**; bulk import
  deferred; production contains no real customer data.
- Direct study of the incumbent system, 2026-09-15/16 — recorded in the appendix of
  [`../../MEMBER_PORTAL_V1_SCOPE_AND_DELTAS.md`](../../MEMBER_PORTAL_V1_SCOPE_AND_DELTAS.md).
  ⚠️ That document's Delta 1 and its "no concept of level" claim are superseded by the design spec.
