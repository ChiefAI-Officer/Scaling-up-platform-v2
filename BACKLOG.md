# Scaling Up Platform — Backlog

> Remind Claude to read this at the start of each session.
> Updated: 2026-04-10

Legend: `[ ]` pending · `[x]` done · `bug` · `feature` · `question`

---

## Coach Portal

| # | Status | Type | Item | Plan |
|---|--------|------|------|------|
| CP-01 | `[ ]` | bug | **Validated column** visible on coach portal — should be hidden | — |
| CP-02 | `[x]` | bug | ~~Workshop denied but status shows "Info Requested"~~ | warm-prancing-panda |
| CP-03 | `[ ]` | bug | **Denial email subject** says "workshop changes requested" — should say "workshop denied" | — |
| CP-04 | `[x]` | bug | ~~Denial email says "resubmit" but portal had no resubmit button~~ | warm-prancing-panda |
| CP-05 | `[x]` | bug | ~~Status for denied workshop should show "Denied"~~ | warm-prancing-panda |
| CP-06 | `[ ]` | feature | **Approval pending status** — workshops not yet approved and no info requested should show "Awaiting Approval" (not blank/confusing) | — |
| CP-07 | `[ ]` | feature | **Back-and-forth thread** — info requested workshops should show full communication history on both coach + admin portal | — |
| CP-08 | `[ ]` | bug | **Bio page** — "Book a Call" checkbox exists but no URL field to enter the link value | — |
| CP-09 | `[ ]` | bug | **New workshop request** — time picker on event date/time field has no clock functionality | — |
| CP-10 | `[ ]` | feature | **Info requested** — coach should be able to edit ALL fields (including custom pricing) and resubmit | — |
| CP-11 | `[ ]` | bug | **Workshop submit errors** — page should scroll/focus to the error message | — |

---

## Admin Portal

| # | Status | Type | Item | Plan |
|---|--------|------|------|------|
| AP-01 | `[ ]` | feature | **Bio page → Coach record** — add button on bio edit page that navigates to that coach's record for certifications | — |
| AP-02 | `[ ]` | bug | **Landing page save 400 error** — registration page: saves as draft but ignores edits (Master Class repro) | — |
| AP-03 | `[ ]` | bug | **Thank you page save 400 error** — same as AP-02 | — |
| AP-04 | `[ ]` | bug | **Landing page editor** — after Save & Publish opens in new tab but edit page stays open; needs "Return to Workshop" button | — |
| AP-05 | `[ ]` | bug | **Admin workshop edit** — much of the edit form has been removed; admin should be able to edit every field | — |
| AP-06 | `[ ]` | feature | **Coupon codes** — admin should be able to add/edit coupon codes on any workshop at any time | — |
| AP-07 | `[x]` | bug | ~~Admins restricted by lead-time — can't create workshop on any date~~ | ethereal-floating-parnas |
| AP-08 | `[ ]` | question | **Date change → .ics / Google Meet** — if event date changes, does it send an update to attendees? | — |
| AP-09 | `[ ]` | feature | **Global registrants view** — all-time view of everyone who registered across all workshops (CRM-style, like Kajabi) | — |
| AP-10 | `[ ]` | bug | **Financial reporting incorrect** — numbers not calculating correctly (details TBD with Jeff) | — |
| AP-11 | `[ ]` | question | **Workflows/surveys/files untested** — need any-date workshop creation to test (AP-07 fix enables this) | — |
| AP-12 | `[ ]` | question | **Partner functionality untested** | — |
| AP-13 | `[ ]` | bug | **Vimeo on landing pages** — content blocked error, video renders above "what you'll walk away with" text, size too large | — |
| AP-14 | `[ ]` | bug | **Physical events** — landing page + registration page missing venue/address fields | — |

---

## Other Plans (queued, not started)

| Plan File | Topic | Ready? |
|-----------|-------|--------|
| velvet-snuggling-wave | Project file org + project-file-map skill | Yes |
| sharded-knitting-bubble | Fix /log-session skill (actual hours, no 20h cap) | Yes |
| whimsical-hugging-church | YouTube video deep understanding pipeline (CAIO) | Yes |
| magical-hugging-phoenix | Google Meet recording sync — n8n WF-11 (CAIO) | Blocked: credential fix needed |
| dynamic-forging-meadow | Fix Google Service Account in n8n (CAIO) | Yes (prereq for above) |

---

## Done This Week

| Date | Item |
|------|------|
| Apr 10 | CP-02, CP-04, CP-05 — DENIED workshop status full stack (warm-prancing-panda) |
| Apr 08 | Hour-interval scheduling for workflow editor |
| Apr 08 | Stripe PENDING registration unification |
| Apr 07 | Custom pricing counter-offer negotiation flow |
| Apr 05 | AP-07 — Admin lead-time bypass |
