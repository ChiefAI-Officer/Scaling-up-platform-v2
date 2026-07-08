# Scaling Up Platform v2 — Codebase Handoff for Jeff Verdun

**Date:** July 8, 2026
**From:** Gabriel (gabriel@chiefaiofficer.com)
**Repo:** https://github.com/ChiefAI-Officer/Scaling-up-platform-v2 (branch `main`)
**Live app:** https://scaling-up-platform-v2.vercel.app (aliased `platformtest.scalingup.com`)

Everything — application code, specs, plans, architecture decisions, progress reports, and launch-verification artifacts — is committed and pushed to `main` as of this document's commit. The repository is the single source of truth; cloning it gives you the complete current state of the project.

---

## 1. Get the code

```bash
git clone https://github.com/ChiefAI-Officer/Scaling-up-platform-v2.git
cd Scaling-up-platform-v2/src   # the Next.js app lives in src/
nvm use                         # Node 20 (pinned in .nvmrc)
npm install
```

To run locally you need a `.env` file in `src/`. **Secrets are never committed** — all values live in the Vercel project's Environment Variables (Production). If you have Vercel access: `npx vercel link` then `npx vercel env pull`. Otherwise ask me and I'll share them through a secure channel. The variable names are listed in [CLAUDE.md](CLAUDE.md) under "Environment Variables"; the feature-flag variables are listed in §5 below.

```bash
npm run dev      # dev server (Turbopack) at localhost:3000
npm run test     # Jest suite
npm run build    # full production build (also runs prisma generate + migrations)
```

Deployment is automatic: **every push to `main` deploys to production** via Vercel. The build runs `prisma migrate deploy`, so schema migrations apply themselves on deploy — never remove that from the build script.

## 2. What this is

Two products in one codebase:

1. **Workshop management platform** (the original scope, replacing Kajabi): coaches request workshops through a self-service portal; admin/staff (Suzanne) review, approve, and manage the lifecycle from request through post-event follow-up — landing pages, registrations, Stripe payments, email workflows, surveys, files, financials.
2. **Assessment module** (the Esperto replacement, built March–July 2026): survey templates with versioning, campaigns, invitations, scored + qualitative respondent reports, group/cohort reports, peer benchmarks, findings/recommendations, conditional (show-if) questions, per-respondent longitudinal trends, and historical imports of Esperto data (SU-Full, LVA, Rockefeller Habits).

Stack: Next.js 16 (App Router, Turbopack) · TypeScript · PostgreSQL (Neon) + Prisma · NextAuth (JWT) · Stripe · HubSpot · Inngest · Upstash Redis · Azure Communication Services (email) · Tailwind + shadcn/ui · Vercel.

## 3. Where to read, in order

| Document | What it gives you |
|---|---|
| [CLAUDE.md](CLAUDE.md) | The living engineering reference: project context, current status, tech stack, source structure, API routes, data model, auth model, dev commands, deployment protocol, and every gotcha we've hit. Start here. |
| [plans/CHANGELOG.md](plans/CHANGELOG.md) | The full wave-by-wave build history, newest first. Every launch, every decision, every launch-walk verification is written up here. |
| [docs/adr/](docs/adr/) | 22 Architecture Decision Records for the assessment module (stableKey continuity, scored-vs-qualitative reports, import recompute-not-store, findings snapshots, etc.). These explain *why* the system is shaped the way it is. |
| [docs/specs/v7.6/](docs/specs/v7.6/) | The assessment spec library — one numbered spec per wave (currently through `19aa`). Each launched wave has its spec, run-sheet, and where relevant an ops runbook (e.g. `18o-ops-runbook.md` for imports). |
| [plans/JEFF_MAY6_SPRINT.md](plans/JEFF_MAY6_SPRINT.md) | The open sprint ledger for workshop-platform items. |
| `Scaling-Up-Progress-Update-2026-07-*.html/.pdf` (repo root) | The progress reports you've been receiving, committed for the record (Jul 1, 2, 3, 6, 7, 8). |
| Root `wave-*` / `report-*` / `roadmap-*` screenshots | Launch-walk evidence — the actual production screenshots behind each report claim. |

## 4. Current state (July 8, 2026)

**Every feature phase from your roadmap is live on production.** P1 (historical imports) closed July 7 with the LVA + Rockefeller import launch; P2–P7 were already live; P8 (hardening/observability) has shipped its major slices (import alerting, observability panel, publish gates, imported-badge) with a small ops ledger still open.

Recent waves at a glance (full detail in [plans/CHANGELOG.md](plans/CHANGELOG.md)):

