# GH #217 Legacy Invitation Fallback Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the dormant `ASSESSMENT_INVITE_BRANDED=0` invitation renderer preserve Coach identity, send multipart text, and expose a copy/paste fallback URL without changing the live branded path.

**Architecture:** Keep `sendLegacyInvitationEmail` in `notifications.ts` as the independent emergency renderer. Thread the already-resolved `coachName` into its existing `InvitationVars`, reuse `renderTextBody` for the plain-text twin, and append one escaped visible URL to the current blue HTML while leaving telemetry and failure propagation intact.

**Tech Stack:** TypeScript, Next.js 16, Jest, Nodemailer through `sendEmailViaSMTP`, Prisma migration-safety script, ESLint, Turbopack.

## Global Constraints

- Preserve the legacy font, width, paragraph treatment, button label, blue color `#1D4ED8`, padding, radius, and weight.
- Do not route legacy HTML through `buildInvitationEmailHtml` or `renderHtmlBody`.
- Branded and campaign full-HTML renderer output must remain unchanged.
- Existing template/campaign invitation copy, custom-HTML precedence, telemetry fields, attachment behavior, and SMTP error propagation remain unchanged.
- Add no schema, migration, API, route, scoring, report, feature flag, environment mutation, scheduler, or production-data change.
- Do not flip `ASSESSMENT_INVITE_BRANDED`; production must continue to leave it unset.
- Update `CLAUDE.md` and prepend `plans/CHANGELOG.md` in the same implementation PR, then record exact launch evidence after merge.

## File map

- Modify `src/src/__tests__/services/notifications.test.ts`: TDD coverage for both renderer flag states, Coach fallback, multipart text, URL deduplication, telemetry, and attachments.
- Modify `src/src/services/notifications.ts`: thread `coachName`, escape the generated URL, append the visible fallback, and pass `text`.
- Modify `CLAUDE.md`: current GH #217 state and freshness anchor.
- Modify `plans/CHANGELOG.md`: implementation receipt, then exact launch receipt after protected merge.
- Existing helper `src/src/lib/assessments/invitation-email.ts`: consumed unchanged through `renderTextBody`, `buildTokenValues`, `interpolateTokens`, and `renderSubject`.
- Existing transport `src/src/lib/smtp-transport.ts`: consumed unchanged through `sendEmailViaSMTP`.

---

### Task 1: Pin the legacy renderer contract with failing tests

**Files:**
- Modify: `src/src/__tests__/services/notifications.test.ts:366-489`
- Test: `src/src/__tests__/services/notifications.test.ts`

**Interfaces:**
- Consumes: `sendAssessmentInvitationEmail(data): Promise<void>` and the mocked `sendEmailViaSMTP`.
- Produces: executable assertions for `coachName`, `text`, visible fallback HTML, URL deduplication, attachment-free legacy behavior, unchanged telemetry, and branded-path non-regression.

- [ ] **Step 1: Add the failing legacy hardening tests**

Add these cases inside the existing `sendAssessmentInvitationEmail — default body/subject + telemetry (Wave G)` describe block:

