# Scaling Up Platform v2 — transfer approval packet

- **Prepared:** 2026-07-21
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
| Source repo/baseline | `ChiefAI-Officer/Scaling-up-platform-v2` `main` at `2c15f6125007b1fedc3e5581e2c333bb23b2cd11` |
| Source Vercel team/project | `chief-aio-fficer` / `scaling-up-platform-v2` |
| Project ID/root | `prj_xcAWuAmGZAU3DCHgAauRv2WPKneo` / `src` |
| Primary production alias | `https://platformtest.scalingup.com` |
| Current source-team executor options | Josh (`josh-4119`) or Jeff Verdun — both observed as Owners |
| Preparation operator | Gabriel (`gabriel-3497`) — observed as Member; transfer permission unavailable by design |
| Database coupling | Every production build runs `prisma migrate deploy`; Prisma requires pooled and direct URLs |
| Known runtime discrepancy | Vercel reports Node 24.x; repository `.nvmrc` pins Node 20 |
| Neon history | Repository history records a Launch upgrade on 2026-07-20; live org/project/provisioning mode remains unverified |

## Approval fields — required before scheduling

### Window A — Vercel

| Decision | Approved value / signature |
|---|---|
| Destination team display name | __________________________________ |
| Destination team slug | __________________________________ |
| Destination plan and valid payment method confirmed by | __________________________________ |
| Primary destination Owner | __________________________________ |
| Backup destination Owner | __________________________________ |
| Post-handoff CAIO operator (`none` allowed) | __________________________________ |
| CAIO access roles, expiry and removal owner | __________________________________ |
| Source Owner / transfer executor (Josh or Jeff) | __________________________________ |
| Rollback decision-maker | __________________________________ |
| Approved project name in destination | `scaling-up-platform-v2` / other: __________________ |
| Root-domain/DNS owner and domain billing accepted by | __________________________________ |
| Paid Vercel feature/resource ceiling accepted by | __________________________________ |
| Node runtime decision | ☐ align to 20 before next deploy ☐ retain/test 24; approver: __________ |
| Change window (timezone included) | __________________________________ |
| Rollback deadline / maximum window | __________________________________ |
| No-deploy freeze owner | __________________________________ |
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
| Provisioning mode | ☐ native Neon org ☐ Vercel Marketplace ☐ other: __________ |
| Source org/project IDs and source Admin | __________________________________ |
| Destination org/project IDs | __________________________________ |
| Destination plan, region, Postgres version | __________________________________ |
| Destination Admin and billing owner | __________________________________ |
| Integration status | ☐ none ☐ GitHub ☐ Vercel ☐ Marketplace-managed |
| Selected path | ☐ native transfer ☐ Marketplace resource transfer ☐ migration |
| Measured size / recovery objective / write downtime | __________________________________ |
| Restore rehearsal evidence location | __________________________________ |
| Credential rotation owner | __________________________________ |
| Vercel env update + deploy executor | __________________________________ |
| Data reconciliation owner after rollback | __________________________________ |
| Source retention period and deletion approver | __________________________________ |
| Post-handoff CAIO Neon role/expiry (`none` allowed) | __________________________________ |
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

Preparation date: 2026-07-21

Review status: pending designated owner and client approvals
