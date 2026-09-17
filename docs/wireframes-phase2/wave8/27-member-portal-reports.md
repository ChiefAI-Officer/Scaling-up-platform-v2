# 27 — Member portal: sign in and your reports

The platform's first surface built for people who are neither coaches nor admins.
A **member** is a person on an organization's roster who has completed at least one
invited assessment. They sign in with an emailed link — no password — and see the
reports that belong to them.

Scope is v1 as agreed with Jeff on 2026-09-16: **own reports, plus the team report
if they are the campaign's CEO.** Everything else is deliberately out (see Non-goals).

## How a member reaches this portal

Nothing in this journey is new until step 5. Steps 1–4 already exist and are
unchanged; they are written out because the portal is meaningless without them and
because step 5 is easy to confuse with step 2.

1. **A coach adds the person to a campaign.** Roster entry and campaign setup stay
   entirely with the coach. Nothing about this grants portal access.
2. **The coach's invitation email goes out** — "take this assessment" — carrying a
   durable link that resumes in place. This is the existing invitation, untouched.
3. **The person completes the assessment.** Their answers are saved as they go and
   the link resumes them if they stop.
4. **Their report is generated** as it is today.
5. **Later, and separately, they sign in to see it.** From a coach-sent link, from
   the link on their results page, or — failing both — from `/login`, where the
   member path sits beneath the staff form. They enter their email and receive a
   *different* email containing a sign-in link.

**Two emails, two jobs.** Step 2 says *take this*; step 5 says *see what you did*.
They are triggered by different people at different times — the coach sends the
first, the member requests the second — and they must not look like each other or
be confused in copy, subject lines, or support conversations.

There is no acceptance step, no registration page, and no password at any point.
**Completing an assessment is the acceptance.** Before step 3 a person cannot sign
in at all; after it, they can, for as long as their reports remain visible.

## Front door — `/login`, unchanged for staff

There is **one** sign-in address for the whole platform. `/login` keeps exactly what
it has today — email, password, Forgot password, "New coach? Create an account" —
and gains one member path beneath a divider:

- Heading: Taken an assessment?
- Body: We'll email you a link to your reports. No password needed.
- Action: Get a link to my reports → (goes to the member sign-in below)

**Nothing on this page probes the email.** The member path is a link the person
clicks deliberately, not a branch the server picks for them. That is what keeps the
page from revealing which addresses exist — the failure Esperto ships, where an
unknown address gets a red *"Login failed"* while a real one gets a password prompt.
Our existing "Invalid email or password" already avoids that, and this addition must
not undo it.

Why one door rather than a separate member address: a member's realistic route is a
coach-sent link or the link on their results page, both of which land them straight
in the portal without seeing a sign-in screen at all. The login page matters only
for someone who bookmarks the site or types the URL — and for them, one address that
works for everybody beats a second address nobody told them about.

The accepted cost is that a client who lands here sees a password field that is not
for them, against Jeff's "there's no username, no password, nothing". The divider and
the panel are what make the member path findable in spite of it.

## Member sign-in state

- Route: `/member/sign-in` — reached from the front door, not advertised separately
- Heading: Sign in to your reports
- **Audience line (directly beneath the heading):** For people who've completed a
  Scaling Up assessment.
- Guidance: Enter your email and we'll send you a secure link. There's no password
  to remember.
- Field: Email address
- Primary action: Email me a link
- Footer note: Links work once and expire after 14 days.
- **Escape hatch, persistent:** Coach or staff? Sign in with your password →

### Why the audience line and the escape hatch are load-bearing

Most people reach this screen by clicking through from the front door, so they have
already self-selected. But a bookmark or a forwarded URL can land someone here
directly, and coaches have reports too — "Sign in to your reports" disambiguates
nothing on its own.

The escape hatch is not politeness, it is the only recovery available. Because a
link is issued only to someone who has completed an assessment, and because the
response is deliberately identical either way, a coach who lands here types their
email, sees the Link-sent screen, and **no email ever arrives** — with nothing to
tell them why. The anti-enumeration rule is what removes our ability to correct
them afterwards, so the correction has to be on the page in advance.

**Three production accounts are both** (two coaches and one admin, all with
completed assessments). They are not an error state: both paths genuinely work for
them, and they pick whichever they want. What must never happen is a screen that
implies they have to choose correctly.

