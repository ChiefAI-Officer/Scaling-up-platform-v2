# Scaling Up Platform v2 - Agent Harness Map

Last refreshed: 2026-06-24

This is the short front door for Codex/Claude-style agents. Keep this file as a
map, not a manual. Put detailed history and implementation notes in the linked
documents so the working context stays small and reliable.

## Current Operating State

| Item | Current value |
| --- | --- |
| Canonical repo | `ChiefAI-Officer/Scaling-up-platform-v2` |
| Local repo | `D:/Scaling-up-platform-v2` |
| App root | `D:/Scaling-up-platform-v2/src` |
| Production URL | `https://scaling-up-platform-v2.vercel.app` |
| Vercel project | `chief-aio-fficer/scaling-up-platform-v2` |
| Production branch | `main` |
| Vercel root directory | `src` |
| Codex git identity | `Gabriel Lacsam <gabriel@chiefaiofficer.com>` |
| GitHub permission verified | `ADMIN` on 2026-06-24 |

Recent production baseline:

- PR #81 security audit merged.
- PR #83 Inngest fan-out email dedup merged and deployed.
- PR #84 Wave I LVA conditional-obstacles report filter merged and deployed.
- Only open PR seen at handoff: #44 docs/specs.

## First 10 Minutes

1. Confirm the branch and tree: `git status --short --branch`.
2. Confirm GitHub permission if doing PR work:
   `gh repo view ChiefAI-Officer/Scaling-up-platform-v2 --json viewerPermission -q .viewerPermission`.
3. Read this map, then `docs/agents/harness-operating-map.md`.
4. Read the relevant sections of `CLAUDE.md`, then newest entries in `plans/CHANGELOG.md`.
5. For Wave I/LVA work, read `docs/specs/v7.6/18i-*` and `docs/adr/0014-*`.
6. Work on a branch. Use `codex/` for new Codex branches unless continuing an existing PR branch.

## Golden Rules

- Do not start gated wave feature code until the grill, explicit user approval,
  and per-wave plan are complete.
- Main requires at least one approving review. Do not assume self-approval is enough.
- Before every push of code, run from `src/`:
  `CI=true npx next build --turbopack`, targeted tests, and ESLint on changed files.
- For docs-only changes, still run the cheapest useful validation and explain what
  was skipped.
- Never claim a build, test, deploy, or health check passed unless you ran it and
  saw it pass.
- Every production push needs SoT hygiene: update the `CLAUDE.md`
  `LAST_UPDATED_ISO`/`LAST_UPDATED_SLUG` anchor and prepend detail to
  `plans/CHANGELOG.md`.
- For admin/portal UI, wireframes are the spec. Read `src/public/wireframes-phase2/`
  and `docs/wireframes-phase2/` before scoping.
- Keep changes narrow. Preserve unrelated user or agent changes.
- Use GitHub Issues/Notion tracking when available. If not available, keep a local
  task list and say so.

## Where To Look

| Need | Go here |
| --- | --- |
| Active harness plan | `docs/agents/harness-operating-map.md` |
| Project SoT and gotchas | `CLAUDE.md` |
| Historical implementation detail | `plans/CHANGELOG.md` |
| Assessment wave specs | `docs/specs/v7.6/` |
| Architectural decisions | `docs/adr/` |
| Agent issue tracker conventions | `docs/agents/issue-tracker.md` |
| Triage labels | `docs/agents/triage-labels.md` |
| Domain overview | `docs/agents/domain.md` |
| App package/scripts | `src/package.json` |
| Database schema | `src/prisma/schema.prisma` |
| Tests | `src/src/__tests__/` |

## Validation Commands

Run from `D:/Scaling-up-platform-v2/src` unless noted.

```powershell
npx eslint <changed files>
npx jest <targeted test files> --runInBand
node scripts/check-migration-safety.mjs
$env:CI='true'; npx next build --turbopack
```

Production smoke after merge/deploy:

```powershell
Invoke-WebRequest -Uri 'https://scaling-up-platform-v2.vercel.app/api/health' -UseBasicParsing
npx vercel ls scaling-up-platform-v2 --yes
```

## Harness Gaps To Improve

- Legible: `AGENTS.md` + `docs/agents/harness-operating-map.md` are now the map.
- Executable: package scripts exist, but no one-command `dev-local` stack yet.
- Verifiable: Jest, ESLint, migration safety, and Next build gates exist; e2e is
  present but not yet a trusted per-PR harness.
- Parallel/cloud: no crabbox-style isolated agent boxes yet.
- Mechanical rules: SoT freshness has a test; more custom lints can encode future
  golden rules.
