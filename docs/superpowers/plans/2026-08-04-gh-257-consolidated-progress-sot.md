# GH #257 Consolidated Progress SoT Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Update the canonical consolidated-progress ledger from eight to nine eligible outcomes by adding the verified GH #257 launch without rewriting historical ledger state.

**Architecture:** Add one newest-first reporting-ledger entry to `plans/CHANGELOG.md`, then advance the `CLAUDE.md` freshness anchor and brief summary to that entry. Preserve the existing eight-outcome entry unchanged as a historically accurate snapshot and use the existing changelog-freshness test as the mechanical consistency gate.

**Tech Stack:** Markdown, Git, Jest, GitHub pull requests.

## Global Constraints

- Documentation-only: no application code, schema, runtime configuration, rollout state, production data, or external report artifact changes.
- GH #257 counts exactly once as the ninth eligible reliability outcome.
- PR #297 is closeout evidence and does not count as an additional outcome.
- Describe GH #257 as deployed but default-off because `ASSESSMENT_EMAIL_DELIVERY_INTENTS_ENABLED` is absent.
- Do not claim a production audit, replay, backfill, payload reconstruction, manual database write, operator release/cancellation, or customer email send.
- Preserve unrelated workspace changes.

---

### Task 1: Record the nine-outcome consolidated progress ledger

**Files:**
- Modify: `plans/CHANGELOG.md`
- Modify: `CLAUDE.md`
- Test: `src/__tests__/lint/changelog-freshness.test.ts`

**Interfaces:**
- Consumes: the canonical GH #257 launch receipt at changelog slug `gh-257-outbox-reconciliation-launched-default-off`.
- Produces: new canonical slug `consolidated-progress-through-gh-257`, referenced by `CLAUDE.md`'s `LAST_UPDATED_SLUG`.

- [ ] **Step 1: Add the new consolidated ledger entry**

Insert the following entry immediately after the changelog preamble and before
the GH #257 launch receipt:

```markdown
<a id="consolidated-progress-through-gh-257"></a>
### 2026-08-04 — Consolidated progress ledger current through GH #257 <!-- ENTRY_ISO:2026-08-04 ENTRY_SLUG:consolidated-progress-through-gh-257 -->

**Status: REPORTING LEDGER UPDATED; no runtime change.** The hard cutoff remains the already-sent `output/pdf/Scaling-Up-Progress-Report-2026-07-27-to-2026-07-31.pdf`, which covers 33 merged pull requests through PR #267. The next consolidated report now has exactly **nine** eligible product or reliability outcomes:

1. **GH #222 — Welcome-screen question-bank accuracy** (PR #269): mixed respondent-visible banks use truthful format-aware wording while valid uniform slider banks retain their scale copy.
2. **GH #242 — retired pinned-edition warning** (PR #273): shared campaign detail shows the exact pinned edition and warns when it has been retired.
3. **GH #243 — campaign-list edition visibility** (PR #275): admin and Coach campaign lists show factual edition identity plus lifecycle-aware `Not latest` or `Retired` markers.
4. **GH #224 — truthful Welcome sharing disclosure** (PR #278): invited and public Welcome screens describe who can review named answers instead of promising unconditional confidentiality.
5. **GH #217 — legacy invitation fallback hardening** (PR #280): the dormant fallback renderer now carries Coach identity, a plain-text twin, and a bottom fallback URL without changing the active branded path.
6. **Jeff #65 — stable reminder links** (PR #282): original invitation links and successfully delivered bulk-reminder links remain valid for the same invitation lifecycle; the Production global flag is enabled and the kill switch remains off.
7. **GH #228 — Results report email branding** (PR #288): all three full-report email roles have Scaling Up-first chrome and trusted frozen Coach provenance, shipped behind absent default-off rollout variables.
8. **GH #220 — branded campaign invitation HTML composition** (PR #292): campaign-authored HTML can be sanitized and composed inside the shared branded invitation shell, shipped behind an absent default-off rollout variable while existing full-replacement behavior stays active.
9. **GH #257 — residual assessment-email outbox reconciliation** (PR #296): new invited submissions can durably preserve exact frozen email obligations and reconcile missed outbox creation through an event fast path plus bounded scan, with drift held for ADMIN/STAFF review and legacy candidates restricted to read-only audit; the capability is deployed behind an absent default-off rollout variable.

**Counting and rollout discipline.** Each implementation counts once. PRs #270, #274, #276, #279, #281, #283–#286, #289, #293, #297, and tracking corrections are source-of-truth, receipt, acceptance, or coordination evidence and do not add outcomes. GH #217's fallback remains dormant under the active branded renderer, while GH #228, GH #220, and GH #257 remain deployed but default-off; the consolidated report must not describe any of them as active customer-visible behavior. Documentation, design, deferral, claim management, and unmerged work remain excluded from the headline count.

**Closeout evidence.** All nine implementation PRs are merged and their exact production deployments were verified healthy. Their issues or source claims were closed or released as applicable, and their canonical launch records remain in this changelog. GH #257 implementation PR #296 merged as `613cb0cecc014ec767fafab82b13e393dc9740f6`; issue #257 is closed, its shared claim is released, and its Notion task is Done. Production has no `ASSESSMENT_EMAIL_DELIVERY_INTENTS_ENABLED` variable, so the new recovery path remains inactive. No production legacy audit, replay, backfill, payload reconstruction, manual database write, operator release/cancellation, or customer email send occurred.
```

