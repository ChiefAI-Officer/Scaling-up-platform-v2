# Scaling Up Platform v2 — Vercel and Neon handoff runbook

- **Prepared:** 2026-07-21; refreshed 2026-07-23
- **Linear:** CHI-17
- **Source baseline:** `ChiefAI-Officer/Scaling-up-platform-v2` `main` at `38d9a0cd1c13fd7ffe4aae09ef6b0d6535b7e9e2`

**Execution status:** packet only — no project transfer, deployment, environment edit, billing change, secret read, or database operation has been performed.

This runbook prepares an owner-controlled separation of Scaling Up Platform v2 from the ChiefAIOfficer Vercel and Neon boundaries. It deliberately separates the Vercel ownership window from the Neon ownership/data window. The corresponding decision record is [scaling-up-v2-transfer-approval-packet.md](scaling-up-v2-transfer-approval-packet.md), and the names-only environment inventory is [scaling-up-v2-env-manifest.example.md](scaling-up-v2-env-manifest.example.md).

## 1. Authority and roles

| Role | Current person | Authority in this runbook |
|---|---|---|
| Source Vercel Owner / eligible executor | Josh (`josh-4119`, `josh@chiefaiofficer.com`) or Jeff Verdun (`jverdun-7897`, `jverdun@scalingup.com`) | Performs the approved Vercel transfer |
| Preparation operator | Gabriel (`gabriel-3497`) | Inventory, packet preparation, validation evidence; currently a source-team Member and cannot transfer the project |
| Destination Vercel Owner and billing owner | **Proposed:** Jeff Verdun | Creates/owns the destination `Scaling Up` Pro team, payment method, and accepts ongoing charges |
| Backup Vercel Owner / rollback owner | **Proposed:** Josh | Provides one paid backup Owner seat and calls rollback if exit criteria fail |
| Post-handoff CAIO operator | **Proposed:** Gabriel as free Viewer Pro; temporary Member only under separate approval, expiring after 30 days | Least-privilege validation access without a standing paid deployment seat |
| Source Neon Admin / eligible executor | Josh or Jeff — both verified Admins in the `Jeff Verdun` Neon organization | Selects retain/transfer/migration only in the separately approved database window |
| Current Neon billing owner | Jeff / Scaling Up client boundary | Current Launch plan has a client-held payment method; no payment details are recorded here |
| Destination Neon Admin and billing owner | **Proposed:** Jeff in a dedicated `Scaling Up` Launch organization; Josh as backup Admin | Owns the paid destination organization/project and database charges |
| Rollback decision-maker | **Proposed:** Josh | Calls rollback and has access in both source and destination boundaries |

Gabriel does not need elevated Vercel access to finish this preparation. Elevating him would broaden standing privilege without removing the need for a named client owner and billing approver.

## 2. Verified inventory and open evidence

Evidence labels: **live** = read-only provider observation refreshed on 2026-07-23; **source** = repository configuration at the baseline above; **open** = the executing owner must verify without exposing values in the ticket or repository.