```ts
it("legacy threads coachName into HTML and plain text", async () => {
  process.env.ASSESSMENT_INVITE_BRANDED = "0";
  await sendAssessmentInvitationEmail({
    ...blankData(),
    template: {
      invitationSubject: "Assessment from {{coachName}}",
      invitationBodyMarkdown: "{{coachName}} has invited you.",
    },
  });

  const args = mockSendEmailViaSMTP.mock.calls[0][0];
  expect(args.subject).toBe("Assessment from Pat Coach");
  expect(args.html).toContain("Pat Coach has invited you.");
  expect(args.text).toContain("Pat Coach has invited you.");
});

it("legacy uses the established neutral Coach fallback", async () => {
  process.env.ASSESSMENT_INVITE_BRANDED = "0";
  await sendAssessmentInvitationEmail({
    ...blankData(),
    coachName: null,
    template: {
      invitationSubject: "Your assessment",
      invitationBodyMarkdown: "{{coachName}} has invited you.",
    },
  });

  const args = mockSendEmailViaSMTP.mock.calls[0][0];
  expect(args.html).toContain("your coach has invited you.");
  expect(args.text).toContain("your coach has invited you.");
});

it("legacy sends multipart text and one canonical visible fallback", async () => {
  process.env.ASSESSMENT_INVITE_BRANDED = "0";
  await sendAssessmentInvitationEmail({
    ...blankData(),
    template: {
      invitationSubject: "Your assessment",
      invitationBodyMarkdown:
        "Hi {{respondentFirstName}}\n\n[Start now]({{invitationUrl}})",
    },
  });

  const args = mockSendEmailViaSMTP.mock.calls[0][0];
  const invitationUrl = "https://app.test/org-survey/abc#t=SECRET";

  expect(args.html).toContain("background-color:#1D4ED8");
  expect(args.html).toContain("If the button doesn't work, paste this into your browser:");
  expect(args.html).toContain(`<span style="word-break:break-all;color:#6b7280;">${invitationUrl}</span>`);
  expect(args.text).toBe(`Hi Jane\n\nStart the assessment: ${invitationUrl}`);
  expect(args.text.match(/#t=SECRET/g)).toHaveLength(1);
  expect(args.attachments ?? []).toHaveLength(0);
  expect(args.telemetry.metadata).toMatchObject({
    type: "assessment_invitation_legacy",
    renderer: "legacy",
    subjectSource: "authored",
    bodySource: "authored",
    defaultVersion: null,
  });
});

it("legacy escapes the generated URL in its href and visible fallback", async () => {
  process.env.ASSESSMENT_INVITE_BRANDED = "0";
  await sendAssessmentInvitationEmail({
    ...blankData(),
    baseUrl: 'https://app.test/"><script>alert(1)</script>',
  });

  const args = mockSendEmailViaSMTP.mock.calls[0][0];
  expect(args.html).not.toContain("<script>");
  expect(args.html).not.toContain('"><script');
  expect(args.html).toContain("&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;");
});

it("branded rendering remains multipart with its CID attachment", async () => {
  await sendAssessmentInvitationEmail(blankData());

  const args = mockSendEmailViaSMTP.mock.calls[0][0];
  expect(args.html).toContain("cid:sulogo");
  expect(args.text).toContain("Start the assessment:");
  expect(args.attachments).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ cid: "sulogo", filename: "su-logo.png" }),
    ]),
  );
  expect(args.telemetry.metadata.renderer).toBe("branded");
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run from `src/`:

```bash
npx jest src/__tests__/services/notifications.test.ts --runInBand
```

Expected: the new legacy cases fail because `coachName` resolves to `your coach`,
`args.text` is absent, the fallback sentence is absent, and the generated URL is
not escaped. Existing cases remain green.

- [ ] **Step 3: Commit the red tests**

```bash
git add src/src/__tests__/services/notifications.test.ts
git commit -m "test(assessments): pin legacy invitation fallback contract"
```

---

### Task 2: Implement the minimal legacy correction

**Files:**
- Modify: `src/src/services/notifications.ts:1147-1159`
- Modify: `src/src/services/notifications.ts:1247-1310`
- Test: `src/src/__tests__/services/notifications.test.ts`
- Test: `src/src/__tests__/lib/assessments/invitation-email.test.ts`

**Interfaces:**
- Consumes: `renderTextBody(template: string, vars: InvitationVars): string`, `escapeHtml(value: string): string`, and `sendEmailViaSMTP(options): Promise<void>`.
- Produces: a legacy SMTP payload with `{ html, text }`, factual Coach identity, one generated visible fallback URL, unchanged telemetry, and no attachments.

- [ ] **Step 1: Thread Coach identity through the fallback call**

Add the call argument:

```ts
coachName: data.coachName ?? null,
```

Add the legacy input field:

```ts
coachName: string | null;
```

Use it in `InvitationVars`:

```ts
coachName: data.coachName,
```

- [ ] **Step 2: Add escaped HTML fallback and the shared text twin**

Replace the current legacy `html` construction with:

```ts
const escapedInvitationUrl = escapeHtml(data.invitationUrl);
const html =
  `<div style="font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;max-width:560px;margin:0 auto;">` +
  `${paragraphs}<br/>` +
  `<div style="text-align:center;">` +
  `<a href="${escapedInvitationUrl}" style="display:inline-block;background-color:#1D4ED8;color:#ffffff;padding:14px 28px;text-decoration:none;border-radius:8px;font-weight:600;font-size:15px;">Start the assessment</a>` +
  `</div>` +
  `<p style="color:#9ca3af;font-size:12px;margin-top:20px;">` +
  `If the button doesn't work, paste this into your browser:<br/>` +
  `<span style="word-break:break-all;color:#6b7280;">${escapedInvitationUrl}</span>` +
  `</p>` +
  `</div>`;
