# Contributing

Scaling Up Platform v2 work moves through GitHub issues, branches, and pull requests. Do not push directly to `main`.

## Before Editing

1. Confirm the remote is `https://github.com/ChiefAI-Officer/Scaling-up-platform-v2`.
2. Read `AGENTS.md`, `docs/agents/harness-operating-map.md`, `CLAUDE.md`, and `CONTEXT.md`.
3. For Wave I/LVA work, read `docs/specs/v7.6/` and `docs/adr/0014-*` before scoping.
4. Run:

   ```powershell
   git status --short --branch
   git fetch origin
   git branch -vv
   ```

5. Select one GitHub issue, task, or explicitly named PR review target.
6. Work on a short branch such as `gabriel/42-short-topic` or `codex/github-sync-guardrails-20260625`.

## Pull Requests

Open draft pull requests early. Every PR should include:

- issue or source-truth docs read
- what changed and why
- validation commands run
- exact blockers, if any
- files reviewers should inspect first
- deployment or production impact, if any

## Validation

For code-bearing changes, run from `src/` unless the touched area says otherwise:

```powershell
npx eslint <changed files>
npx jest <targeted test files> --runInBand
node scripts/check-migration-safety.mjs
$env:CI='true'; npx next build --turbopack
```

For docs-only changes, run at minimum:

```powershell
git diff --check
```

If a check cannot run, record the exact blocker and what remains unverified.

## Repository Boundaries

Repository Maintain access authorizes repo-management work such as issues, branches, pull requests, labels, and non-destructive settings. It does not authorize credential exposure, production deployment changes, billing changes, DNS changes, or destructive branch deletion without explicit operator approval.