| Surface | Current evidence | Status / action |
|---|---|---|
| Vercel source team | `ChiefAIOfficer` / `chief-aio-fficer` | **live** |
| Vercel project | `scaling-up-platform-v2`; ID `prj_xcAWuAmGZAU3DCHgAauRv2WPKneo`; root `src` | **live** |
| Production deployment | `dpl_CY5LeQ6niNyn4GWYxKwdz8JniUeo`, Ready when observed; created 2026-07-22 22:26 PHT | **live**; re-check immediately before the window |
| Production aliases | `platformtest.scalingup.com`, `scaling-up-platform-v2.vercel.app`, team and `git-main` aliases | **live** |
| Function region | `iad1` | **source**, also visible in deployment outputs |
| Node runtime | Vercel project reports `24.x`; repository `.nvmrc` pins `20` | **mismatch — decision required before any redeploy** |
| Git repository | `ChiefAI-Officer/Scaling-up-platform-v2`; default branch `main`; Gabriel has `MAINTAIN` | **live** |
| Build command | `prisma generate && node scripts/check-migration-safety.mjs && prisma migrate deploy && next build` | **source — deploys can mutate the database** |
| Cron jobs | stale approvals every 6h; scheduled emails every 15m; follow-up reports daily at 09:00 | **source**; verify transferred schedules after Vercel window |
| Analytics / Speed Insights | Both SDKs are mounted in the application | **source**; Vercel says project settings transfer |
| Vercel Blob | Application imports server and client Blob APIs; `BLOB_READ_WRITE_TOKEN` is provider-managed | **source**; store existence and separate transfer are **open** |
| Domains / DNS ownership | Project alias confirmed; root-domain registrar, DNS owner, and Vercel billing ownership unknown | **open** |
| Environment variable names/scopes | Source-derived names are in the manifest; live target scopes were not read | **open**; compare names and targets, never paste values |
| Integrations / Marketplace resources | HubSpot, Stripe, Circle, Inngest, SMTP/Teams, Typeform, Redis/KV and Blob are referenced by source | **source**; installation/resource ownership is **open** |
| Edge Config, log drains, Secure Compute/static IP, Sandboxes | No source configuration found | **open**; explicitly record `none` or inventory before transfer |
| Neon current organization/plan | `Jeff Verdun` (`org-withered-wildflower-24870377`), Launch; client-held billing is configured; spending limit is disabled | **live**; owner must decide whether this is the final isolated boundary |
| Neon roles | Josh and Jeff: Admin; Gabriel: Member | **live** |
| Neon project | `Scaling Up Platform` (`plain-term-58540461`), AWS US East 1, PostgreSQL 17, about 39 MB, one `production` branch | **live** |
| Neon compute/recovery | Active primary `ep-falling-sound-aiilz991`; autoscaling 0.25–8 CU; 6-hour history retention; no snapshots shown | **live**; restore rehearsal and recovery objective remain open |
| Neon provisioning/integration mode | Native Neon project; GitHub and Vercel integrations both show `Add` rather than installed | **live**; native retain/transfer is the relevant decision, not Marketplace transfer |

## 3. Current provider rules that shape the plan