## How a member learns the portal exists

Access is self-service, but **discovery is not** — nothing tells a respondent this
portal is there. Esperto has the same hole; it was invisible in the recording only
because Jeff controlled the demo mailbox and could operate the respondent's sign-in
himself. A real respondent cannot be handed a link that way.

This matters more than it sounds. Of **25 live invited campaigns, 11 show the
respondent nothing at all after they submit** — no results email, no on-screen
report. For those, the portal is not a convenience for revisiting a report; it is
the first time that person ever sees their own result.

Three routes, all in v1:

1. **On the results page**, after submitting — a line pointing to the portal.
2. **In the results email**, where one is sent — the same line.
3. **From the coach** — the surface below, for the campaigns where neither of the
   above is switched on, and for the "I can't find my report" conversation.

Routes 1 and 2 cover only the campaigns that have those switches on (13 and 4
of 25 respectively today), which is exactly why route 3 is not a fallback.

## Coach surface — sending a report link

Lives in the existing campaign detail screen, in the admin shell. Two additions,
no new page:

- **Bulk**, beside the existing `Send Invitations` / `Send Reminders`:
  **Send report links** — emails everyone who has completed. This is the one a
  coach reaches for when a campaign wraps up.
- **Per person**, in the respondent row's action cluster beside `Resend`:
  **Send report link** — for a single follow-up.

Both appear **only for respondents who have completed**; there is nothing to sign
in to before that, and the row's existing `Resend` already covers the
not-yet-submitted case.

Both send **the same email** as the self-service sign-in — one template, three
triggers. A coach-sent link is a real, working sign-in link, not a pointer saying
"go to the portal and sign in": it lands in the respondent's own inbox, which is
exactly where a self-requested one would go, and it saves a pointless round-trip.
**The coach never sees the link.** It is not displayed, not copyable, and not
returned to the browser — the only copy goes to the respondent's address.

Confirmation copy follows the existing bulk-send pattern: state how many people
will be emailed, and name the action rather than the mechanism.

## The sign-in email

The only artifact of this design that leaves the platform, and the one a member
will look at hardest. It must be unmistakably distinct from the coach's invitation
email (see the journey above).

- Subject: Your Scaling Up reports
- Opening: Hi {first name},
- Body: Here's your link to the reports you've completed. It opens straight to
  them — there's no password to enter.
- Primary action: **View my reports**
- Fine print, directly beneath the button: This link works once and expires on
  {date} at {time} {timezone}.
- Closing note: Didn't ask for this? You can ignore this email — the link expires
  on its own and nothing changes.

Carries the Scaling Up mark and nothing else. No coach logo — the member did not
request this from their coach, they requested it from the platform.

**Name the timezone.** The expiry line states a zone explicitly rather than
printing a bare timestamp. Esperto's equivalent email prints
`2026-09-29 15:39:13` with no zone at all, which is the same defect as punch-list
item 1 arriving inside the feature we are copying. A member in Sydney reading a
US-time expiry has no way to know when their link dies.

## Link-sent state

- Heading: Check your email
- Body: If {email} is on file, we've just sent a sign-in link. It works once and
  expires in 14 days.
- Secondary action: Send another link
- **Escape hatch, repeated:** Coaches and staff sign in with a password instead →
- The body copy is identical whether or not the address exists. It must stay that
  way — see Acceptance notes.

The escape hatch repeats here deliberately. This is the screen a person stares at
when the email does not arrive, so it is the last place we can redirect someone who
came to the wrong door.

## Link-not-valid state

- Route: `/member/sign-in` with an exhausted, expired, or unrecognised token
- Heading: This link is no longer valid
- Body: Sign-in links work once and expire after 14 days. Request a new one and
  we'll email it to you.
- Primary action: Email me a new link

A single state covers used, expired, and unrecognised. Distinguishing them tells
the holder of a token slightly more than they need, and buys little: the recovery
action is the same in all three cases.

## Reports state

- Route: `/member/reports`
- Heading: Your reports
- Guidance: Reports from assessments you've completed.
- Per report: assessment name, the date it was completed, and a **View report**
  action.
