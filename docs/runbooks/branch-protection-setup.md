# Branch Protection Setup — `main`

**Status:** Handoff. Requires **repo-admin** rights. The day-to-day operator account `MonksKoala` has `admin: false` on `jcbdelo26/Scaling-up-platform-v2` (only push/triage), so the operator must run the command below **as the repo owner `jcbdelo26`** (you have access to both accounts), or have an admin run it.

**Chosen model:** *CI required, no required review.*
- Direct pushes to `main` are blocked → all changes go through a PR.
- The required CI status checks must pass before merge.
- **No human approval is required** (avoids the solo-maintainer self-approval deadlock; Greptile + operator approval handle review). CODEOWNERS auto-requests `@MonksKoala` but is not blocking.

### Which checks are REQUIRED (and why not all of them)

When CI was first activated it surfaced a backlog of **pre-existing** failures the old `next build`-only local gate never ran: **110 ESLint problems (22 errors, 88 warnings)** and **17 failing tests across 5 suites** — three of which are the long-known failures already documented in `CLAUDE.md` (`no-inline-tolocaledatestring`, `org-survey-exchange`, `assessment-campaigns-detail-route`). They live in the assessment module and are owned elsewhere.

Requiring those checks now would block **every** merge. So required = the two jobs that are **green and wipe-relevant**:

- ✅ **`Build`** — `next build` succeeds (also a deployability signal).
- ✅ **`Migration Safety Gate`** — the destructive-migration tripwire.

Advisory (run for visibility, will show red until burned down, **not** required to merge):

- ⚠️ `Lint & Type Check`
- ⚠️ `Unit Tests`

**Burndown → promote:** once the pre-existing lint/test backlog is fixed (a separate effort by the assessment-module owners), add `"Lint & Type Check"` and `"Unit Tests"` to the `contexts` list below to make them blocking too.

---

## ⚠️ Ordering: do this AFTER the CI workflow is on `main`

Required status checks are matched by **check-run name**. GitHub can only enforce names it has seen run. So:

1. Merge the PR that adds `.github/workflows/ci.yml` (this branch) to `main` first.
2. Confirm CI ran at least once (the four checks appear on the PR / in the Actions tab).
3. Then apply the protection below.

If you apply protection *before* the workflow exists, PRs won't generate those checks and every merge will be blocked on "Expected" checks that never arrive.

---

## Apply protection (run as an admin / as `jcbdelo26`)

```bash
gh api -X PUT repos/jcbdelo26/Scaling-up-platform-v2/branches/main/protection \
  -H "Accept: application/vnd.github+json" \
  --input - <<'JSON'
{
  "required_status_checks": {
    "strict": false,
    "contexts": [
      "Build",
      "Migration Safety Gate"
    ]
  },
  "enforce_admins": false,
  "required_pull_request_reviews": {
    "required_approving_review_count": 0,
    "dismiss_stale_reviews": false,
    "require_code_owner_reviews": false
  },
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false
}
JSON
```

What each setting does:
- `required_status_checks.contexts` — the CI job names that must pass (currently `Build` + `Migration Safety Gate` only — see "Which checks are REQUIRED" above). **These strings must exactly match the `name:` of each job in `ci.yml`.** If you rename a job, update this list.
- `strict: false` — don't force every branch to be rebased onto the latest `main` before merge (friendlier for a near-solo repo; set `true` for stricter linear-ish flow).
- `required_pull_request_reviews` present with `required_approving_review_count: 0` — **requires a PR** (blocks direct pushes) but needs **zero approvals** to merge. This is exactly "CI required, no required review."
- `require_code_owner_reviews: false` — CODEOWNERS is informational/auto-request, not a merge blocker. Flip to `true` later to make `@MonksKoala` review mandatory.
- `enforce_admins: false` — admins can bypass in a genuine emergency (e.g. hotfix when CI infra is down). Set `true` to bind admins too.
- `allow_force_pushes: false`, `allow_deletions: false` — protect `main` from force-push and deletion.

---

## Verify

```bash
# Should now return JSON (not 404), reflecting the settings above.
gh api repos/jcbdelo26/Scaling-up-platform-v2/branches/main/protection \
  --jq '{checks: .required_status_checks.contexts, pr_required: (.required_pull_request_reviews != null), approvals: .required_pull_request_reviews.required_approving_review_count, force_push: .allow_force_pushes.enabled}'
```

Then open a throwaway PR and confirm: (a) the four checks appear and gate the merge, (b) you can merge once they're green without a separate approval, (c) `git push origin main` directly is rejected.

---

## To change the model later

- **Make review blocking:** set `require_code_owner_reviews: true` and `required_approving_review_count: 1` — then a CODEOWNERS approval from someone other than the PR author is required (needs a second human with write access).
- **Loosen to allow direct pushes:** remove the `required_pull_request_reviews` block (set to `null`). Direct pushes return, but still must satisfy status checks.
- **Remove protection entirely:** `gh api -X DELETE repos/jcbdelo26/Scaling-up-platform-v2/branches/main/protection`.