Vercel requires the initiator to be an Owner of the source team and a Member of the destination team. The destination must have a valid payment method. Deployments, project environment variables, configuration, domains/aliases, builds, Git link, security settings, cron jobs, Web Analytics, Speed Insights and function region transfer with the project. Integrations, Edge Config, monitoring/log history, custom log drains, Blob, Secure Compute/static IPs, sandboxes/snapshots and Active Branches do not transfer with the project or need separate handling. See [Vercel — Transferring a project](https://vercel.com/docs/projects/transferring-projects).

As of the 2026-07-23 packet refresh, Vercel documents a $20/month Pro platform fee with one deploying seat and $20 usage credit included; each additional Owner or Member seat is $20/month, while Viewer Pro seats are free. The proposed Jeff + Josh Owner model therefore has a $40 fixed monthly base before usage/add-ons. A proposed $50 metered-spend amount is notification-only and excludes seats, integrations and add-ons; it must not automatically pause production. See [Vercel — Pro plan](https://vercel.com/docs/plans/pro-plan) and [Vercel — Spend Management](https://vercel.com/docs/spend-management).

Vercel Marketplace resources use a separate transfer operation. For supported database resources, including Neon, the destination team must first install the corresponding integration. See [Vercel — Transfer Marketplace resources between teams](https://vercel.com/changelog/transfer-marketplace-resources-between-teams).

A native Neon organization transfer requires source-org Admin and destination-org Member access, compatible destination limits/plan, and membership in both organizations. Neon does not support transferring projects that have GitHub or Vercel integrations installed, Vercel-managed organizations, or transfers to personal Neon accounts. See [Neon — Transfer projects](https://neon.com/docs/manage/orgs-project-transfer).

If direct transfer is ineligible, use a separately approved database migration. Neon advises using an unpooled connection for `pg_dump`; for larger datasets, use separate dump/restore files or logical replication rather than a fragile pipe. See [Neon — Migrate from another Neon project](https://neon.com/docs/import/migrate-from-neon).

Neon Launch is usage-based; the published reference rate is $0.106 per CU-hour and $0.35 per GB-month, with a typical intermittent 1 GB workload around $15/month. The packet keeps the current 0.25–8 CU autoscaling range and proposes $50 monthly alerts without automatic compute suspension. See [Neon — Pricing](https://neon.com/pricing).

## 4. Phase 0 — approvals and immutable evidence

The executor must stop unless every required field in the approval packet is signed and the following are captured in a private operations record:

1. Exact destination Vercel team name, slug, plan, payment owner, primary Owner and backup Owner.
2. Josh or Jeff is a Member of that destination team and remains Owner of the source team.
3. The ongoing CAIO operator is named (or explicitly `none`), with approved Vercel/Neon/GitHub roles, an access expiry, and a removal owner.
4. Destination project name is available, or a replacement name is explicitly approved.
5. Latest production deployment ID/status, aliases, production Git SHA, domain/DNS owner, and a screenshot/export of the transfer review screen.
6. Names and target scopes of Vercel environment variables; values remain in the provider and are never copied into this repository, Linear, Slack, screenshots, or the packet.
7. Explicit `none` or an inventory for integrations, Marketplace resources, Blob stores, Edge Config, log drains, Secure Compute/static IPs, and sandboxes.
8. Node runtime decision: align Vercel to the repo's Node 20 pin or approve/test Node 24 as the intended runtime.
9. A no-deploy freeze covering the Vercel window. Because the build runs `prisma migrate deploy`, no verification step may create a deployment without database-change authorization.
10. Neon source facts above are rechecked; the owner chooses whether the existing client-billed organization is the final boundary or a dedicated organization is required, then records the destination, recovery objective, restore evidence, access retention and chosen path — but the database window remains separate.

## 5. Window A — Vercel project ownership only

### Preflight

1. Announce the freeze and name the executor, observer and rollback decision-maker.
2. Confirm production is healthy at `https://platformtest.scalingup.com`; record a small, non-destructive smoke set (homepage/login page, one authenticated read if an approved test account exists, and one known API health/read path).
3. Confirm source and destination team memberships, destination payment method, project-name availability, and domain billing consequences.
4. Review Vercel's generated list of domains, aliases and environment variables. Compare names and target scopes with the manifest. Do not reveal values.
5. Record every non-transferred dependency and its owner. If Blob or a required integration has no approved transfer/reinstall plan, stop.

### Owner execution

1. Josh or Jeff opens Project Settings → General → Transfer Project.
2. Select the approved destination team and approved project name.
3. Review the generated transfer summary against the evidence record.
4. Initiate the transfer. Do not deploy, edit settings, or delete anything while Vercel reports the transfer in progress.
5. Wait for Vercel to report completion and for the destination Owners to receive confirmation.

### Validation without deployment

1. Confirm the project appears under the destination team and retains the project ID/name expected by the transfer screen.
2. Confirm all aliases resolve and the existing production deployment remains Ready.
3. Confirm Git link/default production branch, root directory, function region, security settings, cron schedules, Web Analytics and Speed Insights.
4. Compare environment variable **names and target scopes only** against the private preflight inventory.
5. Reinstall/transfer separately approved integrations and resources. Transfer Blob/Marketplace resources only under their explicit approvals.
6. Repeat the preflight smoke set. Do not redeploy merely to test ownership.
7. Record destination URLs, timestamp, results, exceptions and remaining resource work in CHI-17.

### Vercel rollback

Rollback is a second transfer, not an instant undo. The approved rollback decision-maker must call it if the production aliases fail, required configuration is missing, or a critical non-transferred dependency cannot be restored inside the window. Preserve membership and a valid payment method in both teams until the exit criteria pass. The destination Owner transfers the project back to `ChiefAIOfficer`; then validate the same aliases and smoke set. Do not delete the destination team or change domain ownership during the rollback window.

## 6. Window B — Neon ownership/data, separately approved

### Choose exactly one path

| Observed provisioning mode | Approved path |
|---|---|
| Native Neon project, no GitHub/Vercel integration, compatible organizations | Neon organization project transfer |
| Neon database provisioned as a supported Vercel Marketplace resource | Separate Vercel Marketplace resource transfer after installing Neon in the destination team |
| Ineligible direct transfer, destination region/version must change, or client requires a new security boundary | New client-owned Neon project plus controlled data migration |

Do not detach an integration simply to make a project eligible unless the approval packet separately authorizes the outage/risk, reconnection owner and rollback.

### Database preflight

1. Freeze schema changes and data-destructive operations; announce the write/cutover policy.
2. Record source/destination identifiers, Postgres versions, regions, extensions, roles/grants, branches, size and connection mode.
3. Verify a restorable backup/snapshot and run a restore rehearsal in an authorized non-production boundary.
4. Record row-count/checksum probes for critical tables and the Prisma migration status.
5. Prepare new pooled `DATABASE_URL` and unpooled `DIRECT_URL` values privately. Never place them in this repository or ticket.
6. Pre-authorize credential rotation, Vercel environment edits and the single post-cutover deployment; those are not authorized by this packet alone.

### Native transfer or Marketplace resource transfer

The eligible Admin/Owner performs the provider transfer in the approved UI, verifies the project/resource in the destination, confirms compute health and connection strings, and records whether credentials changed. If URLs did not change, still validate both pooled and direct connections. If URLs changed, continue through the controlled environment update below.

### Migration path

1. Create the client-owned destination project with the approved plan, region and Postgres version.
2. Use an unpooled source connection for the dump. Select Import Data Assistant, separate `pg_dump`/`pg_restore`, or logical replication according to measured database size and downtime objective.
3. Restore and validate schema, migration table, extensions, roles, critical row counts/checksums and application read/write probes in an authorized non-production or maintenance context.
4. During the cutover, pause writes/jobs as approved, perform the final sync, rotate both `DATABASE_URL` and `DIRECT_URL`, then create exactly one authorized deployment.
5. Validate application smoke paths, background jobs, Stripe/Typeform webhook persistence, cron behavior and Prisma migration status.

### Database rollback

Keep the source database intact, paid and access-controlled until the retention/rollback period expires. Before cutover, rollback means resume the source without changing Vercel. After connection rotation, rollback means restore the prior two database variables and redeploy the last known-good application under the pre-authorized window, then reconcile any writes made after cutover. A direct organization/resource transfer can be reversed only if the reverse transfer remains eligible and both sides retain the required roles.

## 7. Post-handoff access cleanup — after rollback retention

Project ownership is separate from a local browser or CLI login. This repository tracks no `.vercel` project link and ignores `.vercel` plus `.env*` files; the checked-in `.env.example` contains placeholders only. Do not remove working access during either change window or its rollback period.

After both approved windows pass their exit criteria and the rollback-retention period expires, the client owner reviews Vercel, Neon, GitHub and integration access. They then separately authorize any demotion/removal of ChiefAIOfficer personnel, revoke credentials created only for the change, and confirm the named CAIO operator's least-privilege role and expiry. Browser/CLI logout or local link cleanup does not substitute for provider-side membership and credential review. No access removal is authorized by this packet alone.

## 8. Universal stop conditions

Stop and escalate if any of these is true:

- Destination team/org, billing owner, primary owner, backup owner, CAIO operator decision or rollback decision-maker is unnamed.
- The executor lacks the provider role required by current provider rules.
- Vercel shows a domain, environment variable, integration or resource that is absent from the inventory.
- Destination payment is invalid or a paid feature/resource has no cost approval.
- A required Blob/Marketplace/Edge Config/log-drain/network dependency has no transfer plan.
- The Node 20/24 mismatch is unresolved and any deploy would occur.
- Any command or UI action would deploy the app or run `prisma migrate deploy` during Window A.
- The Neon retain-versus-dedicated-org decision, destination (if any), backup/restore proof, recovery objective, access-retention plan, or rollback policy is unknown.
- Production health is already degraded or the observed deployment/Git SHA changed after approval without a new review.

## 9. Exit evidence

The executing owner posts a redacted CHI-17 comment containing the change-window timestamp, executor, source/destination identifiers, project/deployment IDs, alias results, smoke results, names-only environment comparison, separately handled resources, Neon path/result (only if Window B was independently approved), rollback status, and any follow-ups. Secrets, tokens, connection strings, customer data and billing details must not be included.
