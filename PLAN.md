# Plan — Issue #10: Assessment Tool with Team Hierarchies & Longitudinal Reporting

> **Status (May 27 2026)**: v7.6 spec locked (specs 01–08). **Current priority — the setup-first "flip"** (May 26 Jeff redirect): coaches manage Company→Team→Users *first*, then campaigns pick existing members. See [08 Members & Teams lane](docs/specs/v7.6/08-members-teams-lane.md) — contract-first Slices 1–5 on branch `feat/assessment-setup-first` (subagent-driven dev). Engine + seeds (Rockefeller / QSP v1+v2 / Scaling Up Full / LVA) already in prod. Prior Tasks 5–9 (May 17) are parked behind the flip.

## Spec library (v7.6 — canonical, locked May 15-16)

| Spec | Scope |
|---|---|
| [01 Schema](docs/specs/v7.6/01-schema.md) | Prisma models, raw SQL, partial unique indexes, triggers |
| [02 Service-layer rules](docs/specs/v7.6/02-service-layer-rules.md) | INTERSECTION RBAC, evaluateAccessChange, canCreateCampaign, ownership transfer, ACCESS_POLICY_VERSION |
| [03 Seed Rockefeller](docs/specs/v7.6/03-seed-rockefeller.md) | resolveSystemUser, advisory lock, 6 states, ensureAccessGroupAndTemplateLink |
| [04 Deploy runbook](docs/specs/v7.6/04-deploy-runbook.md) | dotenv-cli (mandatory), DB fingerprint, migrate-diff baseline, PITR, rollback |
| [05 Wireframes Wave 5](docs/specs/v7.6/05-wireframes-wave5.md) | Wave 2 revisions + Wave 5 deliverables (markdown + HTML acceptance criteria) |
| [06 Observability](docs/specs/v7.6/06-observability.md) | 7 metrics, 6 alert gates, /admin/observability deploy-time dashboard |
| [07 Bootstrap runbook](docs/specs/v7.6/07-bootstrap-runbook.md) | Admin first-time setup (bulk-add certified coaches to default group) |
| [08 Members & Teams lane](docs/specs/v7.6/08-members-teams-lane.md) | **Setup-first flip (current priority)**: (A+) Company=Organization as a unified team tree, 12 locked decisions, contract-first Slices 1–5, Esperto UX parity |

## Locked-decisions ledger (one line each)

| # | Decision | Spec file |
|---|---|---|
| 1 | Hierarchy flip: admins create coaches + assessments; coaches create orgs + participants | 01-schema, 02-service-layer-rules |
| 2 | AccessGroup replaces TemplateAccessGrant (groups grant template access) | 01-schema, 02-service-layer-rules |
| 3 | Organization.ownerCoachId NOT NULL (single coach owner); OrganizationMembership dropped | 01-schema, 02-service-layer-rules |
| 4 | Public quizzes = templates + public-mode config (existing AssessmentCampaign.accessMode shape) | 01-schema, 05-wireframes-wave5 |
| 5 | NEW: admin aggregate reporting dashboard, MVP = single template selector + all-time | 06-observability, 05-wireframes-wave5 |
| 6 | INTERSECTION RBAC (not union); ACCESS_POLICY_VERSION env var for runtime flip + shadow mode | 02-service-layer-rules |
| 7 | Self-signed coach lands with zero assessment access until admin adds to a group | 02-service-layer-rules, 07-bootstrap-runbook |
| 8 | Admin aggregate dashboard MVP shape: template selector + version selector, no filters on day 1 | 06-observability |
| 9 | Deploy via .env.production.local + dotenv-cli (one-shot injection); local .env NEVER overwritten | 04-deploy-runbook |
| 10 | Setup-first flip (May 26): user structure before campaigns; wizard picks existing members (not inline-create); (A+) Company=Organization presented Esperto-style as a unified tree | 08-members-teams-lane |

## Active Notion tasks (May 14 + May 17)

| Task | Status | Spec ref |
|---|---|---|
| Task 0 — memory file | shipped May 14 | (memory dir, not spec) |
| Task 1 — Wave 1 polish | shipped May 14 | 05-wireframes-wave5 |
| Task 2 — schema migration v7.5 | artifacts; live DB pending | 01-schema |
| Task 3 — Rockefeller seed | shipped May 14 | 03-seed-rockefeller |
| Task 4 — scoreSubmission + golden fixture | shipped May 14 | (no v7.6 spec — pure function) |
| Task 5 — amend v7.5 migration (AccessGroup + ownership flip) | next | 01-schema |
| Task 6 — Wave 2 wireframe revisions | queued | 05-wireframes-wave5 |
| Task 7 — Wave 5 wireframes (markdown + HTML) | queued | 05-wireframes-wave5 |
| Task 8 — memory file update | queued | (memory dir) |
| Task 9 — local .env DATABASE_URL mismatch resolution | HIGH priority, blocks deploy | 04-deploy-runbook |

## Deployment path (one-paragraph summary; details in 04-deploy-runbook)

Local `.env` is NEVER modified. Pull Vercel prod env to `.env.production.local`. All prod commands flow through `npx dotenv-cli -e .env.production.local -- <cmd>`. Mandatory preflight: `src/scripts/db-fingerprint.ts` confirms `ASSESSMENT_PROD_EXPECTED_HOST` match before any destructive command. Migration baselining uses `prisma migrate diff` (not `--from-empty`) to verify schema parity before `prisma migrate resolve --applied` on historic migrations. PITR snapshot captured before any deploy step. See [04-deploy-runbook](docs/specs/v7.6/04-deploy-runbook.md).

## What v7.6 does NOT do

- Does NOT push the foundation slice (Tasks 0–4) to prod yet (gated on Task 9).
- Does NOT begin AccessGroup API/UI implementation (Wave 5 wireframes lock first).
- Does NOT begin Wave 3 (output/report) wireframes (separate slice).
- Does NOT touch coach onboarding/invite flow beyond welcome-email correction (no welcome email is sent by /api/auth/coach-signup today).
- Does NOT introduce CRUD APIs or routes (still pure foundation per May 14 scope rule).

## Decision provenance

All 6 rounds of Codex adversarial review (May 14 Rounds 1-3 + May 16 Rounds 1-3) archived at [plans/history/v6-v7.5-archive.md](plans/history/v6-v7.5-archive.md) for traceability. The v7.6 spec files supersede all prior content.

## Source-of-truth deltas (companion updates)

- `CLAUDE.md` "Last Updated" reflects v7.6 lock + deploy-pending state.
- `plans/CHANGELOG.md` carries the full v7.6 delta as a single appended entry.
- `~/.claude/projects/-Users-diushianstand-Scaling-up-platform-v2/memory/project_assessment_tool.md` reflects the new hierarchy paragraph, AccessGroups paragraph, Wave 2 approval status, and Wave 5 ETA.

## Restructuring discipline (persistent rule)

Future plan revisions land in the appropriate spec file under `docs/specs/v7.6/` (or a future `docs/specs/v7.7/` if a major spec bump happens). Do NOT append to PLAN.md. Do NOT inline new spec content in a Notion task. The hub stays thin.