const text = renderTextBody(data.effectiveBodyMarkdown, vars);
```

Add `text` to the existing `sendEmailViaSMTP` payload immediately after `html`.

- [ ] **Step 3: Run the focused notification suite and verify GREEN**

```bash
npx jest src/__tests__/services/notifications.test.ts --runInBand
```

Expected: all notification tests pass, including the new legacy and branded assertions.

- [ ] **Step 4: Run the adjacent pure-renderer suite**

```bash
npx jest src/__tests__/lib/assessments/invitation-email.test.ts --runInBand
```

Expected: all invitation-email helper tests pass; no shared rendering contract changed.

- [ ] **Step 5: Run scoped lint and diff validation**

```bash
npx eslint src/services/notifications.ts src/__tests__/services/notifications.test.ts
git diff --check
```

Expected: ESLint exits `0`; `git diff --check` emits no output.

- [ ] **Step 6: Commit the implementation**

```bash
git add src/src/services/notifications.ts
git commit -m "fix(assessments): harden legacy invitation fallback"
```

---

### Task 3: Record implementation SoT and run release gates

**Files:**
- Modify: `CLAUDE.md:21-31`
- Modify: `plans/CHANGELOG.md:8`
- Test: `src/src/__tests__/lint/changelog-freshness.test.ts`

**Interfaces:**
- Consumes: the verified Task 2 commit and the reporting cutoff already recorded in `plans/CHANGELOG.md`.
- Produces: top entry `gh-217-legacy-invite-fallback-pr-ready`, a matching `LAST_UPDATED` anchor, and complete local release evidence.

- [ ] **Step 1: Prepend the implementation receipt**

Add a newest-first CHANGELOG entry with:

```markdown
### 2026-07-31 — Legacy invitation fallback hardened (GH #217) <!-- ENTRY_ISO:2026-07-31 ENTRY_SLUG:gh-217-legacy-invite-fallback-pr-ready -->

**Status: IMPLEMENTED + LOCALLY VERIFIED; not yet merged or launched.**
```

Record the three corrections, the preserved renderer/telemetry/error contracts,
exact test counts from the commands below, and the fact that the production
flag remains unset. Classify this as the next eligible reliability outcome only
after merge, exact deployment verification, issue closeout, and claim release.

- [ ] **Step 2: Update the concise project anchor**

Set:

```html
<!-- LAST_UPDATED_ISO:2026-07-31 LAST_UPDATED_SLUG:gh-217-legacy-invite-fallback-pr-ready -->
```

Replace the active GH #217 bullet with an implemented/not-yet-live summary.

- [ ] **Step 3: Run the complete focused regression set**

```bash
npx jest \
  src/__tests__/services/notifications.test.ts \
  src/__tests__/lib/assessments/invitation-email.test.ts \
  src/__tests__/seed/lva-invitation-copy.test.ts \
  src/__tests__/seed/rockefeller-invitation-copy.test.ts \
  src/__tests__/seed/scaling-up-full-invitation-copy.test.ts \
  src/__tests__/seed/five-dysfunctions-invitation-copy.test.ts \
  src/__tests__/seed/qsp-v2-invitation-copy.test.ts \
  src/__tests__/lint/changelog-freshness.test.ts \
  --runInBand
