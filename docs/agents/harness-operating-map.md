# Agent Harness Operating Map

Status: instantiated 2026-06-24 from the Codex handoff in
`C:/Users/Admin/Downloads/message.txt`.

This file turns the handoff into an operating loop. `AGENTS.md` is the quick map;
this file is the loop controller.

## Evidence Already Checked

- GitHub write path: `gh repo view ChiefAI-Officer/Scaling-up-platform-v2 --json viewerPermission -q .viewerPermission`
  returned `ADMIN` on 2026-06-24.
- Local tree: clean on `main` before this harness-map branch.
- Stash reconciliation: `git stash list` returned empty on 2026-06-24.
- Recent production baseline:
  - #81 security audit merged.
  - #83 Inngest fan-out email dedup merged at `04e40b2` and deployed.
  - #84 Wave I LVA conditional-obstacles report filter merged at `91a67ff` and deployed.

## Long Autonomous Loop Goal

Restore and preserve the shipping lane, land the stranded Wave I source-of-truth
docs, reconcile local/remote state, then prepare the next gated assessment wave
for user-approved implementation without starting feature code prematurely.

## Milestones

### M0 - Shipping Ability And Merge Workflow

Terminal state:

- GitHub permission is `WRITE`, `MAINTAIN`, or `ADMIN`.
- The PR merge workflow is explicit: `main` requires at least one approving review.
- The user identifies the normal second approver or confirms the permanent workflow.

Current evidence:

- Permission is already `ADMIN`.
- The second-approver workflow still needs a human confirmation for the durable
  operating model.

### M1 - Land Stranded Wave I SoT Docs

Branch:

- `chore/sot-wave-i-cond-obstacles` off latest `main`.

Required edits:

- `CLAUDE.md`: update the `LAST_UPDATED_ISO`/`LAST_UPDATED_SLUG` anchor to
  `2026-06-24` / `wave-i-lva-conditional-obstacles`, prepend the Wave I summary,
  and preserve older history as `OLD`.
- `plans/CHANGELOG.md`: prepend the Wave I source-of-truth entry from the handoff,
  verbatim.

Validation:

- `git diff --check`
- relevant SoT freshness test if available
- docs-only review pass
- If pushing, follow the handoff rule and run `$env:CI='true'; npx next build --turbopack`
  from `src/`.

Terminal state:

- Commit message: `docs(sot): Wave I - LVA conditional obstacles shipped (prod)`.
- PR to `main`.
- Required approval obtained.
- PR merged.
- Production deploy/health checked if Vercel deploys docs-only commits.

### M2 - Reconcile The Tree

Actions:

- Prune deleted merged remote branches.
- Check stashes for `audit-PR3 inngest WIP`; compare against merged PR #83 before
  dropping if it exists.
- Keep local `main` equal to `origin/main`.

Current evidence:

- Stash list is empty as of this map.
- Merged remote branches were pruned after #84.

### M3 - Resume The Gated Wave Roadmap

Do not pick unilaterally. Present the queue and get the user's explicit choice.

Candidate queue:

- Wave J: Scaling Up Full business logic. Likely migration. Gated on Jeff's full
  SU-Full review.
- Wave I follow-on: survey-form conditional hiding for unchecked LVA S5 boxes.
- Wave K: coach logo on reports plus Esperto historical import admin-to-coach move.
- Wave H: admin nav grouped dropdowns. Parked on Jeff's nod for the nav preview.
- Auto-send launch: flip `WAVE_D_AUTO_SEND_ENABLED` on Vercel Production and redeploy.

Required gate for any feature wave:

1. Brainstorm.
2. One-question-at-a-time grill.
3. Explicit user approval.
4. Per-wave plan.
5. Failing test first.
6. Implement.
7. Spec compliance review.
8. Code quality review.
9. Whole-branch review.
10. PR with proof.

## How To Use This Harness Map

- Start every autonomous run by reading `AGENTS.md` and this file.
- Convert the current milestone into a small checklist in the conversation.
- Keep only one active branch per milestone unless a PR branch already exists.
- Treat human gates as real stops: reviewer identity, next wave choice, Jeff nods,
  production secrets, and Notion access.
- If Notion is unavailable, create a local task list in the PR body or a repo doc
  and say so.
- After each merge, update this map only when the operating loop itself changes.
  Routine implementation detail belongs in `plans/CHANGELOG.md`.

## Harness Capability Plan

Legible:

- Done: root `AGENTS.md` map and this operating map.
- Next: split the largest recurring instructions out of `CLAUDE.md` into narrower
  docs as they are touched.

Executable:

- Current: app scripts in `src/package.json`.
- Gap: no one-command dev stack. Add `scripts/dev-local.sh` later if repeated local
  startup becomes a drag.

Verifiable:

- Current: targeted Jest, ESLint, migration safety, Next build, Vercel health.
- Gap: e2e exists but is not yet a trusted verify-before-ship gate. Harden it when
  the next UI-heavy wave starts.

Parallel:

- Gap: no isolated cloud boxes per agent. Add only when parallel agents are doing
  real app-driving work and local ports/state start colliding.

Entropy Control:

- Current: SoT freshness convention and changelog anchors.
- Next: encode more golden rules as custom lints when the same mistake appears
  twice.
