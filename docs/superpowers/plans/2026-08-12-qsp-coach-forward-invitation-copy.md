# QSP Coach-Forward Invitation Copy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give QSP v1 and QSP v2 the same coach-forward canonical invitation body while preserving their version-specific names and the universal email shell.

**Architecture:** The assessment template seed remains the factory-default source; no renderer or schema changes are needed. A single focused regression suite imports both real QSP seed builders and asserts the recipient-visible body contract. Existing Production rows remain a separate canonical-editor operation because a code deploy does not rewrite template data.

**Tech Stack:** TypeScript, Prisma seed builders, Jest, Next.js/Turbopack

## Global Constraints

- Exact opening sentence: `You've been invited by {{coachName}} to complete the {{templateName}} for {{organizationName}}.`
- Preserve subject: `Please complete your Quarterly Session Prep`.
- Preserve QSP aliases, questions, scoring, reports, and version-specific names.
- Preserve the universal banner, Coach byline, CTA, fallback link, and footer.
- Preserve campaign-level invitation overrides.
- No Production write or customer email occurs during code implementation.

---

### Task 1: Pin both QSP canonical invitation bodies

**Files:**
- Create: `src/src/__tests__/seed/qsp-invitation-copy.test.ts`
- Modify: `src/prisma/seed-qsp-v1-assessment.ts`
- Modify: `src/prisma/seed-qsp-v2-assessment.ts`
- Delete: `src/src/__tests__/seed/qsp-v2-invitation-copy.test.ts`

**Interfaces:**
- Consumes: `buildQspV1Content()` and `buildQspV2Content()`.
- Produces: both builders return the approved coach-forward `invitationBodyMarkdown` and unchanged `invitationSubject`.

- [x] **Step 1: Write the failing cross-version test**

Create a test importing both builders and using this hand-checked literal:

```ts
const COACH_FORWARD_BODY = `Hi {{respondentFirstName}},

You've been invited by {{coachName}} to complete the {{templateName}} for {{organizationName}}.

It takes just a few minutes, and there are no right or wrong answers — your honest perspective is what makes the results useful. Your responses are confidential.

Click the button below to begin.`;
```

For both builders, assert the exact body and unchanged subject. Separately assert
that QSP v1 remains alias/name `qsp-v1` / `Quarterly Session Prep v1`, QSP v2
remains `qsp-v2` / `Quarterly Session Prep v2`, and neither body contains
`{{invitationUrl}}` or `{{assessmentUrl}}`.

- [x] **Step 2: Run RED**

Run:

```bash
npx jest src/__tests__/seed/qsp-invitation-copy.test.ts --runInBand
```

Expected: FAIL only for QSP v1 because its current body is organization-forward
and contains a raw `{{invitationUrl}}`; QSP v2 should already satisfy the contract.

- [x] **Step 3: Apply the minimal seed change**

Replace only QSP v1's `INVITATION_BODY_MARKDOWN` with `COACH_FORWARD_BODY`'s
literal value. Update QSP v1/v2 nearby comments to describe the approved shared
copy and current universal-shell behavior; do not change runtime rendering.

- [x] **Step 4: Remove the superseded QSP-v2-only test**

Delete `qsp-v2-invitation-copy.test.ts` after its live requirements have moved
into the cross-version suite. Do not duplicate the exact-copy contract across
two test files.

- [x] **Step 5: Run GREEN and adjacent seed coverage**

Run:

```bash
npx jest \
  src/__tests__/seed/qsp-invitation-copy.test.ts \
  src/__tests__/seed/qsp-seeds.test.ts \
  src/__tests__/seed/qsp-v1-content.test.ts \
  src/__tests__/seed/qsp-v2-content.test.ts \
  --runInBand
```

Expected: all suites pass with no snapshots or warnings.

---

### Task 2: Record truthful closeout state

**Files:**
- Modify: `docs/agents/jul10-feedback-closeout.md`
- Modify: `CLAUDE.md`
- Modify: `plans/CHANGELOG.md`

**Interfaces:**
- Consumes: verified Task 1 code/test evidence.
- Produces: a source-of-truth receipt that keeps Jeff #47 partial until the Production template rows and a received QSP v2 email are verified.

- [x] **Step 1: Update the ledger without overclaiming**

Record that both factory defaults are aligned in code and protected by the
cross-version test. Keep #47 `PARTIAL`; its residual action is authenticated
Production template-row verification/update plus one received QSP v2 email.

- [x] **Step 2: Prepend the changelog receipt and refresh the CLAUDE anchor**

State `IMPLEMENTED + LOCALLY VERIFIED; NOT DEPLOYED OR PRODUCTION-MUTATED`.
Include the exact test counts from Task 1 and the failed read-only database
connection as a verification boundary, not as a completed live check.

- [x] **Step 3: Validate SoT consistency**

Run:

```bash
npx jest src/__tests__/lint/changelog-freshness.test.ts --runInBand
git diff --check
```

Expected: PASS and no whitespace diagnostics.

---

### Task 3: Run the repository gates

**Files:**
- Verify only; no new files expected.

**Interfaces:**
- Consumes: Tasks 1–2.
- Produces: a merge-ready local branch and an explicit Production-operation gate.

- [x] **Step 1: Lint changed TypeScript files**

```bash
npx eslint \
  prisma/seed-qsp-v1-assessment.ts \
  prisma/seed-qsp-v2-assessment.ts \
  src/__tests__/seed/qsp-invitation-copy.test.ts
```

- [x] **Step 2: Run migration safety**

```bash
node scripts/check-migration-safety.mjs
```

Expected: all existing migrations approved; this change adds none.

- [x] **Step 3: Run Production-equivalent build**

```bash
CI=true npx next build --turbopack
```

Expected: successful compile, TypeScript phase, and static-page generation.

- [x] **Step 4: Review the final diff and commit**

```bash
git diff --check
git status --short
git diff --stat
git add \
  docs/superpowers/specs/2026-08-12-qsp-coach-forward-invitation-copy-design.md \
  docs/superpowers/plans/2026-08-12-qsp-coach-forward-invitation-copy.md \
  docs/agents/jul10-feedback-closeout.md \
  CLAUDE.md \
  plans/CHANGELOG.md \
  src/prisma/seed-qsp-v1-assessment.ts \
  src/prisma/seed-qsp-v2-assessment.ts \
  src/src/__tests__/seed/qsp-invitation-copy.test.ts \
  src/src/__tests__/seed/qsp-v2-invitation-copy.test.ts
git commit -m "fix(assessments): align QSP invitation copy"
```

- [x] **Step 5: Stop before Production mutation**

Report the exact canonical editor action required for QSP v1 and QSP v2. Do not
save a Production template, publish a version, deploy, or send a customer/test
invitation without explicit operational authorization after the local evidence
is reviewed.