```

Expected: every listed suite and test passes.

- [ ] **Step 4: Run repository release gates**

```bash
npx eslint src/services/notifications.ts src/__tests__/services/notifications.test.ts
node scripts/check-migration-safety.mjs
git diff --check
CI=true npx next build --turbopack
```

Expected: ESLint exits `0`; migration safety reports no unapproved destructive operation; diff check is silent; Turbopack build exits `0`.

- [ ] **Step 5: Commit the SoT and gate receipt**

```bash
git add CLAUDE.md plans/CHANGELOG.md
git commit -m "docs(sot): record GH 217 legacy fallback hardening"
```

---

### Task 4: Publish through the protected path

**Files:**
- No new product files.
- Verify the complete branch diff against `origin/main`.

**Interfaces:**
- Consumes: the clean, fully gated branch from Task 3.
- Produces: a protected PR, passing required checks, and an exact merge SHA.

- [ ] **Step 1: Reconcile current coordination state**

```bash
git fetch origin main
gh issue view 261 --repo ChiefAI-Officer/Scaling-up-platform-v2
git log --left-right --cherry-pick --oneline origin/main...HEAD
git diff --stat origin/main...HEAD
```

Expected: GH #217 remains claimed by this branch and no competing implementation exists. If current `main` moved, rebase or merge it normally, rerun Task 3 gates, and never force-push.

- [ ] **Step 2: Push the branch and update the existing Notion task**

```bash
git push -u origin codex/217-legacy-invite-fallback-hardening
```

Search the AI Solutions Team Tasks board first; update the matching GH #217 task
to `In progress` with assignee `gabriel@chiefaiofficer.com`, a real due date,
priority, task type, effort, branch/commit source, and no duplicate row.

- [ ] **Step 3: Open a draft PR**

Create a draft PR targeting `main` with:

- a three-gap summary;
- explicit exclusions and unchanged production flag state;
- test/build evidence;
- `Closes #217`.

- [ ] **Step 4: Complete review and protected checks**

Confirm the PR is mergeable and all required checks pass:

```bash
GH217_PR="$(gh pr view --repo ChiefAI-Officer/Scaling-up-platform-v2 --json number --jq .number)"
gh pr checks "$GH217_PR" --repo ChiefAI-Officer/Scaling-up-platform-v2
```

Expected green checks: Build, Migration Safety Gate, Assessment Email Lease
(PostgreSQL), Vercel, and Vercel Preview Comments.

- [ ] **Step 5: Obtain merge approval and squash-merge**

After the review loop is complete and explicit user approval is received:

```bash
GH217_PR="$(gh pr view --repo ChiefAI-Officer/Scaling-up-platform-v2 --json number --jq .number)"
gh pr ready "$GH217_PR" --repo ChiefAI-Officer/Scaling-up-platform-v2
gh pr merge "$GH217_PR" --repo ChiefAI-Officer/Scaling-up-platform-v2 --squash --delete-branch
```

Record the exact merge SHA from `gh pr view`.

---

### Task 5: Verify production and complete launch closeout

**Files:**
- Modify on a fresh launch-record branch: `CLAUDE.md`
- Modify on a fresh launch-record branch: `plans/CHANGELOG.md`

**Interfaces:**
- Consumes: the exact Task 4 merge SHA.
- Produces: Ready production evidence, healthy aliases, canonical launch SoT, closed GH #217, released claim, and Done Notion task.

- [ ] **Step 1: Verify the exact production deployment**

Capture the merged PR and deployment:

```bash
GH217_PR="$(gh pr list --repo ChiefAI-Officer/Scaling-up-platform-v2 --state merged --head codex/217-legacy-invite-fallback-hardening --json number --jq '.[0].number')"
GH217_MERGE_SHA="$(gh pr view "$GH217_PR" --repo ChiefAI-Officer/Scaling-up-platform-v2 --json mergeCommit --jq .mergeCommit.oid)"
GH217_DEPLOYMENT_ID="$(
  npx vercel api '/v6/deployments?projectId=prj_xcAWuAmGZAU3DCHgAauRv2WPKneo&target=production&limit=20' --scope scaling-up 2>/dev/null |
  jq -r --arg sha "$GH217_MERGE_SHA" 'first(.deployments[] | select(.meta.githubCommitSha == $sha) | .uid)'
)"
npx vercel api "/v13/deployments/${GH217_DEPLOYMENT_ID}" --scope scaling-up 2>/dev/null |
  jq '{id,readyState,target,gitSource,alias}'
```

Use that metadata to prove:

