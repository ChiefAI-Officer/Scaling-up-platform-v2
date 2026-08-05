# Handoff — Jeff's July-10 assessment-feedback tracker (Codex session thread)

**Written:** 2026-08-05
**Base at time of writing:** `origin/main` @ `15ee442b`
**Source document:** Jeff Verdun's 14-page *"Scaling Up Assessment Platform — Feedback Report for Gabriel, prepared 2026-07-10"* (53 rows, `#30`–`#87`)
**Audience:** a Codex session thread that will work this tracker to completion

> **This handoff changes how the work is done, not just what is next.** The instruction from the
> project owner is explicit: **do not squash the remaining rows into one pass.** One row, one PR, one
> source-of-truth entry. Simplest possible fix per row. Anything needing Jeff's *explicit* input gets
> deferred to a known store rather than guessed at. Read §1 and §6 before touching code.

---

## 0. TL;DR — the three things that will otherwise waste your first hours

1. **Most "open" rows are already shipped.** Jeff wrote this tracker on 2026-07-10 describing a
   platform state from *before* several waves landed. Independently code-verified as **already
   shipped before he wrote the row**: `#35` (Wave H, 2026-06-26), `#46` (Wave Q #1, 2026-07-03),
   `#49` (Wave R, 2026-07-04), `#51` (Wave Q #6), `#52` (Wave Q #7, ADR-0018), `#37` (Wave ED10) —
   joining `#40` and `#43`, already documented as re-reports. **Your first action on any row is a
   state-check, never a build.**
2. **The complete record of what Jeff still owes us lives in an UNTRACKED file that is one cleanup
   away from deletion.** See §2. Promoting it is the highest-value thing you can do in your first
   hour, and it is nearly free.
3. **`main` moves under you.** Several threads merge concurrently. During the session that produced
   this handoff, GH #222 was scoped, designed, spec'd and committed — and had **already been merged
   by another thread five days earlier**. Re-fetch before scoping *and* again before building. §7.

---

## 1. Source document facts you must not re-derive

The text extraction is at **`tmp/pdfs/jeff-jul10-review/report.txt`** (669 lines). A second
extraction exists at `tmp/pdfs/july10-audit/report.txt`. Jeff's original PDF is at
`~/Downloads/Scaling-Up-Assessment-Feedback-Report-2026-07-10.pdf`.

- **53 distinct rows**, numbered `#30`–`#87`.
- **`#31`, `#34`, `#36`, `#38`, `#82` do not exist in the document.** Section 2's own preamble
  explains why: *"Completed items are excluded."* Their absence is not an extraction failure.
- 🔴 **GREP TRAP — a naive row grep returns 52, not 53.** `grep -oE '^ *#[0-9]+'` **misses `#57`**
  ("LVA – Peer Averages", around line 422): it sits immediately after a Status line on a page-break
  boundary with a non-matching leading character. Rows `#57`, `#62`, `#69`, `#77` all sit on such
  boundaries; only `#57` vanishes entirely. **If your row count is 52, you have lost `#57`.**
- The document has **two sections** and most rows appear **twice** — Section 1 "Latest Feedback"
  (30 rows) and Section 2 "All Open Items (Full List)" (all 53). Status lines are byte-identical
  where both exist. **Use the Section-2 instance as canonical** and deduplicate by row number.
- **Every row carries Jeff's own `Status:` line.** That line, not our judgement, is the deferral
  discriminator. See §6.

### Classification of all 53 rows by Jeff's own status wording

| Class | Count | Rows |
|---|---|---|
| **needs-jeff-explicit** | 22 | `#30` `#32` `#33` `#39` `#41` `#42` `#44` `#45` `#47` `#57` `#58` `#65` `#68` `#71` `#72` `#74` `#75` `#78` `#83` `#84` `#85` `#87` |
| **buildable, spec-complete** | 30 | `#35` `#37` `#40` `#43` `#46` `#48` `#49` `#51` `#52` `#53` `#54` `#55` `#56` `#59` `#60` `#61` `#62` `#63` `#64` `#66` `#67` `#69` `#70` `#73` `#76` `#77` `#79` `#80` `#81` `#86` |
| shipped per Jeff's own status | 1 | `#50` |

⚠️ **"buildable" means the row contains a complete instruction — NOT that it is unbuilt.** Many of
those 30 are already live (see §0.1 and §3). The class answers *"could this be built without asking
Jeff?"*, not *"does it still need building?"*

⚠️ Several rows in the **needs-jeff-explicit** column have since **shipped anyway**, because the
blocking question turned out to be answerable from the Esperto source or from code — `#71`
(on-screen results), `#83` (Coach Referred Results), `#85`, `#65` (shipped as PR **#282**). A row
being in that column is a *reason to check before building*, not a permanent veto.

---

## 2. 🔑 The deferred-items store — the path you asked for

**There is no single store, and that is the finding.** Arithmetic proves it: the tracker has **12
open non-DONE rows**, and the tracked repo SoT names exactly **one** of them (`#33`). The other 11
exist only in untracked scratch and thread-local files.

**Three stores together hold it. All three paths:**

### (a) THE DATA — complete, per-row, machine-readable, and UNTRACKED
```
tmp/pdfs/add_feedback_status_badges.py        →  the STATUS = { ... } dict, lines 33-86
```
A per-row dict covering **all 53 rows**, dated *"STATUS UPDATED 31 JUL 2026"* (line 201), with a
one-line reason each. Tallies: **41 DONE · 8 NEEDS INPUT · 4 PARTIAL**.

- **8 NEEDS INPUT** — `#32` (benchmark scope + trusted data source) · `#33` (report-by-report
  comparison notes) · `#41` (what the question is intended to measure) · `#42` (meaning of "Growth
  Financing") · `#44` (whether two questions combine) · `#45` (Suzanne must identify the wording
  concern) · `#65` (**since shipped — PR #282**) · `#84` (desired SunHub quiz scope)
- **4 PARTIAL** — `#47` (final QSP body copy still needed) · `#57` (real LVA peer-average values) ·
  `#58` (depends on `#57`'s values) · `#75` (Five Dysfunctions guidance text)

🔴 **This file is untracked, sits in `tmp/`, and is NOT gitignored** — `git check-ignore tmp output
reports` returns nothing, meaning they are neither tracked nor ignored. That is precisely the
profile the `workspace-cleanup` skill deletes. **Losing `tmp/` destroys the only complete record of
what Jeff still owes us.** Worse, the *tracked* SoT depends on it: `plans/CHANGELOG.md` (the `#33`
deferral entry) justifies itself with *"The latest status overlay likewise marks the item NEEDS
INPUT"* — an overlay generated by this untracked script.

### (b) THE DURABLE HOME — tracked, auto-loaded, correctly titled, nearly empty
```
CLAUDE.md  →  section "**Open follow-ons (deferred for Beta hardening or external input):**"
              (origin/main lines 55-73, 18 bullets)
```
The only candidate that is git-tracked, on `origin/main`, auto-loaded into every agent session, and
already titled for this purpose. But of its 18 bullets only **5** are external-input-blocked (`#33`;
`ENH-MAY6-6` "needs Jeff"; `ENH-MAY6-11` "needs product call"; `Q-MAY6-1`/`Q-MAY6-2`; the
`STRIPE_WEBHOOK_SECRET` rotation "pending Josh's authenticator"). The other 13 are internal
engineering debt. **The section conflates two different kinds of "deferred", which is part of why
the July-10 rows never landed in it.**

### (c) THE WHY + RESUME GATE
```
plans/CHANGELOG.md  →  deferral-disposition entries
                       canonical example: ENTRY_SLUG:jeff-33-report-fidelity-deferred
                       (origin/main lines 398-406)
```
Marked *"Status: DEFERRED / NEEDS INPUT — reporting disposition only"*, with a **Resume gate**
naming Jeff/Suzanne and an explicit boundary (*"Report work already shipped … does not close this
umbrella acceptance item"*). This is the only store that records **why** something is deferred and
**what unblocks it** — the two facts a future thread actually needs.

### Two more places deferrals hide (do not rely on either)
- **GH issue #261** (the pinned claim board) records exactly one: `RELEASED / DEFERRED: **Jeff #47**
  — 2026-07-31T02:18Z`. Not enumerable — a deferral looks identical to a completed claim, so you
  must read all comments to find it.
- **GitHub Issues *drains* Jeff-blocked work rather than holding it.** Zero open issues are July-10
  rows. Jeff-blocked ones filed there were **closed, not parked** — `#223` was closed 2026-07-30
  *"by product decision from the July-10 closeout"*, and `#217` `#220` `#222` `#224` `#228` `#229`
  `#233` are all closed. The `needs-info` and `ready-for-human` labels exist
  (`docs/agents/triage-labels.md:19,21`) and are **unused for Jeff blocks**.

### ✅ Recommended first action (cheap, high value)
Promote the 11 missing rows into **CLAUDE.md's "Open follow-ons"** section, split it into two
subsections — *Blocked on Jeff/Suzanne (external input)* vs *Internal engineering debt* — and give
each Jeff-blocked row the one-line **resume gate** (what exact input unblocks it). Then the untracked
`tmp/` script stops being load-bearing. Do this as its own small PR before any row work.

---

## 3. Where progress is documented, and the hard cutoff for the next report

### The last report — this is the cutoff
```
output/pdf/Scaling-Up-Progress-Report-2026-07-27-to-2026-07-31.pdf     ← SENT 2026-07-31
output/docx/Scaling-Up-Progress-Report-2026-07-27-to-2026-07-31.docx   ← editable source
tmp/pdfs/client-progress-comparison/jul31-sent.txt                     ← fastest way to read what was sent
```
It covers **33 merged PRs** (16 implementation/test, 17 records/corrections) across ten outcomes:
invitation emails (`#69`/`#76`/`#80`), Welcome-screen wording (`#62`/`#66`/`#70`/`#77`), report Coach
byline (`#63`/`#67`/`#73`/`#78`/`#81`), on-screen results (`#71` + `#229`), QSP story entry (`#48`),
Print/Download (`#64`/issue `#238`), Coach Referred Results (`#83`), campaign edition visibility
(Wave EV), respondent-removal message (`#59`), email/outbox reliability (`#250`, `#263`–`#265`).

🔴 **Everything in that report is already reported. The next report contains ONLY work merged from
2026-07-31 onward.** Read `jul31-sent.txt` before drafting anything client-facing.

### The per-row status overlay
```
output/pdf/Scaling-Up-Assessment-Feedback-Report-2026-07-10-STATUS.pdf
```
Jeff's own 14-page tracker with a DONE / PARTIAL / NEEDS INPUT badge stamped on every row. Built by
the untracked `tmp/pdfs/add_feedback_status_badges.py` (§2a). **No send record found in the
CHANGELOG** — treat it as built-but-possibly-unsent.

### The SoT write protocol — mandatory after every prod push
Three places state it and they agree: **`CLAUDE.md` §"Continuous Update Protocol"**,
**`plans/CHANGELOG.md` header (lines 1-6)**, and **`AGENTS.md` §Golden Rules**:

> Append full implementation detail to `plans/CHANGELOG.md` (newest first, with the HTML-comment
> anchor `<!-- ENTRY_ISO:YYYY-MM-DD ENTRY_SLUG:kebab-slug -->`); update **only** the
> `LAST_UPDATED_ISO`/`LAST_UPDATED_SLUG` anchor + brief prose in CLAUDE.md's Project Context table.

**Enforced by a test:** `src/src/__tests__/lint/changelog-freshness.test.ts` — suite *"CLAUDE.md /
plans/CHANGELOG.md freshness + size budget"*. It will fail your PR if you skip this.

**Anti-contention pattern:** when another thread may be editing the anchor, insert your entry *below*
the newest one so the anchor stays put. Precedent: PR #262. This means **file order ≠ date order** in
places — do not assume the top entry is the newest work.

### How reports are physically built
No committed npm/script target exists; report production is **ad-hoc and has changed generation
twice**.
- **Gen 1** (Jul 1 – Jul 23): hand-authored HTML → base64-inlined single file at repo root →
  headless-Chrome print-to-PDF. Example source: `report-2026-07-22/report.src.html` + sibling PNGs.
  Style copied verbatim from the prior report.
- **Gen 2** (the Jul-31 report): `tmp/pdfs/july27-progress-source/build_progress_report.py` (911
  lines, python-docx → LibreOffice PDF) plus `make_progress_assets.py` (pdfplumber + Pillow — crops
  Jeff's own per-row cards out of his PDF and renders the ten before/after composites).
  Assets: `tmp/pdfs/july27-progress-source/assets/` and `current-assets/`.
- Each Gen-1 report shipped a companion `-talk-track.md` at repo root (narration + a *"Fact-check
  anchors"* section).

⚠️ **All report tooling is in untracked `tmp/`, same fragility as §2a.**

---

## 4. Per-row code verification already done (do not repeat)

Nine targets were verified against `origin/main` with `file:line` evidence. **All nine came back
already-shipped or partially-shipped. Zero were genuinely open.**

| Row | Verdict | Smallest closing action |
|---|---|---|
| `#35` Admin Navigation | already-shipped (Wave H, 2026-06-26) | Bookkeeping + one live screenshot of the grouped top bar |
| `#37` Results Email editable when published | already-shipped (Wave ED10) | Confirm ED10/ED9/ED6 flags on, then open a published template → Settings → Results email |
| `#46` Template-level results default | already-shipped (Wave Q #1, `3b9b72ae`, PR #125) | Zero code — status correction only |
| `#49` Printable free-form fields | already-shipped (Wave R, PR #129) | Regenerate one LVA + one QSP-v2 PDF and look |
| `#51` Disable a template | already-shipped (Wave Q #6) — **exercised in prod on QSP V1** | One admin click if a template still needs retiring |
| `#52` Remove an admin | already-shipped (Wave Q #7, ADR-0018) | 60-second live check at `/admin/settings` |
| GH `#222` Welcome stat chip | **partially-shipped** | `deriveTimeEstimate` is still count-only — LVA estimates ~35 min for 40 typed answers. Genuine residual. |
| GH `#224` "Honest & confidential" | already-shipped | Leave closed. An email-side residual should be a **new** issue. |
| GH `#242` Archived-edition warning | already-shipped (PR #273, `54d0c215`) | Nothing |

**The pattern is the lesson:** on this tracker, the prior probability that a row is already done is
high. Budget your time for *verification*, not implementation, and let the verification decide.

---

## 5. Verified current state as of `15ee442b` — read before scoping

```bash
git fetch origin main && git log origin/main --oneline -15
gh pr list --state merged --limit 20
gh issue view 261                      # the claim board — check for live claims
head -60 plans/CHANGELOG.md            # newest entries (mind the anti-contention ordering)
```

Recently merged beyond the Jul-31 report's window (i.e. **eligible for the next report**):
`b350ff22` GH #222 welcome scale claims · `0f9cbebc` #222 SoT closeout · `e66c85ee` (#278) welcome
sharing disclosure · `54d0c215` (#273) retired-edition warning · PR **#282** (Jeff `#65`) ·
`15ee442b` (#301) GH #233 closeout.

**Only 6 open GitHub issues:** `#295` (JV-23 email tracking), `#261` (claim board), `#256`
(coach-logo host policy), `#40` (scrub PII from `From Jeff/` git history), `#11`, `#10`.

---

## 6. The operating protocol for this thread

### 6.1 One row at a time. Do not squash.
**Unit of work = one tracker row → one branch → one PR → one CHANGELOG entry.**

Group rows **only when the code forces it**, and say so explicitly. The precedent both ways:
- ✅ **Legitimate grouping:** `#63`/`#67`/`#73`/`#78`/`#81` shipped as ONE change because all three
  renderers emit structurally identical brandbar markup and no selector can scope it to one alias —
  splitting would have produced four empty diffs.
- ❌ **Grouping that hid problems:** the `#62`/`#66`/`#70`/`#77` welcome-copy batch shipped with
  `#70` **missing a clause** that had to be routed to Jeff separately, and `#76`'s QSP half turned
  out to be a **no-op by diagnosis**. Convenience grouping made a four-row claim that was really
  two-and-a-half rows.

**Why it matters beyond tidiness:** a squashed pass cannot produce an honest progress report. The
report is per-row; if the work isn't per-row, every status line becomes a guess.

### 6.2 Simplicity is the explicit bar
Owner's instruction: *"I want all iterations and fixes to be simple as possible."* Concretely:

- Smallest change that closes the row. No new abstraction unless the change is impossible without one.
- **No feature flag** unless the change is genuinely risky or needs a dark launch. Most copy and
  correctness fixes are flagless; rollback is `git revert`.
- **No migration** unless unavoidable.
- **No ADR** unless it clears all three bars — hard to reverse **and** surprising **and** a real
  trade-off. Precedent: the `#63` byline work declined an ADR because rollback was a plain revert;
  amend the relevant `docs/specs/` section instead.
- Prefer making a **type honest** over adding a check — an optional/loose type is what let
  `templateAlias` go missing silently (Wave OSR F4). A `string | null` makes the compiler find every
  consumer.

### 6.3 Defer on Jeff's EXPLICIT words — and know when this rule loses
**Defer** when the row's own `Status:` line asks for a conversation, confirmation or decision, or
when the ask needs content only Jeff/Suzanne can supply (benchmark values, wording he hasn't
written, product intent). Type case — `#65`, titled *"(Design Question)"*:

> *"needs a conversation with Gabriel on intended behavior, not just a straight bug report"*

**Build** when he supplied a complete instruction. Type case — `#66`, which gives the exact
replacement paragraph verbatim.

⚠️ **This rule is in direct tension with the standing guidance not to over-defer to Jeff, so here is
the tie-break:** default to making a defensible call from the Esperto source and shipping. Escalate
to deferral **only** when (a) Jeff's own status line asks for the conversation, **or** (b) the
missing input is *content or values* we cannot author (numbers, his wording, a scope only he knows),
**or** (c) the change touches credential handling, money, or an unauthenticated surface. Everything
else: decide, document the assumption in the CHANGELOG entry, ship.

Note `#65` *did* eventually ship (PR #282) despite being a deferral candidate — deferral is a
holding state pending a decision, not a verdict that the work is impossible.

### 6.4 Every deferral must be written down in two places
1. A bullet under **CLAUDE.md → "Open follow-ons"** with its **resume gate** (the exact input that
   unblocks it).
2. A **`plans/CHANGELOG.md` deferral-disposition entry** recording *why* and *what unblocks*, modelled
   on `ENTRY_SLUG:jeff-33-report-fidelity-deferred`.

A deferral that exists only as a released claim on #261, or only in `tmp/`, **is lost**.

### 6.5 Claim before you build — and state-check before you claim
Post to **GH #261**: `CLAIM: <row> — <branch> — <UTC timestamp>`, released by editing to
`DONE:`/`DROPPED:` with the PR number.

🔴 **A claim does not protect you from a row that is already merged.** In the session that produced
this handoff, GH #222 was claimed on 2026-08-05 and had been merged 2026-07-31 — the whole design was
discarded. **Before claiming, run all three:** `gh issue view <n>` (is it CLOSED?),
`git log origin/main --oneline | grep -i <keyword>`, and a `plans/CHANGELOG.md` grep.

### 6.6 Verify prose at least as hard as code
Across three consecutive waves this project produced ~20 review findings and **zero** runtime
defects — every real defect was in the *story about* the code: stale counts, citation drift,
overclaims. Specific rules earned the hard way:
- **Never justify code with a prod-data claim in a source comment** — it is unfalsifiable. Verify it,
  then move the fact into an ADR with its date.
- **Line numbers belong in code comments, never in `docs/adr/`.**
- **Jest-verify every test count** from jest's own summary line. Never write one from memory.
- **Mutation-test every new guard:** delete it, confirm exactly the intended test fails. Guards have
  shipped vacuous here.

---

## 7. Operational traps that have each cost a session real time

- **`main` moves under you.** Re-fetch before scoping **and again before building** —
  `docs/agents/parallel-threads.md` is the full protocol. During this handoff's session `main` moved
  32 commits and one planned item was shipped by another thread mid-task.
- **CI does not fire on PR *creation*.** Push → create PR → push again (an `--amend --no-edit` +
  force-push works) or the required Build / Migration Safety checks never start.
- **Branch protection requires an up-to-date branch.** Expect `BEHIND`. When your base was already
  squash-merged, rebase with `git rebase --onto origin/main <old-base>`.
- 🔴 **`src/.env`'s `DATABASE_URL` points at PRODUCTION** while `APP_URL` is localhost. There is no
  isolated database — **running the app locally writes to prod.** Read-only queries via
  `npx tsx --env-file=.env ./.tmp-x.ts` from `src/` (the script must live inside `src/`).
- **Worktrees:** symlinking `node_modules` from the main checkout breaks
  `CI=true npx next build --turbopack` (`Symlink node_modules is invalid, it points out of the
  filesystem root`). A real `npm ci` is required for the build gate — though a symlink is fine for a
  plain `tsx` script.
- **The shared checkout is not a workspace.** It sits on `codex/public-leads-email-delivery`, is ~52
  commits behind `origin/main`, has permanently-dirty files (`AGENTS.md`, two `.claude/claudex/log`),
  and **`docs/agents/parallel-threads.md` does not exist on that branch at all.** Never
  `git add -A`; always work in a worktree off `origin/main`.
- 🔴 **A prod flag typed `sensitive` reads back EMPTY, and that is NOT proof it is off.** 8 of 29
  prod `WAVE_*` vars are `sensitive`. `decrypt=true` returns ciphertext on this plan. **The only
  reliable check is a live in-app sighting** — "I saw it render" beats "the flag reads empty."
- 🔴 **Never grep seed files to establish a question bank's composition.** These seeds generate
  questions programmatically: a literal `type: "TEXT"` grep finds **26** in the LVA seed, which
  actually builds **40**. Call the exported `build*Content()` functions in `src/prisma/seed-*.ts`
  instead — they are pure and need no DB.
- **The full-suite failure count is not stable.** Identical code has measured 9, 11 and 14 failing
  suites. **Prove a failure foreign by mechanism** (no failing suite imports a changed module; jest
  runs via `next/jest`/SWC with no typecheck), never by count.
- **A mocked Prisma cannot witness database behaviour** — it has no transaction state. Use the real
  PostgreSQL integration lane (precedent: PR #263).
- **Never merge a PR while its review loop is running.** PR #249 merged 52 minutes before its fixes
  existed; the corrections needed an entire second PR.

---

## 8. Suggested first three actions

1. **Promote the deferred store** (§2, "Recommended first action"). Small PR, removes the single
   biggest fragility, makes every later deferral durable. Do this first.
2. **Reconcile the tracker against `origin/main`** and record the result *in the repo* — a tracked
   per-row table replacing the untracked `tmp/` dict. Expect many of the 30 "buildable" rows to
   close as already-shipped (§4 closed 8 of 9 that way).
3. **Then, and only then, pick one row.** State-check it, claim it on #261, build the simplest fix,
   PR it, review-loop it, merge it, write its CHANGELOG entry, release the claim. Full stop. Next row
   is a new cycle.

**Definition of done for a row:** merged + `plans/CHANGELOG.md` entry + `CLAUDE.md` anchor bumped +
claim released on #261. A row without a CHANGELOG entry did not happen, because the next progress
report is generated from the CHANGELOG.

---

## 9. Known-good reference points

| What | Where |
|---|---|
| Jeff's tracker (text) | `tmp/pdfs/jeff-jul10-review/report.txt` · `tmp/pdfs/july10-audit/report.txt` |
| Jeff's tracker (PDF) | `~/Downloads/Scaling-Up-Assessment-Feedback-Report-2026-07-10.pdf` |
| Per-row status dict (untracked) | `tmp/pdfs/add_feedback_status_badges.py:33-86` |
| Status overlay PDF | `output/pdf/Scaling-Up-Assessment-Feedback-Report-2026-07-10-STATUS.pdf` |
| Last sent progress report | `output/pdf/Scaling-Up-Progress-Report-2026-07-27-to-2026-07-31.pdf` |
| Fast read of what was sent | `tmp/pdfs/client-progress-comparison/jul31-sent.txt` |
| Report builders | `tmp/pdfs/july27-progress-source/build_progress_report.py` · `make_progress_assets.py` |
| Deferred (durable) | `CLAUDE.md` → "Open follow-ons (deferred for Beta hardening or external input)" |
| Deferral rationale + resume gates | `plans/CHANGELOG.md` → `ENTRY_SLUG:jeff-33-report-fidelity-deferred` |
| Claim board | GH issue **#261** |
| Domain glossary | `CONTEXT.md` (translate Jeff's "intro card"/"landing card" → **Welcome screen**) |
| Decision records | `docs/adr/` (ADR-0001 … ADR-0031) |
| Cross-thread protocol | `docs/agents/parallel-threads.md` (**exists on `origin/main` only**) |
| SoT freshness test | `src/src/__tests__/lint/changelog-freshness.test.ts` |

---

## 10. Provenance and limits of this handoff

Produced by a 13-agent research pass on 2026-08-05 against `origin/main` @ `15ee442b`. The row
inventory was read from the full text extraction; the "already shipped" verdicts in §4 carry
`file:line` evidence; the deferred-store arithmetic was checked against all five candidate stores.

**Known limits — do not present these as verified:**
- The **completeness critic stage did not run** (session usage limit). This handoff has not been
  adversarially reviewed end to end.
- **Row classifications in §1 are derived from Jeff's status wording, not from code.** They tell you
  whether he asked for a conversation — not whether the work exists. §4 is the code-verified layer,
  and it covers only 9 targets.
- The **21 rows not in §4 have not been code-verified in this pass.** Given §4's 8-of-9 hit rate for
  "already shipped", assume nothing about them until checked.
- One verification subagent (`verify:GH #242`) ran without its safety classifier available; its
  conclusion (already-shipped via PR #273) is independently corroborated by the closed issue and the
  merge commit, but treat other detail from it with care.
