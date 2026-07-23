# Scaling Up Platform v2 — transfer approval packet

- **Prepared:** 2026-07-21; refreshed 2026-07-23
- **Change request:** CHI-17

**Requested decision:** approve preparation and name the people/targets below. This document does **not** authorize a live transfer, deployment, environment edit, secret retrieval, billing change, or database operation.

## Decision summary

Approve two independent change windows:

1. **Window A — Vercel ownership:** an existing source-team Owner transfers only `scaling-up-platform-v2` from `ChiefAIOfficer` to a named client-owned Vercel Pro team. The production deployment and database stay unchanged; validation must not create a deployment.
2. **Window B — Neon ownership/data:** after a separate inventory and approval, a Neon Admin uses the eligible native-org transfer, Vercel Marketplace resource transfer, or controlled migration path. This window may rotate database credentials and deploy only if explicitly authorized.

`caio-rev-try` and other ChiefAIOfficer projects are out of scope and remain in the source team.

## Current verified facts

| Item | Fact |
|---|---|
| Source repo/baseline | `ChiefAI-Officer/Scaling-up-platform-v2` `main` at `38d9a0cd1c13fd7ffe4aae09ef6b0d6535b7e9e2` |
| Source Vercel team/project | `chief-aio-fficer` / `scaling-up-platform-v2` |
| Project ID/root | `prj_xcAWuAmGZAU3DCHgAauRv2WPKneo` / `src` |
| Primary production alias | `https://platformtest.scalingup.com` |
| Current source-team executor options | Josh (`josh-4119`) or Jeff Verdun (`jverdun-7897`) — both observed as Owners |
| Preparation operator | Gabriel (`gabriel-3497`) — observed as Member; transfer permission unavailable by design |
| Database coupling | Every production build runs `prisma migrate deploy`; Prisma requires pooled and direct URLs |
| Known runtime discrepancy | Vercel reports Node 24.x; repository `.nvmrc` pins Node 20 |
| Neon ownership | Native Neon organization `Jeff Verdun` (`org-withered-wildflower-24870377`); Josh and Jeff are Admins, Gabriel is a Member |
| Neon project | `Scaling Up Platform` (`plain-term-58540461`), AWS US East 1, PostgreSQL 17, one `production` branch |
| Neon plan/billing | Launch; client-held payment method and billing identity are present; organization spending limit is not enabled |
| Neon integration/scale | No GitHub or Vercel integration installed; about 39 MB stored; autoscaling is configured for 0.25–8 CU; history retention is 6 hours |

## Approval fields — required before scheduling

### Window A — Vercel

| Decision | Approved value / signature |
|---|---|
| Destination team display name | **Proposed:** `Scaling Up`; owner acceptance: __________ |
| Destination team slug | **Proposed:** `scaling-up-platform`; availability/acceptance: __________ |
| Destination plan and valid payment method confirmed by | **Proposed:** Pro; Jeff / client billing owner: __________ |
| Primary destination Owner | **Proposed:** Jeff Verdun (`jverdun-7897`); acceptance: __________ |
| Backup destination Owner | **Proposed:** Josh (`josh-4119`); acceptance: __________ |
| Post-handoff CAIO operator (`none` allowed) | **Proposed:** Gabriel as free Viewer Pro; elevated Member only under separate approval |
| CAIO access roles, expiry and removal owner | Viewer by default; any temporary Member role expires 30 days after transfer; removal owner: Josh |
| Source Owner / transfer executor (Josh or Jeff) | **Proposed:** Jeff; acceptance: __________ |
| Rollback decision-maker | **Proposed:** Josh; acceptance: __________ |
| Approved project name in destination | **Proposed:** retain `scaling-up-platform-v2`; acceptance: __________ |
| Root-domain/DNS owner and domain billing accepted by | __________________________________ |
| Paid Vercel feature/resource ceiling accepted by | **Proposed:** 2 Owner seats = $40 fixed monthly base; $50 metered-spend amount, notifications only, no automatic production pause; no add-ons; client acceptance: __________ |
| Node runtime decision | **Proposed:** retain current 24.x during no-deploy transfer; reconcile `.nvmrc` separately before a later deploy; approver: __________ |
| Change window (timezone included) | __________________________________ |
| Rollback deadline / maximum window | __________________________________ |
| No-deploy freeze owner | **Proposed:** Josh; acceptance: __________ |
| Live Vercel transfer authorized | ☐ yes ☐ no — approver/date: __________________ |

