# Spec 17 Wave G — Survey UX + Invite Defaults + QSP-v2 Re-seed — Ops Runbook

> Launch order / rollback / observability for Wave G. Companion to
> [17g plan](17g-wave-g-survey-ux-plan.md).

## Scope (READ FIRST)

Wave G ships as **three INDEPENDENT rollback units** — three separate PRs / deploys.
The work is **additive: NO migration, NO feature flag.** Because there is no flag, a
**separate PR/deploy IS the rollback boundary** — Vercel **promote-previous** reverts ONLY
that PR's deploy, leaving the others untouched.

| Unit | Branch | What it touches | Blast radius | State |
|---|---|---|---|---|
| **PR-1** | `feat/wave-g-pager` | Pager merge (each section's intro + its questions on ONE page) + section-heading keyboard focus ring | **Highest** — shared `SectionPager` → live public `/quiz` AND invited org-survey | None (UI only) |
| **PR-2** | `feat/wave-g-invite-default` | Default invitation body + subject at the send chokepoint + legacy-renderer subject hardening + send telemetry | Email send paths (all assessments) | None (no DB write) |
| **PR-3** | `feat/wave-g-qspv2-desc` | QSP v2 closing-section description re-seed (DRAFT only) | One template's DRAFT version | **DB write** — code revert does NOT undo it |

**G1 decision:** the pager merge applies **UNIFORMLY**, including the live public Quick
Assessment quiz — there is no per-consumer toggle.

## Launch order (recommended)

All three are independent; ship in **PR-1 → PR-2 → PR-3** order so the highest-risk shared-UI
change lands and is smoke-tested first, then the email change, then the (separately-published)
seed.

1. **PR-1 (pager)** — ship, run the BOTH-consumers smoke (below), watch submit-error /
   validation-block signals through one full send window.
2. **PR-2 (invite defaults)** — ship, run the telemetry breakdown query during the next send
   window to confirm `renderer`/`subjectSource`/`bodySource` distribution looks sane.
3. **PR-3 (QSP-v2 re-seed)** — run the seed (NOT on deploy), record the MANIFEST. Publish stays
   a **separate manual admin step** — merging/seeding publishes nothing.

---

## PR-1 — Pager merge + section focus ring

### Pre/post-deploy smoke — run on BOTH consumers

The same `SectionPager` powers both flows, so verify both:

- **Public quiz:** `/quiz/<alias>` (e.g. the live Scaling Up Quick Assessment public URL).
- **Invited org-survey:** an invited campaign's `/org-survey/<alias>` link.

For each:

1. Each section's intro + its questions render on **ONE** page; **one Next per section** advances.
2. **Required-field block** fires on Next with a miss, and focus **moves to the first invalid** field.
3. **Back** returns to the prior section with answers intact.
4. **Submit** on the last section completes and shows results.
5. **Keyboard focus ring** is visible on the section heading (tab/landing focus).

### Abort threshold

Any smoke failure, OR a spike in submit-error / validation-block signals after deploy →
**promote-previous PR-1 ONLY.** Email (PR-2) and the seed (PR-3) are unaffected.

### Rollback

`promote-previous` the PR-1 deploy. **No DB state** to reconcile — clean revert.

---

## PR-2 — Invitation defaults + send telemetry

### Behavior

- Source of truth for the defaults: `src/src/lib/assessments/invitation-defaults.ts`
  (`DEFAULT_INVITATION_SUBJECT`, `DEFAULT_INVITATION_BODY`, `DEFAULT_INVITATION_VERSION`).
- The substitution happens at the **single send chokepoint** `sendAssessmentInvitationEmail`
  (`src/src/services/notifications.ts`) — so it covers **ALL** send paths: initial / reminder /
  resend / auto-send all call this one function.
- **Blank** = null / undefined / whitespace-only (checked via `.trim().length === 0`, NOT `??`
  — an empty string `""` is present-but-blank and must still take the default).
  - Blank `invitationSubject` → `DEFAULT_INVITATION_SUBJECT`; authored values pass through.
  - Blank `invitationBodyMarkdown` → `DEFAULT_INVITATION_BODY`; authored values pass through.
- **Custom-HTML (#20) campaigns bypass the BODY default** (the full-HTML override replaces the
  whole body) — but the **SUBJECT still defaults** (subject always comes from `invitationSubject`,
  never the HTML body).

### Telemetry (PII-FREE)

Each send emits four Wave-G fields alongside the existing `type`/`campaignId`/`invitationId`/`respondentId`:

| Field | Values | Meaning |
|---|---|---|
| `renderer` | `branded` \| `legacy` \| `custom_html` | which renderer produced the email |
| `subjectSource` | `authored` \| `default` | did the subject default fill a blank |
| `bodySource` | `authored` \| `default` \| `custom_html` | did the body default fill a blank (or is it a full-HTML override) |
| `defaultVersion` | `"wave-g-1"` \| `null` | non-null whenever EITHER subject or body used a default |

The fields carry **no PII** — only the renderer name + source enums + version string.

### Where the telemetry actually GOES (the real sink)

> **The sink is a real, queryable DB table — NOT just a log line.**

Path: `sendAssessmentInvitationEmail` → `sendEmailViaSMTP` (`src/src/lib/smtp-transport.ts`)
→ `recordDeliveryTelemetry` (`src/src/lib/delivery-telemetry.ts`) → **`db.auditLog.create`**.

It is written to the **`audit_logs`** table (Prisma model `AuditLog`) as:

| Column | Value for an invitation send |
|---|---|
| `entityType` | `"EMAIL_DELIVERY"` |
| `entityId` | `"unscoped"` (invitation sends carry no `workflowStepId`/`workshopId`, so the fallback applies) |
| `action` | the delivery status: `SENT` \| `FAILED` \| `MOCK` \| `SKIPPED` |
| `performedBy` | `"SYSTEM"` |
| `changes` | a **JSON string** holding `recipient`, `recipientRole`, `subject`, `provider`, `errorMessage`, a `timestamp`, and a nested **`metadata`** object — the Wave-G fields (`type`, `campaignId`, `invitationId`, `respondentId`, `renderer`, `subjectSource`, `bodySource`, `defaultVersion`) live inside `changes.metadata`. |
| `timestamp` | send time |

**Caveats (must know before querying):**

- The Wave-G fields are **NOT first-class columns** — they are inside the `changes` **text/JSON
  string** under `.metadata`. Queries must JSON-extract from `changes`.
- `recordDeliveryTelemetry` is **best-effort**: it wraps the insert in try/catch and on failure
  only `console.error`s (`"[delivery-telemetry] failed to persist event"`) — telemetry must
  never break delivery. So a telemetry row can be **missing** even though the email sent. Do not
  treat row count as a perfect send count; cross-check against `AssessmentInvitation.sentAt`.
- The legacy renderer (kill-switch on) writes `type: "assessment_invitation_legacy"` and
  `renderer: "legacy"`; the branded path writes `type: "assessment_invitation"`. Filter on
  both `type` values to capture all invitation sends.
- The recipient email IS stored (`changes.recipient`) — that row is PII; the Wave-G
  *metadata fields* are not, but the surrounding audit row is. Treat `audit_logs` as PII.

### Example queries (SQL over `audit_logs`)

Postgres JSON note: `changes` is a TEXT column holding JSON, so cast `changes::jsonb` first.

**(a) Break down sends by renderer / source during a rollout window:**

```sql
SELECT
  changes::jsonb -> 'metadata' ->> 'renderer'      AS renderer,
  changes::jsonb -> 'metadata' ->> 'subjectSource' AS subject_source,
  changes::jsonb -> 'metadata' ->> 'bodySource'    AS body_source,
  changes::jsonb -> 'metadata' ->> 'defaultVersion' AS default_version,
  action AS status,                       -- SENT / FAILED / MOCK / SKIPPED
  count(*)
FROM audit_logs
WHERE entity_type = 'EMAIL_DELIVERY'
  AND changes::jsonb -> 'metadata' ->> 'type' IN ('assessment_invitation','assessment_invitation_legacy')
  AND timestamp >= now() - interval '24 hours'
GROUP BY 1,2,3,4,5
ORDER BY count DESC;
```

> Column names: this repo's `audit_logs` maps `entityType`→`entity_type`. Confirm exact physical
> column names against your Neon schema if the snake-case mapping differs.

**(b) Find invitations stuck `PENDING` (queued/created but never confirmed sent):**

This is best answered directly off the invitation table, not telemetry:

```sql
SELECT id, campaign_id, respondent_id, created_at, sent_at, status
FROM assessment_invitations
WHERE status = 'PENDING'        -- never advanced past creation
  AND sent_at IS NULL           -- and never stamped as sent
  AND created_at < now() - interval '30 minutes'
ORDER BY created_at;
```

Cross-reference a suspected stuck invitation against the telemetry `FAILED` rows by
`invitationId`:

```sql
SELECT timestamp, action, changes::jsonb -> 'metadata' ->> 'invitationId' AS invitation_id,
       changes::jsonb ->> 'errorMessage' AS error
FROM audit_logs
WHERE entity_type = 'EMAIL_DELIVERY'
  AND action = 'FAILED'
  AND changes::jsonb -> 'metadata' ->> 'invitationId' = '<invitation-id>'
ORDER BY timestamp DESC;
```

### AssessmentInvitation status model (brief)

`AssessmentInvitation.status` enum: **`PENDING` → `SENT` → `VIEWED` → `SUBMITTED`** (DB enum
`AssessmentInvitationStatus`). There is **no `REVOKED` enum value** — revocation is tracked by
the `revokedAt` timestamp (the display "revoked" band is derived from `revokedAt`, not the
enum). Relevant timestamps: `sentAt` (stamped on a successful send), `submittedAt`, `revokedAt`,
plus `resentCount` / `lastResentAt`. The send path is **strict** — `sendAssessmentInvitationEmail`
throws on SMTP failure and the invite route marks the row send-failed rather than optimistically
flipping `status` to `SENT`, so a `PENDING` + `sentAt IS NULL` row is genuinely never-sent.

### Alerts

- **Page** on a spike in `action = 'FAILED'` EMAIL_DELIVERY rows (send/render failures).
- **Warn** on a non-zero count of stuck `PENDING` (`sentAt IS NULL`) invitations measured
  **after** a send window has closed (query (b)).

### Kill-switch

Set **`ASSESSMENT_INVITE_BRANDED=0`** on Vercel Production + redeploy → reverts to the legacy
plain renderer. Note the legacy renderer is **also Wave-G-hardened**: it now **applies the same
defaults** AND routes its subject through the **safe allowlist** (`renderSubject` — allowlist +
control-char / `#t=` stripping), closing the old credential-in-subject leak. So the kill-switch
changes the *look* of the email, not the default-fill or subject-safety behavior.

### Rollback

`promote-previous` the PR-2 deploy (or flip the kill-switch for an instant look-revert).
**No DB state** — clean revert.

---

## PR-3 — QSP v2 closing-section description re-seed (DB WRITE)

> **A code revert does NOT undo this** — it writes a new row. Rollback is a DB operation.

### What it does

Appends a **NEW DRAFT version** of the QSP v2 template (alias `qsp-v2`) carrying the updated
closing-section description. The seed is **fail-closed**: a divergent unpublished DRAFT **aborts
by default** (`runSeed(client, { force = false })`); superseding an existing divergent DRAFT
requires an **explicit, audited `force: true`**.

- **Publish stays a SEPARATE manual admin step.** Seeding/merging publishes nothing — existing
  campaigns keep their pinned version; the new DRAFT reaches no respondent until an admin
  reviews + clicks Publish (per the 09b publish-review checklist).
- **Never auto-run on deploy.** Run it as a deliberate, recorded operation.

> Accuracy note: today's `runSeed` in `src/prisma/seed-qsp-v2-assessment.ts` calls
> `ensureTemplateVersionContent(..., { forceSupersedeDraft: true })` **hardcoded**. The
> fail-closed `runSeed(client, { force = false })` signature above is the **Wave G PR-3
> behavior** — moving QSP v2 off the hardcoded supersede. (Harmonizing the other three seeds'
> hardcoded `forceSupersedeDraft` is explicitly deferred — see below.)

### Required seed-run MANIFEST (record BEFORE and AFTER the run)

Capture and store these so rollback is unambiguous:

| Field | How |
|---|---|
| **DB fingerprint** | the Neon DB host / database name the run targeted (confirm it is PROD) |
| **Commit SHA** | the deploy/commit the seed was run from |
| **Template alias** | `qsp-v2` |
| **New version id** | the `versionId` returned by `runSeed` |
| **New version number** | the version's sequential number |
| **Content hash** | the `contentHash` returned (sha256 of the canonical content) |
| **PITR timestamp** | a UTC timestamp captured **immediately before** the seed run, for Neon point-in-time-restore |

### Rollback

1. **Re-verify** the recorded DRAFT version is **still unpublished** AND
   **campaign-unreferenced** (no `AssessmentCampaign` pins it).
2. If both hold → **delete ONLY that DRAFT row** (the recorded `versionId`).
3. If the check **fails** (it was published or got referenced) → do **NOT** delete; **restore via
   Neon PITR** to the recorded pre-run PITR timestamp.

Never auto-run the seed on deploy; never delete a version that is published or campaign-referenced.

---

## Deferred / known (NOT blockers for this wave)

From the Wave G plan:

1. **Question-less pager pages** — removing the Welcome / Completion pager pages that have no
   questions (cosmetic pager cleanup) is deferred.
2. **#29 LVA content reconcile** — the LVA assessment content reconcile (financials present-tense
   wording + section intros) remains a separate forward-only re-seed awaiting Jeff.
3. **Harmonize the other three seeds' hardcoded `forceSupersedeDraft`** — only QSP v2 moves to the
   fail-closed `force=false` signature this wave; the LVA / QSP-v1 / Five-Dysfunctions /
   Scaling-Up-Quick seeds still pass `forceSupersedeDraft: true` hardcoded and should be brought
   in line later.