```text
target = production
readyState = READY
gitSource.ref = main
gitSource.sha equals the exact value returned by:
  gh pr view "$GH217_PR" --json mergeCommit --jq .mergeCommit.oid
aliases include scaling-up-platform-v2.vercel.app and platformtest.scalingup.com
```

Confirm `ASSESSMENT_INVITE_BRANDED` remains absent from Production by filtering
the Vercel environment response to the key name and type only. Do not request or
print secret values.

- [ ] **Step 2: Run read-only production health checks**

```bash
curl -sS --fail https://scaling-up-platform-v2.vercel.app/api/health
curl -sS --fail https://platformtest.scalingup.com/api/health
```

Expected from both: HTTP `200`, `status: healthy`, `checks.database: healthy`,
and `checks.authPosture: safe`.

Do not flip the fallback flag or send a production invitation merely to exercise
the dormant renderer; focused tests are the acceptance evidence.

- [ ] **Step 3: Create the exact launch record**

From fresh `origin/main`, create the launch-record worktree:

```bash
git fetch origin main
git worktree add \
  -b codex/217-legacy-invite-fallback-launch-sot \
  /Users/diushianstand/Scaling-up-platform-v2/.worktrees/217-legacy-invite-fallback-launch-sot \
  origin/main
```

In that worktree, prepend:

```markdown
### 2026-07-31 — Legacy invitation fallback hardening launched (GH #217) <!-- ENTRY_ISO:2026-07-31 ENTRY_SLUG:gh-217-legacy-invite-fallback-launched -->

**Status: MERGED + LIVE, dormant unless the existing kill switch is activated.**
```

Record the implementation PR, merge SHA, deployment ID/timestamps, both health
receipts, unchanged flag state, no-live-send limitation, rollback, and
consolidated-report classification. Align `CLAUDE.md`'s `LAST_UPDATED` anchor.

- [ ] **Step 4: Validate, commit, push, and merge the launch record**

```bash
npx jest src/__tests__/lint/changelog-freshness.test.ts --runInBand
git diff --check
git add CLAUDE.md plans/CHANGELOG.md
git commit -m "docs(sot): record GH 217 production launch"
git push -u origin codex/217-legacy-invite-fallback-launch-sot
```

Open the launch-record PR, wait for protected checks, obtain merge approval,
squash-merge, and verify its exact Ready production deployment and both health
aliases.

- [ ] **Step 5: Release coordination and tracking**

Confirm GH #217 is closed. Capture the exact runtime values and post on issue
#261:

```bash
GH217_RELEASED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
GH217_PR="$(gh pr list --repo ChiefAI-Officer/Scaling-up-platform-v2 --state merged --head codex/217-legacy-invite-fallback-hardening --json number --jq '.[0].number')"
GH217_MERGE_SHA="$(gh pr view "$GH217_PR" --repo ChiefAI-Officer/Scaling-up-platform-v2 --json mergeCommit --jq .mergeCommit.oid)"
GH217_LAUNCH_PR="$(gh pr list --repo ChiefAI-Officer/Scaling-up-platform-v2 --state merged --head codex/217-legacy-invite-fallback-launch-sot --json number --jq '.[0].number')"
GH217_DEPLOYMENT_ID="$(
  npx vercel api '/v6/deployments?projectId=prj_xcAWuAmGZAU3DCHgAauRv2WPKneo&target=production&limit=20' --scope scaling-up 2>/dev/null |
  jq -r --arg sha "$GH217_MERGE_SHA" 'first(.deployments[] | select(.meta.githubCommitSha == $sha) | .uid)'
)"

gh issue comment 261 --repo ChiefAI-Officer/Scaling-up-platform-v2 --body \
"DONE / RELEASED: GH #217 — ${GH217_RELEASED_AT}

Implementation PR #${GH217_PR} merged as ${GH217_MERGE_SHA}; exact production deployment ${GH217_DEPLOYMENT_ID} is Ready and both aliases are healthy. The existing fallback flag remains unset, so no production invitation was sent. Launch SoT PR #${GH217_LAUNCH_PR} is merged. Claim released."
```

Update the existing GH #217 Notion task to `Done` with the implementation PR URL,
assignee, due date, and final release summary. Do not create a duplicate.