### Resource exceptions — each must be `none`, `defer with no impact`, or separately approved

| Resource | Inventory owner | Disposition / approver |
|---|---|---|
| Integrations and Marketplace resources | __________ | __________________________________ |
| Vercel Blob store(s) | __________ | __________________________________ |
| Edge Config | __________ | __________________________________ |
| Monitoring/log history and custom log drains | __________ | __________________________________ |
| Secure Compute/static IPs | __________ | __________________________________ |
| Sandboxes/snapshots | __________ | __________________________________ |
| Domain registrar/root DNS | __________ | __________________________________ |

### Window B — Neon (a separate approval; do not sign by implication from Window A)

| Decision | Approved value / signature |
|---|---|
| Provisioning mode | ☑ native Neon organization; no Marketplace provisioning observed |
| Source org/project IDs and source Admin | `org-withered-wildflower-24870377` / `plain-term-58540461`; Josh or Jeff (Admin) |
| Destination org/project IDs | **Proposed:** dedicated `Scaling Up` Neon organization; retain project ID `plain-term-58540461` through native transfer; destination org ID assigned after separately approved creation |
| Destination plan, region, Postgres version | **Proposed:** Launch / AWS US East 1 / PostgreSQL 17; acceptance: __________ |
| Destination Admin and billing owner | **Proposed:** Jeff primary Admin/billing owner; Josh backup Admin; acceptance: __________ |
| Neon cost controls | **Proposed:** keep autoscaling at 0.25–8 CU; $50 monthly spending-limit alerts; no automatic compute suspension; acceptance: __________ |
| Integration status | ☑ none installed ☐ GitHub ☐ Vercel ☐ Marketplace-managed |
| Selected path | **Proposed:** native project transfer to the dedicated organization; no dump/restore migration |
| Measured size / recovery objective / write downtime | About 39 MB; proposed 7-day restore window; no planned write downtime; stop if provider preview indicates endpoint or availability change |
| Restore rehearsal evidence location | __________________________________ |
| Credential rotation owner | **Proposed:** Jeff; no rotation unless transfer preview requires it |
| Vercel env update + deploy executor | **Proposed:** Josh; not expected for native transfer and separately approval-gated if required |
| Data reconciliation owner after rollback | **Proposed:** Josh |
| Source retention period and deletion approver | Not applicable to native same-project transfer; no deletion authorized |
| Post-handoff CAIO Neon role/expiry (`none` allowed) | **Proposed:** Gabriel Member through 30 days after transfer, then remove unless renewed by Jeff |
| Change window (timezone included) | __________________________________ |
| Live Neon operation and resulting deploy authorized | ☐ yes ☐ no — approver/date: __________ |

## Cost and ownership acknowledgements

The approvers acknowledge that the destination Vercel team requires a valid payment method; domains bought through Vercel may change which team is billed; usage resets on project transfer; optional paid feature matching may be offered; and separately transferred resources can carry their own charges. The destination Neon organization has its own plan/billing boundary and must be compatible with the source project or sized for a new migration target.

| Acknowledgement | Name / date |
|---|---|
| Client accepts destination Vercel plan, domain and resource charges | __________________________________ |
| Client accepts destination Neon plan and usage charges | __________________________________ |
| ChiefAIOfficer accepts the approved source-retention period and eventual removal | __________________________________ |
| Client accepts the named CAIO operator, least-privilege roles and expiry/removal plan | __________________________________ |

## Go/no-go gate

**GO** only when all required fields for the applicable window are filled, the executor has the required provider role, the immutable preflight evidence in the [handoff runbook](scaling-up-v2-vercel-neon-handoff.md) is current, every exception has a disposition, and rollback is executable by a named person.

**NO-GO** for Window A if a deploy would be needed to validate the transfer. **NO-GO** for Window B if Neon provisioning/integration status or restore proof is unknown. A changed production deployment, source SHA, provider rule, plan, project configuration, or destination identity after approval requires a refreshed review.

## Prepared-by attestation

This packet was assembled from repository configuration, read-only Vercel observations, and current official provider documentation. No secret values were copied, and no live provider state was modified.

Prepared by: Gabriel / Codex support

Preparation date: 2026-07-21; refreshed against current source/provider read-only evidence on 2026-07-23

Review status: pending designated owner and client approvals