| Wave | What shipped | Status |
|---|---|---|
| J | SU-Full group report (phase tile, peers columns, pseudonymized appendix) | Live (Jun 30) |
| L | LVA group-report Esperto fidelity | Live (Jun 29) |
| M / N | Coach-authored custom slides · per-respondent longitudinal trends | Live (Jun 30) |
| O | Historical Esperto **SU-Full** import (roster-first, recompute-not-store) | Live (Jul 2) |
| P | Your July-1 quick-fix batch (QSP/LVA v3 copy, coach-name fallback, invite chrome) | Live (Jul 2) |
| Q | Admin & coach controls (#1 results default, #6 disable templates, #7 remove admins) | Live (Jul 3) |
| R | Slider tap-to-set (#8) · full-width text answers (#4) · group-report printing (#9) | Live (Jul 3) |
| S | LVA peer benchmarks (#12/#13) — admin panel + both reports; ships empty until real numbers are entered | Live (Jul 4) |
| T | Question editor unlock — TEXT/NUMBER/MULTI_CHOICE authoring (#10) | Live (Jul 5) |
| U | Findings/recommendations logic (#11) — per-question rules, frozen at scoring, rendered on both report kinds | Live (Jul 6) |
| V | P8 hardening: import alerting cron → admin email, tier-domain publish gate, "Imported from Esperto" badge | Live (Jul 6) |
| W | Conditional (show-if) question authoring — the LVA-style "only explain what you picked" pattern on any instrument | Live (Jul 6) |
| X | Historical Esperto **LVA + Rockefeller** import — closes P1 | Live (Jul 7) |
| Y | Import observability panel (`admin/assessments/observability`) + preview/refusal signals | Live (Jul 7) |
| U3 | Findings/recommendations **in the results email** + editor test-a-value preview | Merged; email half is **dark** (flag off) pending your review of a sample — the Jul-8 report includes two rendered samples |

Test suite: **5,600 tests passing**. Seven failing suites are pre-existing, ledgered, and unrelated to shipped work (tracked in the CHANGELOG; none touch production behavior).

## 5. Feature flags on production

House rule (worth knowing when you read the code): **flags gate capability, never data correctness or enforcement.** Snapshots, audit rows, and security enforcement are always written/enforced unconditionally; a flag only controls whether the UI/feature is exposed. Turning a flag off never corrupts or loses data.

| Flag (Vercel Production env) | Feature | State |
|---|---|---|
| `WAVE_D_*` (4 flags: results email, auto-send, coach notify, custom HTML email) | Results-email pipeline | ON |
| `WAVE_F_GROUP_REPORT_ENABLED` | Group reports | ON |
| `WAVE_J_SUFULL_GROUP_ENABLED` | SU-Full group report | ON |
| `WAVE_M_CUSTOM_SLIDES_ENABLED` | Custom slides | ON |
| `WAVE_N_RESPONDENT_LONGITUDINAL_ENABLED` | Longitudinal trends | ON |
| `WAVE_O_ESPERTO_SUFULL_IMPORT_ENABLED` (+ `_HASH_SALT`) | SU-Full historical import | ON |
| `WAVE_P_INVITE_EMAIL_ENABLED` | Invite email chrome (logo, CTA) | ON |
| `WAVE_Q_ADMIN_CONTROLS_ENABLED` | Admin/coach controls | ON |
| `WAVE_S_PEER_BENCHMARKS_ENABLED` | LVA peer benchmarks | ON |
| `WAVE_T_QUESTION_EDITOR_ENABLED` | 4-type question authoring | ON |
| `WAVE_U_FINDINGS_ENABLED` | Findings on reports + editor panel | ON |
| `WAVE_V_IMPORT_ALERTING_ENABLED` | Import-failure alert emails (10-min cron) | ON |
| `WAVE_W_CONDITIONAL_AUTHORING_ENABLED` | Show-if authoring panel | ON |
| `WAVE_X_ESPERTO_LVA_ROCK_IMPORT_ENABLED` | LVA + Rockefeller import | ON |
| `WAVE_U3_EMAIL_FINDINGS_ENABLED` | Findings in the results email | **OFF (dark)** — flip after you approve the sample |

Most flags have a matching `_KILL` variant (instant off without unsetting) and some a `_CANARY` (org-scoped rollout). Waves R and the Wave Y panel are flagless (kill = revert commit). Env-var changes on Vercel require a redeploy to take effect.

## 6. Open items

**Waiting on you** (corrected July 8 — "LVA peer numbers" was dropped; it was never actually your ask, and the LVA peer panel correctly ships empty):

1. **SU-Full industry benchmarking** — your real open ask from `gabriel-feedback.docx`: build universally or report-specific? Needs a decision (and source numbers) before we build.
2. **#2.3 revised invite copy** — the reworded invitation text you wanted to supply.
3. **#15 / #16 / #19 wording clarifications** from the July-1 list.
4. **U3 email findings** — review the two sample emails in the Jul-8 report; on your OK we flip `WAVE_U3_EMAIL_FINDINGS_ENABLED` and recommendations appear in results emails.

**Committed next targets** (from the Jul-8 report roadmap): the three "coming soon" admin pages (Organizations / Campaigns / Public Quizzes — currently 404) built to the Phase-2 wireframes, and the templates-list View==Edit bug. Deferred by design: group-report/cohort findings (aggregation semantics need a product call — likely a conversation with you).

**Ops ledger** (lower-priority hardening, all tracked in CLAUDE.md "Current Status"): log-drain wiring for import alerts, org-canary page gating, a handful of workflow-email idempotency hardening items, and the `From Jeff/` git-history PII scrub.

## 7. Practical notes

- **Suzanne's flows** (approvals, refunds, cancellations) all run through the admin dashboard at `/admin/dashboard`; HITL notifications go by email (Azure), not Slack.
- **Imports:** admin/coach-operated under Assessments → Import. SU-Full, LVA, and Rockefeller historical Esperto exports are all supported; every import is observable at `admin/assessments/observability`, failures email `ADMIN_EMAIL` within ~10 minutes, and a rehearsed quarantine script (`src/scripts/wave-o-quarantine-import.ts`) can surgically remove a bad batch.
- **Published assessment versions are immutable** (DB-enforced). Content changes = new version; old campaigns keep their pinned version. `stableKey`s never change across versions (ADR-0001) — that's what keeps trends/longitudinal/crosswalks working.
- **Before pushing to `main`**, run the local build gate: `CI=true npx next build --turbopack` from `src/` (matches Vercel's pipeline), lint changed files, and run the tests. The full protocol is in CLAUDE.md § "Deployment Verification Protocol".

Questions on anything here — Slack me or gabriel@chiefaiofficer.com.