- A team report carries a **Team report** marker; a personal report carries none.
- Sort: most recently completed first.
- Persistent action: Sign out.

One flat list, sorted by date. No grouping, no company column, no filters.

### Why no company grouping

Production shows four email addresses on more than one company's roster — but all
four are free-mail personas, and **none of the ten corporate addresses appears in
more than one company.** That is test data, not a business pattern. Esperto cannot
represent the case at all (its member record holds a single `company`), so it is
not a parity requirement either.

If a genuine multi-company member ever appears, this list still behaves correctly:
their reports simply sit together in date order. Adding a company line at that
point is trivial. Designing for it now would impose structure on every member to
serve none.

## Empty state

- Heading: No reports yet
- Body: When you complete an assessment, your report will appear here.

Rare by construction: a link is only issued to someone who has completed an
assessment, so the sole route here is a member whose reports have *all* since
landed on deleted campaigns. The copy must not imply the member did something
wrong, and must not hint that reports once existed and were removed.

## Report view

No new screen. **View report** opens the existing individual report at its current
route. The report renders exactly as it does for a coach or admin viewing the same
respondent — same renderer, same authored Welcome/Closing HTML, same print path.

## Forbidden visible copy

`campaign`, `respondent`, `submission`, `participant`, `accessMode`, `INVITED`,
`PUBLIC`, `isCEO`, `organizationId`, `templateAlias`, `versionId`, `deletedAt`,
`token`, raw IDs, and standalone assessment aliases.

A member has never heard of a campaign and did not "submit" anything. They took an
assessment and got a report. `magic link` is also out — say *sign-in link*.

## Visual contract

The member portal is the quietest surface in the platform. It carries the Scaling
Up mark and the shared palette and type, but none of the admin shell: no sidebar,
no group navigation, no counts, no status pills. A member arrives to do one thing
and leave.

Sign-in is a single centred card on a plain ground — one field, one button, no
secondary paths, no sign-up, no password affordance to explain away.

The reports list is a single column of restrained cards on the same ground. Each
card is text-first: assessment name, then date and company in the muted tone, then
the action. No thumbnails, no score previews, no badges beyond the Team report
marker. Nothing on this page competes with the report itself.

## Acceptance notes

- **A coach-sent link is never disclosed to the coach.** It is generated
  server-side and delivered only to the respondent's address — never rendered,
  returned, logged, or copyable. A coach who could read it could open someone
  else's reports, which is the whole point of the single-use token.
- **Coach-sent links obey every rule a self-requested one does** — single use,
  same expiry, same completion requirement. A coach cannot mint a link for someone
  who has not completed an assessment, and cannot extend one.
- **One door, two paths, never one identity.** `/login` is the single front door,
  but the two paths behind it stay separate sessions. A person may legitimately hold
  both — three do in production today — and taking the member path never touches
  their staff session, nor the reverse. A member session grants member access only:
  holding a staff account confers nothing here, and holding a member session confers
  nothing in the admin or coach surfaces.
- **The front door must never probe the email.** The member path is a link the
  person clicks, never a branch the server picks after inspecting the address.
  Deciding which path an address belongs to and showing that decision is precisely
  the enumeration answer we refuse to give — it is what makes Esperto's login return
  "Login failed" for an address it does not recognise. The existing "Invalid email or
  password" behaviour on the staff form stays exactly as it is.
- **Completion is the entry ticket.** A sign-in link is issued only to an address
  with at least one completed assessment on a live campaign. Being added to a
  roster grants nothing on its own — otherwise a coach adding a contact would
  silently create a portal account for someone who has done nothing. This follows
  Jeff's wording directly: *"Once a campaign recipient completes an assessment,
  they can now login."* There is no acceptance or activation step, and no password
  is ever set; the completed assessment is the acceptance.
- **No enumeration.** The sign-in response, its wording, its status code, and its
  timing are identical for a known and an unknown address — and identical again
  for a known address that has not completed anything. All three reach the
  Link-sent state; only the first causes an email. Esperto's equivalent endpoint
  returns three distinguishable answers for member, coach, and unknown; we do not
  copy that.
- **Rate limiting.** Repeated requests for the same address are throttled, and the
  Link-sent state is still what the member sees when throttled. Throttling must
  not become an enumeration side channel.