- [ ] **Step 2: Advance the freshness anchor**

Replace the `CLAUDE.md` `Last Updated` row with:

```markdown
| **Last Updated** | <!-- LAST_UPDATED_ISO:2026-08-04 LAST_UPDATED_SLUG:consolidated-progress-through-gh-257 --> August 4, 2026 — **The consolidated progress ledger now records nine eligible outcomes through GH #257.** The prior eight-outcome ledger remains an unchanged historical snapshot. GH #257 counts once as a deployed, production-verified, default-off reliability outcome; docs-only closeout PR #297 is evidence rather than another outcome. Full detail in CHANGELOG entry `consolidated-progress-through-gh-257`. |
```

- [ ] **Step 3: Inspect the scoped diff**

Run:

```bash
git diff -- CLAUDE.md plans/CHANGELOG.md
```

Expected: one new changelog entry and one replaced `Last Updated` row; the
historical `consolidated-progress-through-gh-220` entry is unchanged.

- [ ] **Step 4: Run the freshness test**

Run from `src/`:

```bash
npx jest src/__tests__/lint/changelog-freshness.test.ts --runInBand
```

Expected: 1 suite and all four freshness tests pass.

- [ ] **Step 5: Run whitespace validation**

Run from repository root:

```bash
git diff --check
```

Expected: exit code 0 with no output.

- [ ] **Step 6: Commit the SoT update**

Run:

```bash
git add CLAUDE.md plans/CHANGELOG.md
git commit -m "docs(sot): include GH 257 in consolidated progress"
```

Expected: a second commit on `codex/257-consolidated-progress-sot`, following
the committed design document.

### Task 2: Publish and verify the documentation PR

**Files:**
- No additional repository files.

**Interfaces:**
- Consumes: the two reviewed commits on `codex/257-consolidated-progress-sot`.
- Produces: a protected GitHub pull request against `main`.

- [ ] **Step 1: Rebase-check against current main**

Run:

```bash
git fetch origin main
git merge-base --is-ancestor origin/main HEAD
```

Expected: exit code 0. If it fails, integrate current `origin/main`, re-run the
freshness test and `git diff --check`, and inspect the resulting scoped diff.

- [ ] **Step 2: Push the branch**

Run:

```bash
git push -u origin codex/257-consolidated-progress-sot
```

Expected: the remote branch is created or updated successfully.

- [ ] **Step 3: Open the docs-only PR**

Run:

```bash
gh pr create \
  --repo ChiefAI-Officer/Scaling-up-platform-v2 \
  --base main \
  --head codex/257-consolidated-progress-sot \
  --title "docs: include GH #257 in consolidated progress" \
  --body "Updates the designated consolidated-progress SoT from eight to nine eligible outcomes. GH #257 counts once as a deployed, production-verified, default-off reliability outcome; PR #297 remains closeout evidence. Historical ledger state is preserved. No runtime, configuration, production-data, replay, backfill, or customer-email operation."
```

Expected: a non-draft pull request URL.

- [ ] **Step 4: Verify the PR scope and gates**

Run:

```bash
gh pr view --repo ChiefAI-Officer/Scaling-up-platform-v2 \
  --json url,files,headRefOid,mergeable,mergeStateStatus,statusCheckRollup
```

Expected: only the design document, plan document, `CLAUDE.md`, and
`plans/CHANGELOG.md` appear; protected checks are visible and may initially be
pending.

- [ ] **Step 5: Complete protected review and merge**

Wait for Build, Migration Safety Gate, Assessment Email Lease (PostgreSQL),
Vercel, and Vercel Preview Comments to pass. Obtain the required independent
approval, then squash-merge without bypassing branch protection.

- [ ] **Step 6: Verify closeout**

Verify the merged PR state, exact merge SHA, main CI, production deployment, and
public health receipts. Update the existing GH #257 Notion task with the final
SoT PR receipt while keeping its status `Done`. Do not create another task.
