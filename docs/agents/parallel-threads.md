# Working this repo alongside other agent threads

Several agent threads ship to `main` concurrently. This document exists because that fact
has repeatedly cost real work, and because the mechanisms that *look* like they prevent it
(per-thread memory, a handoff document, a plan file) demonstrably do not.

**The claim board is [issue #261](https://github.com/ChiefAI-Officer/Scaling-up-platform-v2/issues/261)** (pinned).
Claim a row there before you build it.

## Why per-thread state cannot solve this

Each thread keeps its own ledger of what is "primed next". On 2026-07-30 one thread's ledger
described Jeff #48 as primed and specified a label reword, while another thread was already
shipping it as respondent-pager grouping (PRs #251/#253). Both ledgers were internally
consistent. Neither could see the other.

The reword would also have been the **worse** answer: it would have touched the locked
`Q5a/Q5b/Q5c` Esperto crosswalk, which the grouping approach leaves alone. So the cost of
not coordinating is not only duplicated effort — it is sometimes shipping the inferior design
because you never saw the better one.

## Before you scope anything

```bash
git fetch origin main
gh pr list --state merged --limit 10        # has someone already shipped this?
head -60 plans/CHANGELOG.md                 # newest entries first
gh issue view 261                           # open claims
```

Then **re-check immediately before you start writing code**. `main` moved six times during a
single session; two planned items evaporated mid-task.

## Verify claims, in both directions

A CHANGELOG entry is evidence, not proof — and neither is your own suspicion that one is wrong.

- A claim that read like an overclaim ("this also closes GH #229") turned out to be
  **defensible** on inspection: #229 asked for parity with the invite-email path, and the fix
  delivers exactly that. Correcting it would have made the record worse.
- A claim that read as settled fact was **stale**: the Project Context table said "Wave OSR
  remains merged dark/default-OFF" while the CHANGELOG recorded the launch walk that disproved
  it.

When a claim is load-bearing for your work, check it against the database, the code, or the
deployment — not against another document.

## Rules

1. **Never merge a PR while its review loop is running.** PR #249 was merged 52 minutes before
   round 1's fixes existed. A squash-merged PR cannot be updated, so `main` briefly carried an
   overclaimed security note, a false code comment, and an untested guard; the corrections
   needed a whole second PR (#252). Green checks say nothing about prose — and across three
   consecutive waves, ~20 review findings produced **zero** runtime defects. Prose is the
   defect surface.
2. **Put the SoT update in the same PR as the code it describes.** Standalone SoT PRs keep
   colliding on `CLAUDE.md` and `plans/CHANGELOG.md`: #244 was discarded for this, and #247,
   #253/#254 and #259 all contended over the same two files. If you must ship SoT separately,
   insert your CHANGELOG entry *below* the newest one and leave the `LAST_UPDATED` anchor
   pointing at whatever is already there — that avoids anchor contention entirely.
3. **Verify the production deployment after every merge.** A green CI Build does not mean the
   deploy ran; see the Known Quirks bullet about the `git information` failure, which aborts
   before any build step and silently leaves the previous commit serving.
4. **Never `git add -A`** in the shared checkout, and treat other threads' branches and
   worktrees as untouchable. Use a worktree off `origin/main` for your own work.
5. **Commit early on a branch.** A scratchpad worktree was pruned mid-session and took an
   uncommitted edit with it.