- **Single use.** Redeeming a link consumes it. A second visit to the same link
  reaches Link-not-valid, including from the same browser.
- **Ownership is re-verified on every report.** The session cannot be path-scoped
  the way the existing per-report cookie is, because the portal spans many reports.
  Every report render must therefore re-confirm server-side that the report belongs
  to the signed-in member. A live session proves only that *someone* signed in on
  this browser — never *whose* report is being requested. This is the ADR-0027
  failure repeating by a new route if it is skipped.
- **Email resolves to a set, never a row.** The schema permits one address to map
  to several roster rows — uniqueness is only `(organizationId, dedupeSource,
  dedupeValue)`. Today that happens solely to test personas, and the list needs no
  special treatment for it, but the resolver must still return a set and every
  access must check membership of it. Collapsing to "the first matching row" would
  serve one person another's report the day a real duplicate appears.
- **Deleted campaigns are invisible here.** Reports whose campaign has been deleted
  do not appear and cannot be opened, matching the existing respondent-facing rule.
  Coaches and admins keep their own access.
- **Shared devices.** Sign out ends the session immediately. The signed-in member's
  name is visible on the reports page so a second person on the same browser can
  see whose session is open.
- **Narrow screens.** The list reflows to a single column with the action on its
  own line. Nothing clips or overlaps at 375 px.

## Adjacent change — campaign delete confirmation

The existing invited-campaign delete dialog says *"{N} invited and {M} completed
participants will lose access. Responses are retained. This is not reversible."*

Once this portal exists, "lose access" silently acquires a second meaning: the
member's finished reports disappear from their dashboard. Jeff asked on 2026-09-16
that the warning say so. Revised direction:

> **Delete this campaign?**
> {N} invited and {M} completed participants will lose access — including the
> reports they can see today. Their responses stay in your records. This is not
> reversible.

Both halves must stay: gone for the member, kept for the coach. This copy ships
**with or before** the portal, never after — otherwise there is a window in which
coaches delete campaigns under the old meaning and silently empty members'
dashboards.

The public-campaign delete dialog is a separate component and is unchanged. Public
quiz takers are not members and never reach this portal.

## Non-goals

Deliberately excluded from v1, each with its reason:

- **An Evaluations tab** (unfinished assessments). Members already get a durable
  emailed link that resumes in place; Jeff's view was that routing them through a
  portal login instead "seems like the long way".
- **The per-level access matrix.** Esperto lets an admin configure, per member
  level and per report type, what is visible across own / own-group / parent-group
  scopes. Jeff chose the smaller v1 and asked that the gap be documented.
- **Person-to-person report sharing.** Esperto supports it with an expiry and
  viewonly/editor access types. Not requested.
- **Multiple CEOs per campaign.** Currently prevented by a database constraint.
  Tied to the matrix gap above.
- **Member-run campaign management.** Esperto's portal lets a member add
  participants to a campaign, see how many responses have arrived, and change the
  campaign's expiration date. It is the largest thing their portal does that ours
  will not. Nobody has asked for it, and it needs a product decision — whether
  coaches currently rely on clients to chase their own teams — before it is worth
  sizing. See Delta 4 in the scope-and-deltas document.
- **A profile screen or in-portal help.** Member details stay coach-maintained;
  Esperto's FAQ/Videos/Links/feedback panel has no equivalent here.
- **Public quiz takers.** Excluded by Jeff on the 2026-09-15 call.

## Provenance

- Jeff's Slack request, 2026-09-15: token-based member login to a dashboard of
  completed reports.
- Recorded walkthrough of the incumbent system, 2026-09-15 — the source for the
  sign-in page, portal home, and reports list.
- Jeff's v1 scope decision and the delete-warning request, 2026-09-16.
- Direct study of the incumbent system, 2026-09-15/16 — its live API, its Angular
  bundles, and its published UI string tables. This is where the journey above, the
  two-email distinction, and the member-run campaign capability came from; none of
  it was visible in the recording. Recorded in full in the appendix of
  `docs/MEMBER_PORTAL_V1_SCOPE_AND_DELTAS.md`.

The scope-and-deltas document is the source of truth for everything this wireframe
deliberately leaves out. Keep the two in step: a Non-goal here should have a Delta
there.
