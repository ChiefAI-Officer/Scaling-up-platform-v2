# 12 — Esperto historical-data import: design (Ask 2)

> **Status:** 🟢 **Design approved (brainstormed + grilled).** Supersedes the verdict gate in [11-esperto-import-feasibility.md](./11-esperto-import-feasibility.md). No code until this spec → an implementation plan → explicit go-ahead.
> **Scope:** Importing a company's pre-existing Esperto ("Scaling Up Toolkit") assessment data — **people first, then their past results** — into the platform so coaches see historical results alongside new ones.
> **Related:** [11 feasibility memo](./11-esperto-import-feasibility.md) (the gate this resolves) · [CONTEXT.md](../../../CONTEXT.md) "Historical import" terms · [ADR-0006](../../adr/0006-imported-campaigns-are-closed-campaigns.md) (imported campaigns are closed campaigns) · [09b publish-review](./09b-publish-review-checklist.md) §C (SU Full provisional gate).

---

## 1. What changed since the feasibility memo

Memo 11 assumed Esperto exports carry **no identity** and concluded Path B (anonymous) or Path C (don't import). Jeff's **June 4** emails provided three new **identity-bearing** exports (decoded at `From Jeff/Exports/_extracted/`), which flip the verdict:

| Export | What it carries |
|---|---|
| **Members** (`ABC Corp Exec Team_Members.json`) | Per-person `email`, `firstname`/`lastname`, `title`, `level` (Esperto Level), `memberid`, `testuser`, `status`. Company name in the **filename** only. |
| **Report** (`… QSP v2 … _Reports.json`) | Per-respondent rows with `variant` (template), `campaignid`, `memberid`, ISO `date`, and `raw_Q*`/`processed_Q*` per-question answers. |
| **Restricted SU Full** (`Individual CEO_…` + `Aggregate_…`) | CEO per-question `raw` + verbatim score (`indexTotal`, `totalPoints`); team data exists only as lossy `group*` min/avg/max — **non-CEO per-person answers are unrecoverable**. |

A 5-agent read-only analysis verified these against our seeds. Headline: **QSP v2 is a fully viable identified ("Path A") import today; SU Full is blocked three ways and parked.**

## 2. Verified findings (the resolved verdict)

| Memo-11 blocker | Verdict | Evidence |
|---|---|---|
| #1 org/coach identity | ⚠️ Partial | Company name only in filename; **no coach anywhere** → operator supplies the owning coach. |
| #2 respondent identity | ✅ Solved | Members roster: `email` + names + `title` + `level` + `memberid`. |
| #3 campaign linkage | ✅ Solved | Report rows carry `campaignid` (QSP `BDvhuDORxZ`) / `cid`; `variant` = template; join `memberid`↔`memberid`↔`mid`. |
| #4 stableKey crosswalk | ⚠️ Authorable | Exports carry Q-codes, **no question text** → hand-authored per template. QSP: 22/22 map 1:1. SU Full: 4 of 10 families locked by unique item-count; 6 count-tied families need labeled Esperto text. |
| #5 value encoding | ✅ Known | QSP: 0–10 int sliders + free TEXT; SU Full: 0–10. (QSP slider scale in our seed is **`min:1`** — see §6.3.) |
| #6 result provenance | ✅ Split | QSP has no Esperto score → recompute via `scoreSubmission` (matches live submit path). SU Full carries verbatim `indexTotal` → must store verbatim. |
| #7 published-version dep | 🔴 Blocks SU Full | SU Full version is DRAFT by design (09b §C); `resolvePublishedTemplateVersion` throws → no campaign → no submission. |

**Identity map** is clean with guards (§6.1). Esperto `level` slugs `ceofounderwithteam` + `teamleader` are now **confirmed** against our `respondent-levels.ts` taxonomy (the file's "best-guess" comment for these two is stale). The sample is synthetic test data (one `cfinetman` inbox split across 3 roles), so `+alias` emails defeat email-dedupe — harmless for real rosters.

## 3. Locked decisions

| # | Decision | Rationale |
|---|---|---|
| D1 | **Path A, identified, phased**: roster import (people) then results import (answers). | Identity now exists; per-person history is the point of the new files. |
| D2 | **Admin tool first** (`/admin/assessments/import`), staging-first; coach button is a later phase. | Migration-shaped backfill; crosswalk must be proven before coaches touch raw JSON. |
| D3 | **Owning coach is an explicit pick** of an **existing** `Coach` (never minted by the importer). `Organization.ownerCoachId` + `AssessmentCampaign.createdByCoachId` = chosen coach; `createdBy` (User FK) = the **admin operator**. | Honest audit of who ran the backfill; coach creation stays in `/admin/coaches`. Verified: coach portal lists campaigns by `createdByCoachId`, so this makes them visible to the coach. |
| D4 | **One Members file → one `Organization`, members attached directly** (`teamId=null`), no sub-team reconstruction. The operator-chosen **company name is the merge key**. | Export carries no team hierarchy (`level` is a role, not a team). |
| D5 | **Match & merge with preview** (idempotent): Organization by `(ownerCoach + normalizedName)`; members keyed `dedupeSource="external"`/`dedupeValue=memberid` (matching live), with a `normalizedEmail` fallback that backfills `externalId` onto hand-created rows. Re-runnable. | Coexists with hand-created Members & Teams data; safe re-runs; no split rows. |
| D6 | **`externalId = Esperto memberid`** is the cross-phase join key; results import **auto-resolves the target Org** by that join, **blocks** if the roster is absent, **skips** (never anonymizes) unresolved members. | The link already lives in the data; enforces Phase-1→Phase-2 dependency. |
| D7 | **Additive `AssessmentCampaign.externalId String? @unique`** (= the Esperto `campaignid`, stored **namespaced as `esperto:<campaignid>`** — see plan 12a), mirroring the `Organization.externalId` partial-unique pattern. DB-enforced re-import dedupe. | First-class provenance + idempotency guard; one safe additive column. |
| D8 | **Read `raw_` block**; build a single `[{stableKey, value}]` array for **all** types (mirroring the live submit route — value = the Esperto raw value); store it as `answers` **and** pass the **same** array to `scoreSubmission`. **Slider `0`/`""`/missing → omit**; drop empty TEXT. Rows missing a **required** answer import **partially** + flagged via a default-off `allowMissingRequired` scorer option (live path unchanged); never fabricated. | Live route stores/scores one `{stableKey,value}` array for every type (submit route L160); QSP slider `min:1` makes `0` out-of-band; `scoreSubmission` rejects missing-required across all types. |
| D9 | **Full chain reconstructed**: Participant (`teamPathAtAdd:[]`) + `SUBMITTED` Invitation (inert random `tokenHash`, `sentAt`=openAt, `submittedAt`=row date) + Submission. `isCEO` from CEO-family `roleType` under the **single-CEO guard** (0 or >1 ⇒ none). | First-class in every existing CampaignDetail view; no special-case rendering. |
| D10 | **Crosswalk-as-code** per template + variant **registry** + `locked` gate + **exhaustiveness guard** (unknown Esperto answer key = hard error). QSP `locked:true` after screenshot confirmation; Rockefeller/LVA stubs `locked:false`. | Integrity-critical map belongs in PR review/version control; unknown keys must fail loud. |
| D11 | **Preview is read-only; commit is one all-or-nothing transaction per file/campaign.** Skip (testuser/inactive/unresolved/empty) vs Block (malformed/crosswalk-unlocked/unpublished/unknown-key/no-Org) are sharply separated. | No half-imported campaigns; loud failures. |
| D12 | **Sanitized fixtures** (structure intact, identity faked); **gitignore `From Jeff/Exports/`**; pre-existing `From Jeff/` PDF leak flagged, not fixed here. | No real-PII in repo, per standing security posture. |
| D13 | **SU Full parked** — no path built; unblock recipe documented (§11). | Unpublished version + partial crosswalk + privacy-by-data. |

## 4. Architecture & data flow

A **staging-first admin tool** (ADMIN/STAFF only). Two independent steps (roster, then results), each: **Upload `.json` → Parse + Classify → read-only PREVIEW → Commit (one transaction)**.

```
lib/assessments/esperto-import/
  parse.ts            # raw JSON → typed Esperto shapes (members | report | restricted); zod-validated
  classify.ts         # detect export kind
  crosswalks/
    index.ts          # registry: espertoVariant | templateAlias → Crosswalk
    qsp-v2.ts          # locked:true  (after screenshot confirmation)
    rockefeller.ts     # locked:false (stub, gated on sample export)
    lva.ts             # locked:false (stub, gated on sample export)
  roster-plan.ts      # Members → RosterImportPlan (create/update/skip)
  results-plan.ts     # Report + roster join → ResultsImportPlan (campaign + chain)
  commit.ts           # apply a plan in one tx + AuditLog
  types.ts            # ImportPlan, Crosswalk, etc.
app/api/admin/assessments/import/route.ts   # POST {mode: "preview" | "commit"}; ADMIN/STAFF; rate-limited
app/(dashboard)/admin/assessments/import/page.tsx + components
```

The **parse/classify/plan** layer does **zero DB writes** and is fully unit-testable against fixtures. The **commit** layer is the only writer.

## 5. Phase 1 — Roster import

**Input:** Members JSON. **Output:** one `Organization` + N `OrgRespondent`s. Template-agnostic.

### 5.1 Field map & guards

| Esperto | Our `OrgRespondent` | Notes |
|---|---|---|
| `email` | `email` + `normalizedEmail` | normalized = lowercased + trimmed; dedupe driver. |
| `firstname` | `firstName` | |
| `lastname` | `lastName` | `"—"` fallback if ever empty (schema non-null). |
| `title` | `jobTitle` | Free-text function ("CFO", "Professional Services") — **not** roleType. |
| `level` | `roleType` | Esperto slug → our slug (confirmed: `ceofounderwithteam`, `teamleader`). Unknown slug → passthrough (legacy-tolerant). |
| `memberid` | `externalId` | Cross-phase join key. **`dedupeSource="external"`, `dedupeValue=memberid`** — matching the live respondents route (`externalId ? "external" : "email"`), so an import never creates a second row keyed differently from an app-created one. |
| `status` | — (gate) | Import `active`; skip/flag otherwise. |
| `testuser` | — (filter) | **Hard-exclude `true`.** |
| `middlename`, `extra` | — | Empty in sample; dropped. |

- **Match & merge (D5):** Organization by `(ownerCoachId + normalizedName)`. Member match checks **both** the `external`-keyed unique `(orgId,"external",memberid)` **and** `normalizedEmail` — a hand-created **email**-keyed row (no `externalId`) is matched by email and **backfilled** with the `externalId`, so the same person is never split into two rows. Existing → update/skip; new → create.
- **Hard ambiguity blocks** (Codex): a duplicate email within one file, or a `memberid` whose roster resolves to **>1 Organization** → block with a clear message — never a silent merge.
- **Preview:** company (matched vs new), per-member create/update/skip with reason, owning-coach picker (required), editable company name (default = filename minus `_Members`).

## 6. Phase 2 — Results import

**Input:** report JSON; **roster must already be imported.** **Output:** one Imported campaign + the full chain.

### 6.1 Target Org resolution (D6)
Join report `memberid`s → `OrgRespondent.externalId`. One Org → target (shown for confirm). Zero → **block** ("import roster first"). Row with no match → **skip** (unresolved member). Operator can override.

### 6.2 Imported campaign (D7, ADR-0006)
- **Preflight (Codex):** a **published, crosswalk-compatible** version must exist before anything commits — in prod QSP v2 is published, but the seed creates **DRAFT** versions, so in a fresh/dev env this blocks with "publish QSP v2 first." Not an assumption — an explicit gate.
- `templateId`/`versionId` via `resolvePublishedTemplateVersion(templateId, version.language)` — **honors the unpublished-version block** (SU Full throws here).
- `externalId` = **`esperto:<campaignid>`** (namespaced — single source of truth with plan 12a; the upsert selector, ADR-0006's marker check, and the rollback runbook all key off this exact value). `alias` = slug e.g. `imported-qsp-v2-bdvhudorxz`. `name` = operator-editable default. `status=CLOSED`, `accessMode=INVITED`, `endMode=OPEN_END`, `openAt`=earliest row date, `closeAt`=latest row date, `language`= the **pinned version's** language (Esperto `enUS` ignored).

### 6.3 Answer construction (D8) — mirror the live submit route exactly
**Corrected after Codex.** The importer builds answers **identically to** `org-survey/[campaignAlias]/submit/route.ts`: a single array `[{ stableKey, value }]` for **every** question type (value = the Esperto `raw_` value — a number for SLIDER/NUMBER, a string for TEXT), stored verbatim as `answers` JSON **and** passed unchanged to `scoreSubmission`. There is **no** `textValue`/`selectedKeys` shape — the live truth is `{stableKey, value}` (the route does `rawAnswers = answers.map(a => ({stableKey, value})); store rawAnswers; scoreSubmission(version, rawAnswers)`).
- **Coercion:** slider `0`/`""`/missing → **omit** the key (QSP slider `min:1`; `scoreSubmission` throws `OUT_OF_RANGE` on `value<min`; omitting an *optional* slider lands it in `unansweredKeys`). Empty TEXT → omit.
- **Missing-required policy (import partially, don't discard):** `scoreSubmission` collects `missingRequired` across **all** types and rejects when non-empty (scoring.ts ~L1175–1200). Historical data may lack a now-required answer (QSP has 13 required of 22). Rather than drop a real past submission, add an **`allowMissingRequired` option to `scoreSubmission` (default `false` → live path byte-for-byte unchanged)**; the importer passes `true`, routing missing-required keys into `unansweredKeys` instead of throwing. The row imports **partially** with whatever answers exist; the preview **flags** it ("imported with N missing fields"). We **never fabricate** an answer. Safe for QSP (aggregation-only — a partial mean has no tiers/bands to corrupt). **Per-template nuance:** for future *scored* templates a missing item shifts the tier, so surface the gap prominently (or default those to skip-incomplete) — decided per template at lock time. A row with **zero** scorable sliders → neutral result (no `scoreSubmission` call), still imported + flagged.
- `result` = `scoreSubmission(pinnedVersion, answers)` over that same array — byte-identical to how native QSP submissions are scored (single covering tier `overallAvg [1,10]` "Submitted").

### 6.4 Full chain (D9) & idempotency
Per resolved respondent, in one transaction (invitation **before** submission): `AssessmentCampaignParticipant` (`teamPathAtAdd:[]`, `isCEO` per single-CEO guard) → `AssessmentInvitation` (`SUBMITTED`, random `tokenHash`, `sentAt`=openAt, `submittedAt`=row date, `expiresAt`=closeAt) → `AssessmentSubmission` (linked).
**Re-import upsert keys — Prisma-targetable only (Codex):** campaign by `externalId` (`@unique`); participant + invitation by their Prisma `@@unique([campaignId, respondentId])`; **submission by `invitationId`** (`@unique`) — **not** by `(campaignId, respondentId)`, which exists only as a raw-SQL partial index that Prisma's `upsert` cannot target. Update-in-place, no duplicates.

### 6.5 Report metadata, roles & multi-campaign files
- **Metadata is enumerated, mostly ignored:** `date`→`submittedAt`, `memberid`→roster join, `campaignid`→campaign `externalId`, `variant`→template attribution; the rest (`reportid`, `name`, `status`, `tags`, `language`, `testcase`, `groupid`, `token`, `config`, `extra_member`) is dropped. An unrecognized metadata field → **warn + log**, not block.
- **`specialparticipant` / Esperto buyer-seller role → dropped.** It drives Esperto conditional question display; our QSP v2 has no conditional logic (v1.5 disabled — every question applies to everyone), so it never changes our mapping.
- **Multi-campaign files → group, don't block.** Group `personal[]` rows by `campaignid`; create **one Imported campaign per distinct `campaignid`** (each its own `externalId`), all surfaced in the preview.

## 7. Crosswalk module (D10)

```ts
interface Crosswalk {
  templateAlias: string;          // "quarterly-session-prep-v2"
  espertoVariant: string | null;  // "QuartSessPrepv2" | null (SU Full has none in-file)
  locked: boolean;                // false ⇒ results import refused for this template
  map: { espertoKey: string; stableKey: string; ourType: "SLIDER_LIKERT"|"NUMBER"|"TEXT"|"MULTI_CHOICE" }[];
  droppedKeys: { key: string; reason: string }[];  // every export key not mapped MUST appear here
}
```
- **Registry** keyed by `espertoVariant` (QSP self-identifies) or operator-selected template.
- **Exhaustiveness guard (answer keys only):** every per-respondent **answer** key (`raw_Q*`) is mapped or in `droppedKeys`; an unrecognized **answer** key → hard error. Report-level **metadata** is a separate enumerated set (§6.5) — an unrecognized metadata field warns+logs, never blocks.
- **Pinned-version compatibility — type/scale, not just key existence (Codex):** the campaign pins the **latest published** version (`resolvePublishedTemplateVersion`), and every mapped `stableKey` must exist in it **and** match `ourType` (+ slider `scale`, + multi `options`). Published QSP versions have been mutated by scripts including **type changes** (`scripts/patch-qsp-v2-text-to-slider.ts` converts TEXT→SLIDER, same key), which is exactly the drift key-existence-only validation would miss. Because **ADR-0001** guarantees a `stableKey` never refers to a different question across versions, **`key exists + type + scale` is a *complete* compatibility check** — no `contentHash`/fingerprint bookkeeping needed. Any type/scale mismatch → block ("published QSP v2 incompatible with the locked crosswalk: key X is now type Y").
- **QSP v2** (`map` = the 22 pairs from the §2 analysis; `droppedKeys` = `Q3_5`, `Q6a/Q7a/Q8a/Q11a`, `Q16`). `locked:true` only after the ~8 ambiguous orderings (slider matrix `Q3_1..Q3_6→Q3_4,Q3_6`, START/STOP/CONTINUE `Q6/Q7/Q8`, P4 `Q14/Q15`) are confirmed against the seed screenshots (`image9-22`).

## 8. Safety & constraints
- 🔒 **No emails, ever.** Imported invitations/campaigns are created directly via Prisma in `SUBMITTED`/`CLOSED` state and never enter the explicit "send invitations" path. Asserted by test.
- **Route-side guard (defense-in-depth, Codex):** the invite/send route (`api/assessment-campaigns/[id]/invite`) has **no campaign-status gate** today (it keys only off prior-invitation status). Add a guard that refuses `status==="CLOSED"` (and/or `externalId != null`) campaigns, so an imported campaign can never send even if a stray non-`SUBMITTED` invitation somehow existed. (The *submit* route already gates on `status==="ACTIVE"`.)
- **Atomic commit** per file/campaign (D11); read-only preview.
- **Staging-first**; nothing visible until the operator commits.
- **Published-version immutability** untouched; SU Full stays DRAFT (D13).
- **Audit:** an `AuditLog` row per commit (operator, coach, org, counts, source filename, Esperto ids).
- **PII/fixtures** (D12): sanitized fixtures; `From Jeff/Exports/` gitignored.
- Standing security practice: ADMIN/STAFF auth check, Zod at the boundary, rate-limit, no secrets in logs.

## 9. SU Full — parked (D13) + unblock recipe
Blocked by: (a) version unpublished by design; (b) only 4/10 question-families confidently mapped; (c) only the CEO's individual answers exist (team is lossy aggregate). **To unblock later:** Esperto's real weighting formula → publish a corrected SU Full version → label-confirm the 6 ambiguous families ({Q6,Q10} 6-item, {Q5,Q7,Q9,Q11} 5-item) → model as **one identified CEO submission + one aggregate-only (`respondentId`/`invitationId` null) record** carrying the `group*` numbers wrapped in a **`ScoreResult`-shaped envelope** (filling `countAchieved`/`overallTotal`/`overallAverage`, verbatim Esperto numbers in a namespaced sub-object) so it stays visible to `aggregate-report.ts`/`trends.ts` (which gate on `isScoreResult` and never recompute). Do **not** import the Aggregate file as a second submission (its `raw` == the CEO's own).

## 10. Migration
Single additive, nullable, non-destructive column: `AssessmentCampaign.externalId String?` + partial-unique `WHERE externalId IS NOT NULL` via raw SQL (mirroring `Organization`). Safe under the build-gate migration guard. No other schema changes.
- **Verification test required (Codex):** `scripts/check-migration-safety.mjs` only scans for *destructive* SQL — it does **not** prove the raw partial index is correct. Add a test asserting the index behaves: rejects a duplicate non-null `externalId`, allows multiple `NULL`s.

## 11. Risks & open verifications (carry into the plan)
1. **Seed-vs-published drift incl. TYPE changes (Codex)** — published QSP versions have been mutated by scripts (`patch-qsp-v2-text-to-slider.ts`), so a `stableKey` can exist with a *different type* than the seed. The crosswalk is validated against the **pinned (latest-published) version's** type/scale (§7), not just key existence. ADR-0001 (stableKey continuity) makes `key+type+scale` a complete check, so **no `contentHash` pin is needed**; a type/scale mismatch blocks the import. Author/lock the crosswalk against the pinned version's actual questions, not the seed.
2. **QSP ambiguous orderings** — the 8 medium-confidence bindings need screenshot confirmation before `locked:true`.
3. **Full-chain upsert (Codex)** — re-run must update across 4 entities; submission upserts by `invitationId` (Prisma `@unique`), not the raw-SQL `(campaignId,respondentId)` partial index. Idempotency test required.
4. **Historical incompleteness (Codex)** — `scoreSubmission` rejects missing-**required** answers across all types; real exports may lack a now-required answer (QSP: 13 required of 22). Policy (§6.3): import **partially** via a default-off `allowMissingRequired` scorer option + preview flag (QSP aggregation-only → safe; scored templates surface the gap prominently when they come online). Zero-scorable-slider rows → neutral result, still imported + flagged. The added scorer option must have a test proving the live default (`false`) is unchanged.
5. **Dedupe convention (Codex)** — imports must key `dedupeSource="external"`/`dedupeValue=memberid` (matching live), and the merge must also match `normalizedEmail` + backfill `externalId` so hand-created rows aren't split. Synthetic fixtures (`+alias`/shared-stem `cfinetman` emails) won't collapse under email-dedupe — assert the *real* convention, not the fixture artifact.

## 12. Testing (TDD)
- **Unit:** parse/classify; crosswalk exhaustiveness + the 22 QSP mappings; value coercion (`0`→unanswered, empty TEXT dropped); identity/level map; dedupe/merge idempotency; single-CEO guard.
- **Integration (sanitized fixtures):** full parse→preview→commit for a roster; full parse→preview→commit for a QSP results import; re-run = no duplicates.
- **Guard tests:** no-email assertion; unknown-Esperto-key → block; unpublished version (SU Full) → block; unresolved member → skip; crosswalk `stableKey` not in pinned version → block.

## 13. Build order (for writing-plans)
1. Migration: `AssessmentCampaign.externalId` (+ partial-unique index) **+ index-behavior verification test**.
2. Route-side **no-email guard**: invite/send route refuses `status==="CLOSED"` campaigns (+ test).
3. `parse.ts` + `classify.ts` + types + sanitized fixtures.
4. Crosswalk module + registry + exhaustiveness guard + **pinned-version type/scale validation** + QSP v2 map (locked after screenshot confirm).
5. Roster: `roster-plan.ts` (dedupe `external`+email backfill, ambiguity blocks) + commit + admin preview/commit route + page.
6. Results: `scoreSubmission` `allowMissingRequired` option (default-off + unchanged-default test); `results-plan.ts` (published-version **preflight**, target-Org resolve, campaign reconstruction, live-shape answer construction + missing-required partial+flag, full chain, upsert-by-`invitationId`) + commit.
7. Admin UI polish (preview tables, owning-coach picker, error/skip surfacing).
8. End-to-end fixture integration + guard tests (no-email, unknown-key block, unpublished block, re-run no-dupe, incomplete-row skip).

## 14. Out of scope / follow-ups
- Coach-facing self-service import button (later phase).
- Rockefeller + LVA crosswalks (stubs `locked:false`; need Jeff's sample exports to author + confirm).
- SU Full import (parked — §9).
- **Pre-existing `From Jeff/` committed PII — NOT resolved by this PR (greptile P1/security).** 50+ files are *already in git history* under `From Jeff/APP_scaling up assessemnt/`, `From Jeff/re/`, `From Jeff/May5-7/` — named individual reports ("HR Kathy…", "CEO John…"), a contractor invoice, and email-thread PDFs. The broadened `.gitignore` only prevents *future* additions; the committed PII requires a **`git filter-repo` history scrub** (excluding the wanted `style-guide/`). This is a deliberate, history-rewriting operator action (risky on shared history) tracked as **GitHub issue #40** — do not assume the gitignore change cleared it.
- Esperto firmographic/demographic data (Q1/Q2/Q13 families, age/gender) — no home in our instrument; dropped.
